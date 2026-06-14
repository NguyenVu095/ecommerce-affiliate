"""Integration tests for VNPay IPN, reconciliation state, and full refunds."""

import sys
import unittest
import urllib.parse
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app import main as _main  # noqa: F401 - import all models into Base metadata
from app.db.database import Base
from app.modules.order import payment_service
from app.modules.order.models import (
    Order,
    PaymentGatewayEvent,
    PaymentMethod,
    PaymentRefund,
    PaymentTransaction,
    ShippingMethod,
)
from app.modules.user.models import User


TEST_SECRET = "test-vnpay-secret-with-sufficient-entropy"
TEST_TMN_CODE = "TESTCODE"


class VnpayControlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.admin = User(full_name="Admin", email="admin-vnpay@example.com", role=1, status=1)
        payment_method = PaymentMethod(name="VNPay", code="VNPAY", status=1)
        shipping_method = ShippingMethod(name="Standard", cost=0, status=1)
        self.db.add_all([self.admin, payment_method, shipping_method])
        self.db.flush()
        self.order = Order(
            order_code="ORD-VNPAY-1",
            shipping_method_id=shipping_method.id,
            payment_method_id=payment_method.id,
            status="pending",
            payment_status="unpaid",
            total_base_price=Decimal("100000"),
            shipping_fee=Decimal("0"),
            discount_amount=Decimal("0"),
            total_final=Decimal("100000"),
            shipping_full_address="Test address",
        )
        self.db.add(self.order)
        self.db.flush()
        self.transaction = PaymentTransaction(
            order_id=self.order.id,
            provider="VNPAY",
            txn_ref="O1TESTTXN",
            amount=Decimal("100000"),
            currency="VND",
            status="pending",
            payment_create_date="20260612120000",
            payment_expire_date="20260612121500",
            client_ip="127.0.0.1",
        )
        self.db.add(self.transaction)
        self.db.commit()
        self.config_patch = patch.multiple(
            payment_service,
            VNPAY_HASH_SECRET=TEST_SECRET,
            VNPAY_TMN_CODE=TEST_TMN_CODE,
        )
        self.config_patch.start()

    def tearDown(self) -> None:
        self.config_patch.stop()
        self.db.close()
        self.engine.dispose()

    def signed_ipn(self, **overrides):
        params = {
            "vnp_TmnCode": TEST_TMN_CODE,
            "vnp_TxnRef": self.transaction.txn_ref,
            "vnp_Amount": "10000000",
            "vnp_ResponseCode": "00",
            "vnp_TransactionStatus": "00",
            "vnp_TransactionNo": "12345678",
            "vnp_TransactionType": "01",
            "vnp_PayDate": "20260612120500",
        }
        params.update(overrides)
        params["vnp_SecureHash"] = payment_service.calculate_vnpay_signature(params, TEST_SECRET)
        return params

    def test_ipn_is_source_of_truth_and_idempotent(self) -> None:
        result = payment_service.process_vnpay_ipn(self.db, self.signed_ipn())
        self.assertEqual(result["RspCode"], "00")
        self.db.refresh(self.order)
        self.db.refresh(self.transaction)
        self.assertEqual(self.order.payment_status, "paid")
        self.assertEqual(self.order.status, "pending")
        self.assertEqual(self.transaction.status, "succeeded")
        self.assertEqual(self.db.query(PaymentGatewayEvent).count(), 1)

        repeated = payment_service.process_vnpay_ipn(self.db, self.signed_ipn())
        self.assertEqual(repeated["RspCode"], "02")
        self.assertEqual(self.db.query(PaymentGatewayEvent).count(), 2)

    def test_return_is_audited_without_confirming_payment(self) -> None:
        transaction, order = payment_service.process_vnpay_return(self.db, self.signed_ipn())

        self.db.refresh(transaction)
        self.db.refresh(order)
        self.assertEqual(transaction.status, "pending")
        self.assertIsNone(transaction.response_code)
        self.assertEqual(order.payment_status, "unpaid")
        self.assertEqual(order.status, "pending")

        event = self.db.query(PaymentGatewayEvent).one()
        self.assertEqual(event.event_type, "return")
        self.assertTrue(event.signature_valid)
        self.assertEqual(event.response_code, "00")

    def test_repeated_failed_ipn_does_not_overwrite_successful_transaction(self) -> None:
        payment_service.process_vnpay_ipn(self.db, self.signed_ipn())
        repeated = payment_service.process_vnpay_ipn(
            self.db,
            self.signed_ipn(
                vnp_ResponseCode="24",
                vnp_TransactionStatus="24",
                vnp_TransactionNo="99999999",
            ),
        )

        self.db.refresh(self.order)
        self.db.refresh(self.transaction)
        self.assertEqual(repeated["RspCode"], "02")
        self.assertEqual(self.transaction.status, "succeeded")
        self.assertEqual(self.transaction.response_code, "00")
        self.assertEqual(self.transaction.transaction_status, "00")
        self.assertEqual(self.transaction.gateway_transaction_no, "12345678")
        self.assertEqual(self.order.payment_status, "paid")

    def test_failed_payment_does_not_cancel_order(self) -> None:
        result = payment_service.process_vnpay_ipn(
            self.db,
            self.signed_ipn(vnp_ResponseCode="24", vnp_TransactionStatus="24"),
        )
        self.assertEqual(result["RspCode"], "00")
        self.db.refresh(self.order)
        self.db.refresh(self.transaction)
        self.assertEqual(self.order.status, "pending")
        self.assertEqual(self.order.payment_status, "unpaid")
        self.assertEqual(self.transaction.status, "failed")

    def test_suspicious_charged_payment_requires_review_and_blocks_retry(self) -> None:
        payment_service.process_vnpay_ipn(
            self.db,
            self.signed_ipn(vnp_ResponseCode="07", vnp_TransactionStatus="00"),
        )
        self.db.refresh(self.transaction)
        self.assertEqual(self.transaction.status, "review_required")
        with self.assertRaises(HTTPException):
            payment_service.get_or_create_payment_transaction(self.db, self.order, "127.0.0.1")

    def test_ipn_rejects_invalid_amount_without_state_change(self) -> None:
        result = payment_service.process_vnpay_ipn(self.db, self.signed_ipn(vnp_Amount="999"))
        self.assertEqual(result["RspCode"], "04")
        self.db.refresh(self.order)
        self.db.refresh(self.transaction)
        self.assertEqual(self.order.payment_status, "unpaid")
        self.assertEqual(self.transaction.status, "pending")

    def test_ipn_rejects_non_numeric_amount(self) -> None:
        result = payment_service.process_vnpay_ipn(self.db, self.signed_ipn(vnp_Amount="invalid"))

        self.assertEqual(result["RspCode"], "04")
        self.db.refresh(self.order)
        self.db.refresh(self.transaction)
        self.assertEqual(self.order.payment_status, "unpaid")
        self.assertEqual(self.transaction.status, "pending")

    def test_payment_url_contains_signed_public_return_url(self) -> None:
        return_url = "https://payments.example.test/api/orders/vnpay-return"
        with patch.multiple(
            payment_service,
            VNPAY_URL="https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
            VNPAY_RETURN_URL=return_url,
        ):
            payment_url = payment_service.build_vnpay_payment_url(self.transaction, self.order)

        parsed = urllib.parse.urlparse(payment_url)
        params = dict(urllib.parse.parse_qsl(parsed.query))
        self.assertEqual(params["vnp_ReturnUrl"], return_url)
        self.assertTrue(payment_service.verify_vnpay_signature(params, TEST_SECRET))

    def test_full_refund_is_audited_and_idempotent(self) -> None:
        payment_service.process_vnpay_ipn(self.db, self.signed_ipn())

        def fake_post(_url, *, json, headers, timeout):
            response_data = {
                "vnp_ResponseId": "RESP-1",
                "vnp_Command": "refund",
                "vnp_ResponseCode": "00",
                "vnp_Message": "Success",
                "vnp_TmnCode": TEST_TMN_CODE,
                "vnp_TxnRef": self.transaction.txn_ref,
                "vnp_Amount": json["vnp_Amount"],
                "vnp_BankCode": "NCB",
                "vnp_PayDate": "20260612121000",
                "vnp_TransactionNo": "87654321",
                "vnp_TransactionType": "02",
                "vnp_TransactionStatus": "00",
                "vnp_OrderInfo": json["vnp_OrderInfo"],
            }
            response_data["vnp_SecureHash"] = payment_service.calculate_vnpay_api_signature(
                [
                    response_data["vnp_ResponseId"],
                    response_data["vnp_Command"],
                    response_data["vnp_ResponseCode"],
                    response_data["vnp_Message"],
                    response_data["vnp_TmnCode"],
                    response_data["vnp_TxnRef"],
                    response_data["vnp_Amount"],
                    response_data["vnp_BankCode"],
                    response_data["vnp_PayDate"],
                    response_data["vnp_TransactionNo"],
                    response_data["vnp_TransactionType"],
                    response_data["vnp_TransactionStatus"],
                    response_data["vnp_OrderInfo"],
                ],
                TEST_SECRET,
            )
            mock_response = MagicMock()
            mock_response.json.return_value = response_data
            return mock_response

        with patch.object(payment_service.requests, "post", side_effect=fake_post):
            refund = payment_service.initiate_full_refund(
                self.db,
                self.order.id,
                self.admin.id,
                "Customer requested cancellation",
                "127.0.0.1",
            )
        self.assertEqual(refund.status, "succeeded")
        self.db.refresh(self.order)
        self.db.refresh(self.transaction)
        self.assertEqual(self.order.payment_status, "refunded")
        self.assertEqual(self.transaction.status, "refunded")
        self.assertEqual(self.db.query(PaymentRefund).count(), 1)

        with self.assertRaises(HTTPException):
            payment_service.initiate_full_refund(
                self.db,
                self.order.id,
                self.admin.id,
                "Duplicate refund request",
                "127.0.0.1",
            )

    def test_refund_timeout_becomes_unknown_and_blocks_retry(self) -> None:
        payment_service.process_vnpay_ipn(self.db, self.signed_ipn())
        with patch.object(payment_service.requests, "post", side_effect=payment_service.requests.Timeout):
            with self.assertRaises(HTTPException):
                payment_service.initiate_full_refund(
                    self.db,
                    self.order.id,
                    self.admin.id,
                    "Customer requested cancellation",
                    "127.0.0.1",
                )
        refund = self.db.query(PaymentRefund).one()
        self.assertEqual(refund.status, "unknown")

        with self.assertRaises(HTTPException):
            payment_service.initiate_full_refund(
                self.db,
                self.order.id,
                self.admin.id,
                "Do not retry unknown refunds",
                "127.0.0.1",
            )

    def test_pending_refund_allows_customer_cancellation(self) -> None:
        from app.modules.order.routes import cancel_my_order

        payment_service.process_vnpay_ipn(self.db, self.signed_ipn())
        user = User(full_name="Test User", email="pending-refund@example.com", role=2, status=1)
        self.db.add(user)
        self.db.flush()
        self.order.user_id = user.id
        self.db.commit()

        def fake_post(_url, *, json, headers, timeout):
            response_data = {
                "vnp_ResponseId": "RESP-PENDING-1",
                "vnp_Command": "refund",
                "vnp_ResponseCode": "00",
                "vnp_Message": "Processing",
                "vnp_TmnCode": TEST_TMN_CODE,
                "vnp_TxnRef": self.transaction.txn_ref,
                "vnp_Amount": json["vnp_Amount"],
                "vnp_BankCode": "NCB",
                "vnp_PayDate": "20260612121000",
                "vnp_TransactionNo": "87654321",
                "vnp_TransactionType": "02",
                "vnp_TransactionStatus": "05",
                "vnp_OrderInfo": json["vnp_OrderInfo"],
            }
            response_data["vnp_SecureHash"] = payment_service.calculate_vnpay_api_signature(
                [
                    response_data["vnp_ResponseId"],
                    response_data["vnp_Command"],
                    response_data["vnp_ResponseCode"],
                    response_data["vnp_Message"],
                    response_data["vnp_TmnCode"],
                    response_data["vnp_TxnRef"],
                    response_data["vnp_Amount"],
                    response_data["vnp_BankCode"],
                    response_data["vnp_PayDate"],
                    response_data["vnp_TransactionNo"],
                    response_data["vnp_TransactionType"],
                    response_data["vnp_TransactionStatus"],
                    response_data["vnp_OrderInfo"],
                ],
                TEST_SECRET,
            )
            mock_response = MagicMock()
            mock_response.json.return_value = response_data
            return mock_response

        mock_request = MagicMock()
        mock_request.client.host = "127.0.0.1"

        with patch.object(payment_service.requests, "post", side_effect=fake_post):
            result = cancel_my_order(
                order_id=self.order.id,
                request=mock_request,
                db=self.db,
                current_user=user,
            )

        refund = self.db.query(PaymentRefund).one()
        self.db.refresh(self.order)
        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(result["refund_status"], "pending")
        self.assertEqual(self.order.status, "cancelled")
        self.assertEqual(self.order.payment_status, "paid")
        self.assertEqual(refund.status, "pending")

    def test_existing_processing_refund_is_reused(self) -> None:
        payment_service.process_vnpay_ipn(self.db, self.signed_ipn())
        refund = PaymentRefund(
            payment_transaction_id=self.transaction.id,
            order_id=self.order.id,
            request_id="R-EXISTING",
            amount=self.transaction.amount,
            status="unknown",
            reason="Customer requested cancellation",
            requested_by=self.admin.id,
            response_code="00",
            transaction_status="05",
        )
        self.db.add(refund)
        self.db.commit()

        reused = payment_service.initiate_full_refund(
            self.db,
            self.order.id,
            self.admin.id,
            "Customer requested cancellation",
            "127.0.0.1",
        )

        self.assertEqual(reused.id, refund.id)
        self.assertEqual(reused.status, "pending")
        self.assertEqual(self.db.query(PaymentRefund).count(), 1)

    def test_admin_cancellation_refunds_paid_vnpay_order(self) -> None:
        from app.modules.admin.routes import OrderStatusUpdate, update_order_status

        payment_service.process_vnpay_ipn(self.db, self.signed_ipn())

        def fake_post(_url, *, json, headers, timeout):
            response_data = {
                "vnp_ResponseId": "RESP-ADMIN-CANCEL-1",
                "vnp_Command": "refund",
                "vnp_ResponseCode": "00",
                "vnp_Message": "Success",
                "vnp_TmnCode": TEST_TMN_CODE,
                "vnp_TxnRef": self.transaction.txn_ref,
                "vnp_Amount": json["vnp_Amount"],
                "vnp_BankCode": "NCB",
                "vnp_PayDate": "20260612121000",
                "vnp_TransactionNo": "87654321",
                "vnp_TransactionType": "02",
                "vnp_TransactionStatus": "00",
                "vnp_OrderInfo": json["vnp_OrderInfo"],
            }
            response_data["vnp_SecureHash"] = payment_service.calculate_vnpay_api_signature(
                [
                    response_data["vnp_ResponseId"],
                    response_data["vnp_Command"],
                    response_data["vnp_ResponseCode"],
                    response_data["vnp_Message"],
                    response_data["vnp_TmnCode"],
                    response_data["vnp_TxnRef"],
                    response_data["vnp_Amount"],
                    response_data["vnp_BankCode"],
                    response_data["vnp_PayDate"],
                    response_data["vnp_TransactionNo"],
                    response_data["vnp_TransactionType"],
                    response_data["vnp_TransactionStatus"],
                    response_data["vnp_OrderInfo"],
                ],
                TEST_SECRET,
            )
            mock_response = MagicMock()
            mock_response.json.return_value = response_data
            return mock_response

        request = MagicMock()
        request.client.host = "127.0.0.1"
        with patch.object(payment_service.requests, "post", side_effect=fake_post):
            result = update_order_status(
                order_id=self.order.id,
                body=OrderStatusUpdate(status="cancelled", note="Khách yêu cầu hủy đơn"),
                request=request,
                db=self.db,
                current_admin=self.admin,
            )

        self.db.refresh(self.order)
        self.db.refresh(self.transaction)
        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(result["refund_status"], "succeeded")
        self.assertEqual(self.order.status, "cancelled")
        self.assertEqual(self.order.payment_status, "refunded")
        self.assertEqual(self.transaction.status, "refunded")

    def test_shipment_details_can_be_recorded_for_confirmed_order(self) -> None:
        from app.modules.shipper.routes import ShipmentDetailsUpdate, update_shipment_details

        self.order.status = "confirmed"
        self.db.commit()
        expected_delivery = datetime.now() + timedelta(days=2)

        result = update_shipment_details(
            order_id=self.order.id,
            body=ShipmentDetailsUpdate(
                shipping_order_code="GHN-TEST-123",
                expected_delivery_time=expected_delivery,
            ),
            db=self.db,
            current_shipper=self.admin,
        )

        self.db.refresh(self.order)
        self.assertEqual(result["shipping_order_code"], "GHN-TEST-123")
        self.assertEqual(self.order.shipping_order_code, "GHN-TEST-123")
        self.assertEqual(self.order.expected_delivery_time, expected_delivery)

    def test_customer_cancel_paid_vnpay_order_triggers_auto_refund(self) -> None:
        from app.modules.order.routes import cancel_my_order

        # 1. Mark the transaction as succeeded, and order as paid
        payment_service.process_vnpay_ipn(self.db, self.signed_ipn())
        self.db.refresh(self.order)
        self.db.refresh(self.transaction)
        self.assertEqual(self.order.payment_status, "paid")

        # 2. Mock VNPay refund response
        def fake_post(_url, *, json, headers, timeout):
            response_data = {
                "vnp_ResponseId": "RESP-CANCEL-1",
                "vnp_Command": "refund",
                "vnp_ResponseCode": "00",
                "vnp_Message": "Success",
                "vnp_TmnCode": TEST_TMN_CODE,
                "vnp_TxnRef": self.transaction.txn_ref,
                "vnp_Amount": json["vnp_Amount"],
                "vnp_BankCode": "NCB",
                "vnp_PayDate": "20260612121000",
                "vnp_TransactionNo": "87654321",
                "vnp_TransactionType": "02",
                "vnp_TransactionStatus": "00",
                "vnp_OrderInfo": json["vnp_OrderInfo"],
            }
            response_data["vnp_SecureHash"] = payment_service.calculate_vnpay_api_signature(
                [
                    response_data["vnp_ResponseId"],
                    response_data["vnp_Command"],
                    response_data["vnp_ResponseCode"],
                    response_data["vnp_Message"],
                    response_data["vnp_TmnCode"],
                    response_data["vnp_TxnRef"],
                    response_data["vnp_Amount"],
                    response_data["vnp_BankCode"],
                    response_data["vnp_PayDate"],
                    response_data["vnp_TransactionNo"],
                    response_data["vnp_TransactionType"],
                    response_data["vnp_TransactionStatus"],
                    response_data["vnp_OrderInfo"],
                ],
                TEST_SECRET,
            )
            mock_response = MagicMock()
            mock_response.json.return_value = response_data
            return mock_response

        # Create mock Request object
        mock_request = MagicMock()
        mock_request.client.host = "127.0.0.1"

        user = User(full_name="Test User", email="testuser@example.com", role=2, status=1)
        self.db.add(user)
        self.db.flush()
        self.order.user_id = user.id
        self.db.commit()

        with patch.object(payment_service.requests, "post", side_effect=fake_post):
            result = cancel_my_order(
                order_id=self.order.id,
                request=mock_request,
                db=self.db,
                current_user=user,
            )

        self.assertEqual(result["status"], "cancelled")
        self.db.refresh(self.order)
        self.db.refresh(self.transaction)
        self.assertEqual(self.order.status, "cancelled")
        self.assertEqual(self.order.payment_status, "refunded")
        self.assertEqual(self.transaction.status, "refunded")
        self.assertEqual(self.db.query(PaymentRefund).count(), 1)


if __name__ == "__main__":
    unittest.main()
