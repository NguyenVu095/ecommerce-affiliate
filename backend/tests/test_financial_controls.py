"""Regression tests for production financial controls."""

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.modules.admin.routes import (
    validate_admin_order_transition,
    validate_commission_transition,
    validate_withdrawal_transition,
)
from app.modules.order import routes as order_routes
from app.modules.order.routes import (
    calculate_weighted_commission,
    ensure_order_can_be_cancelled,
    ensure_order_can_be_completed,
    payment_method_is_supported,
)
from app.modules.shipper.routes import payment_allows_shipping
from app.modules.shipping import routes as shipping_routes
from app.modules.shipping.schemas import ShippingFeeRequest


class FinancialControlTests(unittest.TestCase):
    def test_weighted_commission_uses_each_product_rate(self) -> None:
        amount, effective_rate = calculate_weighted_commission(
            [(100_000, 1, 5), (200_000, 2, 20)],
            total_base_price=500_000,
        )
        self.assertEqual(amount, 85_000)
        self.assertEqual(effective_rate, 17)

    def test_only_implemented_payment_methods_are_exposed(self) -> None:
        self.assertTrue(payment_method_is_supported("COD"))
        self.assertFalse(payment_method_is_supported("bank_transfer"))
        self.assertFalse(payment_method_is_supported("MOMO"))
        with patch.object(order_routes, "VNPAY_ENABLED", False):
            self.assertFalse(payment_method_is_supported("VNPAY"))
        with patch.object(order_routes, "VNPAY_ENABLED", True):
            self.assertTrue(payment_method_is_supported("VNPAY"))

    def test_paid_orders_cannot_be_cancelled_without_a_refund(self) -> None:
        ensure_order_can_be_cancelled(MagicMock(payment_status="unpaid"))
        ensure_order_can_be_cancelled(MagicMock(payment_status="refunded"))
        with self.assertRaises(HTTPException):
            ensure_order_can_be_cancelled(MagicMock(payment_status="paid"))

    def test_vnpay_orders_require_gateway_confirmation_before_completion(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = MagicMock(code="VNPAY")
        ensure_order_can_be_completed(db, MagicMock(payment_method_id=1, payment_status="paid"))
        with self.assertRaises(HTTPException):
            ensure_order_can_be_completed(db, MagicMock(payment_method_id=1, payment_status="unpaid"))

    def test_cod_is_marked_paid_when_completed(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = MagicMock(code="COD")
        order = MagicMock(payment_method_id=1, payment_status="unpaid")
        ensure_order_can_be_completed(db, order)
        self.assertEqual(order.payment_status, "paid")

    def test_admin_order_transitions_are_limited_to_confirmation_and_early_cancellation(self) -> None:
        validate_admin_order_transition("pending", "confirmed")
        validate_admin_order_transition("pending", "cancelled")
        validate_admin_order_transition("confirmed", "cancelled")
        for current_status, next_status in (
            ("confirmed", "shipping"),
            ("shipping", "success"),
            ("shipping", "cancelled"),
            ("success", "cancelled"),
            ("cancelled", "pending"),
        ):
            with self.subTest(current_status=current_status, next_status=next_status):
                with self.assertRaises(HTTPException):
                    validate_admin_order_transition(current_status, next_status)

    def test_online_orders_must_be_paid_before_shipping(self) -> None:
        self.assertTrue(payment_allows_shipping(MagicMock(payment_status="unpaid"), "COD"))
        self.assertTrue(payment_allows_shipping(MagicMock(payment_status="paid"), "VNPAY"))
        self.assertFalse(payment_allows_shipping(MagicMock(payment_status="unpaid"), "VNPAY"))
        self.assertFalse(payment_allows_shipping(MagicMock(payment_status="unpaid"), ""))

    def test_shipping_fee_requires_valid_ghn_response(self) -> None:
        request = ShippingFeeRequest(
            to_district_id=1,
            to_ward_code="A",
            items=[{"variant_id": 1, "quantity": 1}],
        )
        with patch.object(shipping_routes, "request_ghn_shipping_fee", return_value={"data": {"total": 42_000}}):
            self.assertEqual(shipping_routes.calculate_ghn_shipping_fee(request, MagicMock()), 42_000)
        with patch.object(shipping_routes, "request_ghn_shipping_fee", return_value={"data": {}}):
            with self.assertRaises(HTTPException):
                shipping_routes.calculate_ghn_shipping_fee(request, MagicMock())

    def test_withdrawal_transitions_are_strict(self) -> None:
        validate_withdrawal_transition("pending", "approved")
        validate_withdrawal_transition("approved", "paid")
        with self.assertRaises(HTTPException):
            validate_withdrawal_transition("pending", "paid")
        with self.assertRaises(HTTPException):
            validate_withdrawal_transition("paid", "rejected")

    def test_commission_transitions_keep_paid_commissions_terminal(self) -> None:
        validate_commission_transition("pending", "approved")
        validate_commission_transition("approved", "cancelled")
        validate_commission_transition("cancelled", "approved")
        with self.assertRaises(HTTPException):
            validate_commission_transition("paid", "cancelled")
        with self.assertRaises(HTTPException):
            validate_commission_transition("approved", "pending")


if __name__ == "__main__":
    unittest.main()
