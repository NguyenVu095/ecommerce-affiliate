"""Tests for production runtime configuration validation."""

import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import validate_runtime_config


def production_config(**overrides: str) -> dict[str, str]:
    values = {
        "APP_ENV": "production",
        "DATABASE_URL": "postgresql://app:secret@db.internal.company/ecommerce",
        "AUTO_CREATE_SCHEMA": "false",
        "ALLOWED_HOSTS": "api.company.vn",
        "ALLOWED_ORIGINS": "https://shop.company.vn,https://admin.company.vn",
        "CUSTOMER_APP_URL": "https://shop.company.vn",
        "REDIS_URL": "redis://redis:6379/0",
        "REQUIRE_REDIS_RATE_LIMIT": "true",
        "TRUST_PROXY_HEADERS": "true",
        "ENABLE_HSTS": "true",
        "JWT_EXPIRE_MINUTES": "60",
        "JWT_ISSUER": "ecommerce-affiliate-api",
        "JWT_AUDIENCE": "ecommerce-web",
        "GOOGLE_CLIENT_ID": "1234567890-production.apps.googleusercontent.com",
        "VNPAY_ENABLED": "false",
        "VNPAY_MOCK_ENABLED": "false",
        "GHN_API_URL": "https://online-gateway.ghn.vn/shiip/public-api",
        "GHN_TOKEN": "production-ghn-token",
        "GHN_SHOP_ID": "123456",
        "GHN_SHOP_DISTRICT_ID": "1442",
        "GHN_SHOP_WARD_CODE": "20109",
    }
    values.update(overrides)
    return values


class RuntimeConfigTests(unittest.TestCase):
    def test_valid_production_config_passes(self) -> None:
        validate_runtime_config(production_config())

    def test_enabled_vnpay_requires_production_credentials(self) -> None:
        validate_runtime_config(
            production_config(
                VNPAY_ENABLED="true",
                VNPAY_TMN_CODE="PROD0001",
                VNPAY_URL="https://pay.vnpay.vn/vpcpay.html",
                VNPAY_API_URL="https://merchant.vnpay.vn/merchant_webapi/api/transaction",
                VNPAY_API_IP_ADDRESS="8.8.8.8",
                VNPAY_RETURN_URL="https://api.company.vn/api/orders/vnpay-return",
                VNPAY_IPN_URL="https://api.company.vn/api/orders/vnpay-ipn",
                VNPAY_PAYMENT_EXPIRY_MINUTES="15",
                VNPAY_REQUEST_TIMEOUT_SECONDS="10",
                VNPAY_HASH_SECRET="production-vnpay-hash-secret",
            )
        )

    def test_development_config_is_not_restricted(self) -> None:
        validate_runtime_config({"APP_ENV": "development"})

    def test_local_or_incomplete_production_config_fails(self) -> None:
        with self.assertRaises(RuntimeError) as context:
            validate_runtime_config(
                production_config(
                    DATABASE_URL="sqlite:///local.db",
                    ALLOWED_HOSTS="localhost",
                    ALLOWED_ORIGINS="http://localhost:5173",
                    CUSTOMER_APP_URL="http://localhost:5173",
                    REDIS_URL="",
                    REQUIRE_REDIS_RATE_LIMIT="false",
                    TRUST_PROXY_HEADERS="false",
                    ENABLE_HSTS="false",
                    JWT_EXPIRE_MINUTES="0",
                    JWT_ISSUER="",
                    JWT_AUDIENCE="",
                    GOOGLE_CLIENT_ID="",
                    VNPAY_ENABLED="true",
                    VNPAY_MOCK_ENABLED="true",
                    VNPAY_URL="https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
                    VNPAY_API_URL="https://sandbox.vnpayment.vn/merchant_webapi/api/transaction",
                    VNPAY_API_IP_ADDRESS="not-an-ip",
                    VNPAY_RETURN_URL="http://localhost:8000/api/orders/vnpay-return",
                    VNPAY_IPN_URL="http://localhost:8000/api/orders/vnpay-ipn",
                    VNPAY_PAYMENT_EXPIRY_MINUTES="0",
                    VNPAY_REQUEST_TIMEOUT_SECONDS="0",
                    GHN_API_URL="https://dev-online-gateway.ghn.vn/shiip/public-api",
                    GHN_TOKEN="",
                    GHN_SHOP_ID="",
                    GHN_SHOP_DISTRICT_ID="",
                    GHN_SHOP_WARD_CODE="",
                )
            )
        message = str(context.exception)
        self.assertIn("DATABASE_URL", message)
        self.assertIn("ALLOWED_HOSTS", message)
        self.assertIn("REDIS_URL", message)
        self.assertIn("TRUST_PROXY_HEADERS", message)
        self.assertIn("JWT_EXPIRE_MINUTES", message)
        self.assertIn("JWT_ISSUER", message)
        self.assertIn("GOOGLE_CLIENT_ID", message)
        self.assertIn("VNPAY_MOCK_ENABLED", message)
        self.assertIn("VNPAY_URL", message)
        self.assertIn("VNPAY_API_URL", message)
        self.assertIn("VNPAY_API_IP_ADDRESS", message)
        self.assertIn("VNPAY_RETURN_URL", message)
        self.assertIn("VNPAY_IPN_URL", message)
        self.assertIn("GHN_API_URL", message)
        self.assertIn("GHN_TOKEN", message)
        self.assertIn("GHN_SHOP_DISTRICT_ID", message)

    def test_placeholder_production_values_fail(self) -> None:
        with self.assertRaises(RuntimeError) as context:
            validate_runtime_config(
                production_config(
                    DATABASE_URL="postgresql://app:replace-me@db.example.com/ecommerce",
                    ALLOWED_HOSTS="api.example.com",
                    ALLOWED_ORIGINS="https://shop.company.test",
                )
            )
        self.assertIn("placeholder", str(context.exception))


if __name__ == "__main__":
    unittest.main()
