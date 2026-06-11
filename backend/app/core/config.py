"""Runtime configuration validation for production deployments."""

import os
from collections.abc import Mapping
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()

_TRUE_VALUES = {"1", "true", "yes", "on"}
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "testserver"}


def _is_true(value: str | None) -> bool:
    return (value or "").strip().lower() in _TRUE_VALUES


def is_production(env: Mapping[str, str] | None = None) -> bool:
    values = env or os.environ
    return values.get("APP_ENV", "development").strip().lower() == "production"


def _is_public_https_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme == "https" and bool(parsed.hostname) and parsed.hostname not in _LOCAL_HOSTS


def validate_runtime_config(env: Mapping[str, str] | None = None) -> None:
    """Fail fast when a production process is started with unsafe settings."""
    values = env or os.environ
    if not is_production(values):
        return

    errors: list[str] = []
    database_url = values.get("DATABASE_URL", "").strip()
    if not database_url or database_url.startswith("sqlite"):
        errors.append("DATABASE_URL must use a production database, not SQLite")

    if _is_true(values.get("AUTO_CREATE_SCHEMA")):
        errors.append("AUTO_CREATE_SCHEMA must be false; use Alembic migrations")

    allowed_hosts = [host.strip() for host in values.get("ALLOWED_HOSTS", "").split(",") if host.strip()]
    if not allowed_hosts or "*" in allowed_hosts or any(host in _LOCAL_HOSTS for host in allowed_hosts):
        errors.append("ALLOWED_HOSTS must contain only explicit public hostnames")

    origins = [origin.strip() for origin in values.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()]
    if not origins or any(not _is_public_https_url(origin) for origin in origins):
        errors.append("ALLOWED_ORIGINS must contain only explicit public HTTPS URLs")

    if not _is_public_https_url(values.get("CUSTOMER_APP_URL", "").strip()):
        errors.append("CUSTOMER_APP_URL must be a public HTTPS URL")

    redis_url = values.get("REDIS_URL", "").strip()
    if not redis_url or not redis_url.startswith(("redis://", "rediss://")):
        errors.append("REDIS_URL must be configured")
    if not _is_true(values.get("REQUIRE_REDIS_RATE_LIMIT")):
        errors.append("REQUIRE_REDIS_RATE_LIMIT must be true")
    if not _is_true(values.get("ENABLE_HSTS")):
        errors.append("ENABLE_HSTS must be true")
    if not values.get("JWT_AUDIENCE", "").strip():
        errors.append("JWT_AUDIENCE must be configured")

    if errors:
        raise RuntimeError("Unsafe production configuration:\n- " + "\n- ".join(errors))
