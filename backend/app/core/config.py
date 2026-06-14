"""Runtime configuration validation for production deployments."""

import os
from collections.abc import Mapping
from ipaddress import ip_address
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()

_TRUE_VALUES = {"1", "true", "yes", "on"}
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "testserver"}
_PLACEHOLDER_MARKERS = {"example.com", "example.org", "example.net", "replace-me"}
_RESERVED_HOST_SUFFIXES = (".example", ".invalid", ".test", ".localhost")
_GOOGLE_CLIENT_ID_SUFFIX = ".apps.googleusercontent.com"


def _is_true(value: str | None) -> bool:
    return (value or "").strip().lower() in _TRUE_VALUES


def is_production(env: Mapping[str, str] | None = None) -> bool:
    values = env or os.environ
    return values.get("APP_ENV", "development").strip().lower() == "production"


def _is_public_https_url(value: str) -> bool:
    parsed = urlparse(value)
    return (
        parsed.scheme == "https"
        and bool(parsed.hostname)
        and parsed.hostname not in _LOCAL_HOSTS
        and not parsed.hostname.endswith(".localhost")
    )


def _contains_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    parsed = urlparse(normalized if "://" in normalized else f"//{normalized}")
    hostname = parsed.hostname or ""
    return (
        any(marker in normalized for marker in _PLACEHOLDER_MARKERS)
        or hostname in {"example", "invalid", "test"}
        or hostname.endswith(_RESERVED_HOST_SUFFIXES)
    )


def _is_positive_int(value: str) -> bool:
    try:
        return int(value) > 0
    except (TypeError, ValueError):
        return False


def _is_public_ip_address(value: str) -> bool:
    try:
        return ip_address(value).is_global
    except ValueError:
        return False


def _is_google_client_id(value: str) -> bool:
    normalized = value.strip()
    return (
        normalized.endswith(_GOOGLE_CLIENT_ID_SUFFIX)
        and len(normalized) > len(_GOOGLE_CLIENT_ID_SUFFIX)
        and not _contains_placeholder(normalized)
    )


