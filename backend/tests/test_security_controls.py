"""Regression tests for security-sensitive helpers."""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from dotenv import load_dotenv
from fastapi import HTTPException
from starlette.applications import Starlette
from starlette.responses import HTMLResponse, JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(ROOT_DIR / ".env", override=True)

from app.core.security import validate_secret_strength
from app.core.cache import _describe_redis_url
from app.core import rate_limit as rate_limit_module
from app.core.deps import _enforce_demo_read_only
from app.core.middleware import SecurityHeadersMiddleware
from app.modules.chat.routes import _get_authorized_session, _hash_chat_access_token
from app.modules.chat.schemas import ChatMessageCreate, ChatSessionCreate
from pydantic import ValidationError


class SecurityControlTests(unittest.TestCase):
    def test_public_demo_accounts_are_read_only(self) -> None:
        user = SimpleNamespace(email="admin_demo@gmail.com")
        get_request = MagicMock(method="GET")
        patch_request = MagicMock(method="PATCH")

        _enforce_demo_read_only(get_request, user)
        with self.assertRaises(HTTPException) as context:
            _enforce_demo_read_only(patch_request, user)
        self.assertEqual(context.exception.status_code, 403)
        self.assertEqual(context.exception.detail, "Demo account is read-only.")

    def test_regular_accounts_are_not_forced_read_only(self) -> None:
        user = SimpleNamespace(email="admin@gmail.com")
        _enforce_demo_read_only(MagicMock(method="DELETE"), user)

    def test_security_headers_allow_docs_assets_but_keep_api_csp_strict(self) -> None:
        app = Starlette(
            routes=[
                Route("/docs", lambda _request: HTMLResponse("<html></html>")),
                Route("/api/test", lambda _request: JSONResponse({"ok": True})),
            ]
        )
        app.add_middleware(SecurityHeadersMiddleware, enable_hsts=False)

        with TestClient(app) as client:
            docs_csp = client.get("/docs").headers["content-security-policy"]
            api_csp = client.get("/api/test").headers["content-security-policy"]

        self.assertIn("https://cdn.jsdelivr.net", docs_csp)
        self.assertIn("script-src", docs_csp)
        self.assertEqual(
            api_csp,
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        )

    def test_redis_dependency_is_detected(self) -> None:
        self.assertTrue(rate_limit_module.REDIS_AVAILABLE)

    def test_redis_log_target_does_not_expose_credentials(self) -> None:
        target = _describe_redis_url("rediss://app:super-secret@redis.internal:6380/2")
        self.assertEqual(target, "rediss://redis.internal:6380/2")
        self.assertNotIn("super-secret", target)

    def test_readiness_requires_redis_ping_when_enabled(self) -> None:
        client = MagicMock()
        client.ping.side_effect = ConnectionError("unavailable")
        with (
            patch.dict(os.environ, {"REQUIRE_REDIS_RATE_LIMIT": "true"}),
            patch.object(rate_limit_module, "_get_redis_client", return_value=client),
        ):
            with self.assertRaises(RuntimeError):
                rate_limit_module.ensure_rate_limit_ready()

    def test_secret_strength_rejects_known_and_repeated_values(self) -> None:
        with self.assertRaises(RuntimeError):
            validate_secret_strength("Admin@Secure2026!", name="TEST_SECRET", min_length=12)
        with self.assertRaises(RuntimeError):
            validate_secret_strength("abcd" * 12, name="TEST_SECRET")

    def test_secret_strength_accepts_high_entropy_value(self) -> None:
        secret = "f7Q!z2Lm9#pR4xV8nC3sK6wT1yU5aD0g"
        self.assertEqual(validate_secret_strength(secret, name="TEST_SECRET"), secret)

    def test_guest_chat_session_requires_matching_token(self) -> None:
        access_token = "guest-chat-token"
        session = SimpleNamespace(
            id=7,
            user_id=None,
            access_token_hash=_hash_chat_access_token(access_token),
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = session

        self.assertIs(_get_authorized_session(db, 7, None, access_token), session)
        with self.assertRaises(HTTPException) as context:
            _get_authorized_session(db, 7, None, "wrong-token")
        self.assertEqual(context.exception.status_code, 403)

    def test_user_chat_session_requires_owner(self) -> None:
        session = SimpleNamespace(id=8, user_id=42, access_token_hash=None)
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = session

        self.assertIs(_get_authorized_session(db, 8, SimpleNamespace(id=42), None), session)
        with self.assertRaises(HTTPException) as context:
            _get_authorized_session(db, 8, SimpleNamespace(id=41), None)
        self.assertEqual(context.exception.status_code, 403)

    def test_chat_payload_limits(self) -> None:
        with self.assertRaises(ValidationError):
            ChatSessionCreate(source="untrusted")
        with self.assertRaises(ValidationError):
            ChatMessageCreate(session_id=1, message_content="x" * 4001)

    def test_required_redis_rate_limit_fails_closed_on_startup(self) -> None:
        client = MagicMock()
        client.ping.side_effect = ConnectionError("unavailable")

        with (
            patch.dict(
                os.environ,
                {
                    "REDIS_URL": "redis://unavailable:6379/0",
                    "REQUIRE_REDIS_RATE_LIMIT": "true",
                },
            ),
            patch.object(rate_limit_module, "_REDIS_INIT_ATTEMPTED", False),
            patch.object(rate_limit_module, "_REDIS_CLIENT", None),
            patch.object(rate_limit_module, "REDIS_AVAILABLE", True),
            patch.object(rate_limit_module.redis.Redis, "from_url", return_value=client),
        ):
            with self.assertRaises(RuntimeError):
                rate_limit_module._get_redis_client()

    def test_required_redis_rate_limit_fails_closed_during_request(self) -> None:
        limiter = rate_limit_module.RedisRateLimiter.__new__(rate_limit_module.RedisRateLimiter)
        limiter.client = MagicMock()
        limiter.client.incr.side_effect = ConnectionError("unavailable")
        limiter.requests_limit = 5
        limiter.window_seconds = 60
        limiter.namespace = "test"
        limiter._fallback_records = {}
        limiter._fallback_lock = MagicMock()

        with patch.dict(os.environ, {"REQUIRE_REDIS_RATE_LIMIT": "true"}):
            with self.assertRaises(HTTPException) as context:
                limiter._check_redis("127.0.0.1", "/test")
        self.assertEqual(context.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
