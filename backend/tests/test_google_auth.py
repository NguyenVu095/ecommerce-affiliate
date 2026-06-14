"""Regression tests for Google customer sign-in."""

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from dotenv import load_dotenv
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(ROOT_DIR / ".env", override=True)

from app.db.database import Base
from app.modules.user.models import User
from app.modules.user.routes import _google_verification_error_detail, _verify_google_credential, google_login
from app.modules.user.schemas import GoogleLogin


class GoogleAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    @staticmethod
    def claims(**overrides: object) -> dict:
        values = {
            "sub": "google-user-123",
            "email": "customer@example.com",
            "email_verified": True,
            "name": "Google Customer",
            "picture": "https://lh3.googleusercontent.com/avatar.jpg",
        }
        values.update(overrides)
        return values

    def test_google_login_creates_customer_and_returns_access_token(self) -> None:
        with patch("app.modules.user.routes._verify_google_credential", return_value=self.claims()):
            token = google_login(GoogleLogin(credential="credential"), self.db)

        user = self.db.query(User).filter(User.google_id == "google-user-123").one()
        self.assertEqual(user.email, "customer@example.com")
        self.assertEqual(user.auth_provider, "google")
        self.assertEqual(user.role, 0)
        self.assertIsNone(user.password)
        self.assertTrue(token.access_token)

    def test_google_login_links_existing_local_account(self) -> None:
        user = User(
            email="customer@gmail.com",
            full_name="Local Customer",
            password="existing-password-hash",
            auth_provider="local",
            role=0,
            status=1,
        )
        self.db.add(user)
        self.db.commit()

        with patch(
            "app.modules.user.routes._verify_google_credential",
            return_value=self.claims(email="customer@gmail.com"),
        ):
            google_login(GoogleLogin(credential="credential"), self.db)

        self.db.refresh(user)
        self.assertEqual(user.google_id, "google-user-123")
        self.assertEqual(user.auth_provider, "google")
        self.assertEqual(user.password, "existing-password-hash")

    def test_google_login_does_not_auto_link_third_party_email(self) -> None:
        self.db.add(
            User(
                email="customer@example.com",
                full_name="Local Customer",
                password="existing-password-hash",
                auth_provider="local",
                role=0,
                status=1,
            )
        )
        self.db.commit()

        with (
            patch("app.modules.user.routes._verify_google_credential", return_value=self.claims()),
            self.assertRaises(HTTPException) as context,
        ):
            google_login(GoogleLogin(credential="credential"), self.db)

        self.assertEqual(context.exception.status_code, 409)

    def test_google_login_rejects_locked_account(self) -> None:
        self.db.add(
            User(
                email="customer@example.com",
                full_name="Locked Customer",
                auth_provider="local",
                role=0,
                status=0,
            )
        )
        self.db.commit()

        with (
            patch("app.modules.user.routes._verify_google_credential", return_value=self.claims()),
            self.assertRaises(HTTPException) as context,
        ):
            google_login(GoogleLogin(credential="credential"), self.db)

        self.assertEqual(context.exception.status_code, 403)

    def test_invalid_google_credential_is_rejected(self) -> None:
        with (
            patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "123.apps.googleusercontent.com"}),
            patch("app.modules.user.routes.id_token.verify_oauth2_token", side_effect=ValueError("invalid")),
            self.assertRaises(HTTPException) as context,
        ):
            _verify_google_credential("invalid-credential")

        self.assertEqual(context.exception.status_code, 401)

    def test_google_credential_is_trimmed_and_allows_small_clock_skew(self) -> None:
        claims = self.claims(email="customer@gmail.com")
        with (
            patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "123.apps.googleusercontent.com"}),
            patch("app.modules.user.routes.id_token.verify_oauth2_token", return_value=claims) as verify,
        ):
            result = _verify_google_credential("  credential  ")

        self.assertEqual(result, claims)
        self.assertEqual(verify.call_args.args[0], "credential")
        self.assertEqual(verify.call_args.args[2], "123.apps.googleusercontent.com")
        self.assertEqual(verify.call_args.kwargs["clock_skew_in_seconds"], 60)

    def test_google_verification_errors_are_safely_classified(self) -> None:
        self.assertIn("Client ID", _google_verification_error_detail(ValueError("Token has wrong audience private")))
        self.assertIn("server clock", _google_verification_error_detail(ValueError("Token used too early")))
        self.assertEqual(_google_verification_error_detail(ValueError("Could not verify token signature.")), "Invalid Google credential.")


if __name__ == "__main__":
    unittest.main()
