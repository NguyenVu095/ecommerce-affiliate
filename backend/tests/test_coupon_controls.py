"""Regression tests for coupon eligibility and schema controls."""

import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.modules.coupon.schemas import CouponCreate
from app.modules.coupon.service import calculate_coupon_discount, coupon_ineligibility_reason


def coupon(**overrides):
    values = {
        "type": "percent",
        "value": 20,
        "max_discount": None,
        "min_order": 0,
        "quantity": 10,
        "max_uses_per_user": 2,
        "applicable_type": "all",
        "start_at": None,
        "expired_at": None,
        "status": 1,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class CouponControlTests(unittest.TestCase):
    def test_multi_use_coupon_is_allowed_until_limit(self) -> None:
        item = coupon(max_uses_per_user=2)
        self.assertIsNone(coupon_ineligibility_reason(item, 100_000, user_usage_count=1))
        self.assertIsNotNone(coupon_ineligibility_reason(item, 100_000, user_usage_count=2))

    def test_unsupported_scope_is_rejected(self) -> None:
        reason = coupon_ineligibility_reason(coupon(applicable_type="category"), 100_000)
        self.assertIn("chưa được hỗ trợ", reason)

    def test_time_and_minimum_order_are_enforced(self) -> None:
        now = datetime(2026, 6, 11, 12, 0, 0)
        self.assertIsNotNone(
            coupon_ineligibility_reason(coupon(start_at=now + timedelta(minutes=1)), 100_000, now=now)
        )
        self.assertIsNotNone(coupon_ineligibility_reason(coupon(min_order=200_000), 100_000, now=now))

    def test_discount_is_capped(self) -> None:
        self.assertEqual(calculate_coupon_discount(coupon(value=50, max_discount=10_000), 100_000), 10_000)
        self.assertEqual(calculate_coupon_discount(coupon(type="fixed", value=150_000), 100_000), 100_000)

    def test_schema_rejects_unsupported_scope_and_zero_user_limit(self) -> None:
        common = {"code": "TEST", "type": "percent", "value": 10}
        with self.assertRaises(ValidationError):
            CouponCreate(**common, applicable_type="category")
        with self.assertRaises(ValidationError):
            CouponCreate(**common, max_uses_per_user=0)


if __name__ == "__main__":
    unittest.main()