def validate_runtime_config(env: Mapping[str, str] | None = None) -> None:
    """Fail fast when a production process is started with unsafe settings."""
    values = env or os.environ
    if not is_production(values):
        return

    errors: list[str] = []
    database_url = values.get("DATABASE_URL", "").strip()
    if not database_url or database_url.startswith("sqlite"):
        errors.append("DATABASE_URL must use a production database, not SQLite")
    elif urlparse(database_url).scheme not in {"postgresql", "postgresql+psycopg2"}:
        errors.append("DATABASE_URL must use PostgreSQL")
    elif _contains_placeholder(database_url):
        errors.append("DATABASE_URL must not contain placeholder credentials or hosts")

    if _is_true(values.get("AUTO_CREATE_SCHEMA")):
        errors.append("AUTO_CREATE_SCHEMA must be false; use Alembic migrations")

    allowed_hosts = [host.strip() for host in values.get("ALLOWED_HOSTS", "").split(",") if host.strip()]
    if (
        not allowed_hosts
        or "*" in allowed_hosts
        or any(host in _LOCAL_HOSTS or _contains_placeholder(host) for host in allowed_hosts)
    ):
        errors.append("ALLOWED_HOSTS must contain only explicit public hostnames")

    origins = [origin.strip() for origin in values.get("ALLOWED_ORIGINS", "").split(",") if origin.strip()]
    if not origins or any(not _is_public_https_url(origin) or _contains_placeholder(origin) for origin in origins):
        errors.append("ALLOWED_ORIGINS must contain only explicit public HTTPS URLs")

    customer_app_url = values.get("CUSTOMER_APP_URL", "").strip()
    if not _is_public_https_url(customer_app_url) or _contains_placeholder(customer_app_url):
        errors.append("CUSTOMER_APP_URL must be a public HTTPS URL")

    redis_url = values.get("REDIS_URL", "").strip()
    if not redis_url or not redis_url.startswith(("redis://", "rediss://")):
        errors.append("REDIS_URL must be configured")
    elif urlparse(redis_url).hostname in _LOCAL_HOSTS or _contains_placeholder(redis_url):
        errors.append("REDIS_URL must not use a local or placeholder host")
    if not _is_true(values.get("REQUIRE_REDIS_RATE_LIMIT")):
        errors.append("REQUIRE_REDIS_RATE_LIMIT must be true")
    if not _is_true(values.get("TRUST_PROXY_HEADERS")):
        errors.append("TRUST_PROXY_HEADERS must be true")
    if not _is_true(values.get("ENABLE_HSTS")):
        errors.append("ENABLE_HSTS must be true")
    if not values.get("JWT_ISSUER", "").strip():
        errors.append("JWT_ISSUER must be configured")
    if not values.get("JWT_AUDIENCE", "").strip():
        errors.append("JWT_AUDIENCE must be configured")
    if not _is_positive_int(values.get("JWT_EXPIRE_MINUTES", "").strip()):
        errors.append("JWT_EXPIRE_MINUTES must be a positive integer")
    if not _is_google_client_id(values.get("GOOGLE_CLIENT_ID", "")):
        errors.append("GOOGLE_CLIENT_ID must be a valid Google OAuth Web client ID")
    vnpay_enabled = _is_true(values.get("VNPAY_ENABLED"))
    if _is_true(values.get("VNPAY_MOCK_ENABLED")):
        errors.append("VNPAY_MOCK_ENABLED must be false in production")
    if vnpay_enabled:
        for name in ("VNPAY_TMN_CODE", "VNPAY_HASH_SECRET"):
            value = values.get(name, "").strip()
            if not value or _contains_placeholder(value):
                errors.append(f"{name} must be configured when VNPAY_ENABLED=true")
        tmn_code = values.get("VNPAY_TMN_CODE", "").strip()
        if len(tmn_code) != 8 or not tmn_code.isalnum():
            errors.append("VNPAY_TMN_CODE must be an 8-character alphanumeric merchant code")
        vnpay_url = values.get("VNPAY_URL", "").strip()
        parsed_vnpay_url = urlparse(vnpay_url)
        if (
            not _is_public_https_url(vnpay_url)
            or not parsed_vnpay_url.hostname
            or parsed_vnpay_url.hostname == "sandbox.vnpayment.vn"
            or not (
                parsed_vnpay_url.hostname == "vnpay.vn"
                or parsed_vnpay_url.hostname.endswith(".vnpay.vn")
            )
            or not parsed_vnpay_url.path.endswith("/vpcpay.html")
        ):
            errors.append("VNPAY_URL must use the production VNPay gateway")
        vnpay_api_url = values.get("VNPAY_API_URL", "").strip()
        parsed_api_url = urlparse(vnpay_api_url)
        if (
            not _is_public_https_url(vnpay_api_url)
            or not parsed_api_url.hostname
            or parsed_api_url.hostname == "sandbox.vnpayment.vn"
            or not (
                parsed_api_url.hostname == "vnpay.vn"
                or parsed_api_url.hostname.endswith(".vnpay.vn")
            )
            or parsed_api_url.path.rstrip("/") != "/merchant_webapi/api/transaction"
        ):
            errors.append("VNPAY_API_URL must use the production VNPay merchant API")
        if not _is_public_ip_address(values.get("VNPAY_API_IP_ADDRESS", "").strip()):
            errors.append("VNPAY_API_IP_ADDRESS must be the server outbound IP registered with VNPay")
        for name, expected_path in (
            ("VNPAY_RETURN_URL", "/api/orders/vnpay-return"),
            ("VNPAY_IPN_URL", "/api/orders/vnpay-ipn"),
        ):
            callback_url = values.get(name, "").strip()
            parsed_callback = urlparse(callback_url)
            if (
                not _is_public_https_url(callback_url)
                or _contains_placeholder(callback_url)
                or parsed_callback.hostname not in allowed_hosts
                or parsed_callback.path.rstrip("/") != expected_path
            ):
                errors.append(f"{name} must be the public API HTTPS URL ending in {expected_path}")
        if not _is_positive_int(values.get("VNPAY_PAYMENT_EXPIRY_MINUTES", "").strip()):
            errors.append("VNPAY_PAYMENT_EXPIRY_MINUTES must be a positive integer")
        if not _is_positive_int(values.get("VNPAY_REQUEST_TIMEOUT_SECONDS", "").strip()):
            errors.append("VNPAY_REQUEST_TIMEOUT_SECONDS must be a positive integer")

    ghn_api_url = values.get("GHN_API_URL", "").strip()
    if (
        not _is_public_https_url(ghn_api_url)
        or urlparse(ghn_api_url).hostname != "online-gateway.ghn.vn"
        or _contains_placeholder(ghn_api_url)
    ):
        errors.append("GHN_API_URL must use the production HTTPS gateway")
    for name in ("GHN_TOKEN", "GHN_SHOP_WARD_CODE"):
        value = values.get(name, "").strip()
        if not value or _contains_placeholder(value):
            errors.append(f"{name} must be configured")
    if not _is_positive_int(values.get("GHN_SHOP_ID", "").strip()):
        errors.append("GHN_SHOP_ID must be a positive integer")
    if not _is_positive_int(values.get("GHN_SHOP_DISTRICT_ID", "").strip()):
        errors.append("GHN_SHOP_DISTRICT_ID must be a positive integer")

    if errors:
        raise RuntimeError("Unsafe production configuration:\n- " + "\n- ".join(errors))
