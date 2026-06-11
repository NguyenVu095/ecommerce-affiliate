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
        "DATABASE_URL": "postgresql://app:secret@db.example.com/ecommerce",
        "AUTO_CREATE_SCHEMA": "false",
        "ALLOWED_HOSTS": "api.example.com",
        "ALLOWED_ORIGINS": "https://shop.example.com,https://admin.example.com",
        "CUSTOMER_APP_URL": "https://shop.example.com",
        "REDIS_URL": "redis://redis:6379/0",
        "REQUIRE_REDIS_RATE_LIMIT": "true",
        "ENABLE_HSTS": "true",
        "JWT_AUDIENCE": "ecommerce-web",
    }
    values.update(overrides)
    return values


class RuntimeConfigTests(unittest.TestCase):
    def test_valid_production_config_passes(self) -> None:
        validate_runtime_config(production_config())

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
                    ENABLE_HSTS="false",
                    JWT_AUDIENCE="",
                )
            )
        message = str(context.exception)
        self.assertIn("DATABASE_URL", message)
        self.assertIn("ALLOWED_HOSTS", message)
        self.assertIn("REDIS_URL", message)


if __name__ == "__main__":
    unittest.main()
