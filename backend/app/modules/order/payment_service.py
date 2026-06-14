"""VNPay payment, IPN, reconciliation, and refund controls."""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable

import requests
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.security import validate_secret_strength
from app.modules.order.models import (
    Order,
    PaymentGatewayEvent,
    PaymentRefund,
    PaymentTransaction,
)

logger = logging.getLogger(__name__)

_TRUE_VALUES = {"1", "true", "yes", "on"}
GMT7 = timezone(timedelta(hours=7))
VNPAY_VERSION = "2.1.0"

VNPAY_ENABLED = os.getenv("VNPAY_ENABLED", "false").lower() in _TRUE_VALUES
VNPAY_MOCK_ENABLED = os.getenv("VNPAY_MOCK_ENABLED", "false").lower() in _TRUE_VALUES
VNPAY_TMN_CODE = os.getenv("VNPAY_TMN_CODE", "").strip()
VNPAY_URL = os.getenv("VNPAY_URL", "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html").strip()
VNPAY_API_URL = os.getenv(
    "VNPAY_API_URL",
    "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction",
).strip()
VNPAY_RETURN_URL = os.getenv("VNPAY_RETURN_URL", "").strip()
VNPAY_API_IP_ADDRESS = os.getenv("VNPAY_API_IP_ADDRESS", "").strip()
VNPAY_HASH_SECRET = (
    validate_secret_strength(os.getenv("VNPAY_HASH_SECRET"), name="VNPAY_HASH_SECRET")
    if VNPAY_ENABLED or VNPAY_MOCK_ENABLED
    else ""
)
VNPAY_PAYMENT_EXPIRY_MINUTES = int(os.getenv("VNPAY_PAYMENT_EXPIRY_MINUTES", "15"))
VNPAY_REQUEST_TIMEOUT_SECONDS = float(os.getenv("VNPAY_REQUEST_TIMEOUT_SECONDS", "10"))


def calculate_vnpay_signature(vnp_params: dict[str, Any], secret: str) -> str:
    """Create the HMAC-SHA512 signature used by payment URLs, Return URL, and IPN."""
    filtered_params = {
        key: str(value)
        for key, value in vnp_params.items()
        if key.startswith("vnp_") and key not in {"vnp_SecureHash", "vnp_SecureHashType"}
    }
    query_string = urllib.parse.urlencode(sorted(filtered_params.items()), quote_via=urllib.parse.quote_plus)
    return hmac.new(secret.encode(), query_string.encode(), hashlib.sha512).hexdigest()


def verify_vnpay_signature(vnp_params: dict[str, Any], secret: str) -> bool:
    received_hash = str(vnp_params.get("vnp_SecureHash", ""))
    return bool(received_hash) and hmac.compare_digest(calculate_vnpay_signature(vnp_params, secret), received_hash)


def calculate_vnpay_api_signature(values: Iterable[Any], secret: str) -> str:
    raw = "|".join("" if value is None else str(value) for value in values)
    return hmac.new(secret.encode(), raw.encode(), hashlib.sha512).hexdigest()


def _verify_api_response(response: dict[str, Any], *, refund: bool = False) -> bool:
    received_hash = str(response.get("vnp_SecureHash", ""))
    if not received_hash:
        return False
    fields = [
        response.get("vnp_ResponseId"),
        response.get("vnp_Command"),
        response.get("vnp_ResponseCode"),
        response.get("vnp_Message"),
        response.get("vnp_TmnCode") or VNPAY_TMN_CODE,
        response.get("vnp_TxnRef"),
        response.get("vnp_Amount"),
        response.get("vnp_BankCode"),
        response.get("vnp_PayDate"),
        response.get("vnp_TransactionNo"),
        response.get("vnp_TransactionType"),
        response.get("vnp_TransactionStatus"),
        response.get("vnp_OrderInfo"),
    ]
    if not refund:
        fields.extend([response.get("vnp_PromotionCode"), response.get("vnp_PromotionAmount")])
    expected = calculate_vnpay_api_signature(fields, VNPAY_HASH_SECRET)
    return hmac.compare_digest(expected, received_hash)


def _safe_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key not in {"vnp_SecureHash", "vnp_SecureHashType"}}


def _vnpay_datetime(value: datetime | None = None) -> str:
    current = value or datetime.now(GMT7)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return current.astimezone(GMT7).strftime("%Y%m%d%H%M%S")


def _parse_vnpay_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.strptime(str(value), "%Y%m%d%H%M%S").replace(tzinfo=GMT7)
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError:
        return None


def to_vnpay_amount(amount: Decimal | float | int) -> int:
    decimal_amount = Decimal(str(amount))
    if decimal_amount != decimal_amount.quantize(Decimal("1")):
        raise HTTPException(status_code=409, detail="VNPay only supports whole VND amounts.")
    vnpay_amount = int(decimal_amount) * 100
    if vnpay_amount <= 0 or vnpay_amount > 999_999_999_999:
        raise HTTPException(status_code=409, detail="Order amount is outside VNPay limits.")
    return vnpay_amount


def _new_reference(prefix: str, object_id: int) -> str:
    return f"{prefix}{object_id}{datetime.now(GMT7):%y%m%d%H%M%S}{secrets.token_hex(4).upper()}"


def _record_event(
    db: Session,
    transaction: PaymentTransaction,
    event_type: str,
    payload: dict[str, Any] | None = None,
    *,
    refund: PaymentRefund | None = None,
    request_id: str | None = None,
    signature_valid: bool | None = None,
    response_code: str | None = None,
) -> None:
    db.add(
        PaymentGatewayEvent(
            order_id=transaction.order_id,
            payment_transaction_id=transaction.id,
            payment_refund_id=refund.id if refund else None,
            event_type=event_type,
            request_id=request_id,
            signature_valid=signature_valid,
            response_code=response_code,
            payload=_safe_payload(payload or {}),
        )
    )


def get_or_create_payment_transaction(
    db: Session,
    order: Order,
    client_ip: str,
) -> PaymentTransaction:
    now = datetime.utcnow()
    review_required = (
        db.query(PaymentTransaction.id)
        .filter(
            PaymentTransaction.order_id == order.id,
            PaymentTransaction.provider == "VNPAY",
            PaymentTransaction.status.in_(["review_required", "duplicate_paid"]),
        )
        .with_for_update()
        .first()
    )
    if review_required:
        raise HTTPException(
            status_code=409,
            detail="This order has a VNPay transaction that requires reconciliation before retrying.",
        )
    active = (
        db.query(PaymentTransaction)
        .filter(
            PaymentTransaction.order_id == order.id,
            PaymentTransaction.provider == "VNPAY",
            PaymentTransaction.status == "pending",
        )
        .order_by(PaymentTransaction.id.desc())
        .with_for_update()
        .first()
    )
    if active and _parse_vnpay_datetime(active.payment_expire_date) and _parse_vnpay_datetime(active.payment_expire_date) > now:
        return active
    if active:
        active.status = "expired"

    create_at = datetime.now(GMT7)
    transaction = PaymentTransaction(
        order_id=order.id,
        provider="VNPAY",
        txn_ref=_new_reference("O", order.id),
        amount=order.total_final,
        currency="VND",
        status="pending",
        payment_create_date=_vnpay_datetime(create_at),
        payment_expire_date=_vnpay_datetime(create_at + timedelta(minutes=VNPAY_PAYMENT_EXPIRY_MINUTES)),
        client_ip=client_ip[:45],
    )
    db.add(transaction)
    db.flush()
    _record_event(db, transaction, "payment_created")
    return transaction


def build_vnpay_payment_url(transaction: PaymentTransaction, order: Order) -> str:
    params = {
        "vnp_Version": VNPAY_VERSION,
        "vnp_Command": "pay",
        "vnp_TmnCode": VNPAY_TMN_CODE,
        "vnp_Amount": str(to_vnpay_amount(transaction.amount)),
        "vnp_CurrCode": "VND",
        "vnp_TxnRef": transaction.txn_ref,
        "vnp_OrderInfo": f"Thanh toan don hang {order.id}",
        "vnp_OrderType": "other",
        "vnp_Locale": "vn",
        "vnp_ReturnUrl": VNPAY_RETURN_URL,
        "vnp_IpAddr": transaction.client_ip,
        "vnp_CreateDate": transaction.payment_create_date,
        "vnp_ExpireDate": transaction.payment_expire_date,
    }
    signature = calculate_vnpay_signature(params, VNPAY_HASH_SECRET)
    query = urllib.parse.urlencode(sorted(params.items()), quote_via=urllib.parse.quote_plus)
    return f"{VNPAY_URL}?{query}&vnp_SecureHash={signature}"


def build_mock_payment_url(transaction: PaymentTransaction, customer_app_url: str) -> str:
    amount = str(to_vnpay_amount(transaction.amount))
    base = {
        "vnp_TmnCode": VNPAY_TMN_CODE,
        "vnp_TxnRef": transaction.txn_ref,
        "vnp_Amount": amount,
        "vnp_TransactionNo": f"MOCK{transaction.id}",
        "vnp_TransactionStatus": "00",
    }
    success_params = {**base, "vnp_ResponseCode": "00"}
    success_params["vnp_SecureHash"] = calculate_vnpay_signature(success_params, VNPAY_HASH_SECRET)
    failed_params = {**base, "vnp_ResponseCode": "24", "vnp_TransactionStatus": "24"}
    failed_params["vnp_SecureHash"] = calculate_vnpay_signature(failed_params, VNPAY_HASH_SECRET)
    success_callback = "/api/orders/vnpay-ipn?" + urllib.parse.urlencode(success_params)
    fail_callback = "/api/orders/vnpay-ipn?" + urllib.parse.urlencode(failed_params)
    return (
        f"{customer_app_url}/vnpay-mock?order_id={transaction.order_id}&amount={transaction.amount}"
        f"&success_callback={urllib.parse.quote(success_callback)}"
        f"&fail_callback={urllib.parse.quote(fail_callback)}"
    )


def _update_transaction_from_response(transaction: PaymentTransaction, params: dict[str, Any]) -> None:
    transaction.gateway_transaction_no = str(params.get("vnp_TransactionNo") or "") or transaction.gateway_transaction_no
    transaction.response_code = str(params.get("vnp_ResponseCode") or "") or transaction.response_code
    transaction.transaction_status = str(params.get("vnp_TransactionStatus") or "") or transaction.transaction_status
    transaction.bank_code = str(params.get("vnp_BankCode") or "") or transaction.bank_code
    transaction.card_type = str(params.get("vnp_CardType") or "") or transaction.card_type
    transaction.pay_date = _parse_vnpay_datetime(params.get("vnp_PayDate")) or transaction.pay_date
    transaction.raw_response = _safe_payload(params)


def _response_matches_transaction(response: dict[str, Any], transaction: PaymentTransaction) -> bool:
    try:
        amount_matches = int(response.get("vnp_Amount", 0)) == to_vnpay_amount(transaction.amount)
    except (TypeError, ValueError, HTTPException):
        return False
    return (
        str(response.get("vnp_TmnCode") or "") == VNPAY_TMN_CODE
        and str(response.get("vnp_TxnRef") or "") == transaction.txn_ref
        and amount_matches
    )


def _apply_gateway_result(
    db: Session,
    transaction: PaymentTransaction,
    order: Order,
    params: dict[str, Any],
    *,
    event_type: str,
    signature_valid: bool,
) -> dict[str, str]:
    transaction_type = str(params.get("vnp_TransactionType") or "01")
    gateway_success = (
        str(params.get("vnp_ResponseCode")) == "00"
        and str(params.get("vnp_TransactionStatus")) == "00"
    )
    _record_event(
        db,
        transaction,
        event_type,
        params,
        signature_valid=signature_valid,
        response_code=str(params.get("vnp_ResponseCode") or ""),
    )

    if transaction_type == "01" and transaction.status in {"succeeded", "refunded", "partially_refunded"}:
        return {"RspCode": "02", "Message": "Order already confirmed"}

    _update_transaction_from_response(transaction, params)

    if transaction_type == "02" and gateway_success:
        transaction.status = "refunded"
        order.payment_status = "refunded"
        refund = (
            db.query(PaymentRefund)
            .filter(
                PaymentRefund.payment_transaction_id == transaction.id,
                PaymentRefund.status.in_(["pending", "unknown"]),
            )
            .order_by(PaymentRefund.id.desc())
            .with_for_update()
            .first()
        )
        if refund:
            refund.status = "succeeded"
            refund.completed_at = datetime.utcnow()
        return {"RspCode": "00", "Message": "Confirm Success"}

    if transaction_type == "03" and gateway_success:
        transaction.status = "partially_refunded"
        return {"RspCode": "00", "Message": "Confirm Success"}

    if transaction_type in {"02", "03"}:
        refund = (
            db.query(PaymentRefund)
            .filter(
                PaymentRefund.payment_transaction_id == transaction.id,
                PaymentRefund.status.in_(["pending", "unknown"]),
            )
            .order_by(PaymentRefund.id.desc())
            .with_for_update()
            .first()
        )
        if refund:
            refund.status = "unknown" if transaction.transaction_status in {"01", "04", "05", "06"} else "failed"
            if refund.status == "failed":
                refund.completed_at = datetime.utcnow()
        return {"RspCode": "00", "Message": "Confirm Success"}

    if gateway_success:
        if order.payment_status in {"paid", "refunded"} or order.status == "cancelled":
            transaction.status = "duplicate_paid"
            logger.error("VNPay duplicate or late payment requires review: order_id=%s txn_ref=%s", order.id, transaction.txn_ref)
            return {"RspCode": "02", "Message": "Order already confirmed"}
        transaction.status = "succeeded"
        transaction.confirmed_at = datetime.utcnow()
        order.payment_status = "paid"
        return {"RspCode": "00", "Message": "Confirm Success"}

    if transaction.status in {"pending", "expired", "review_required"}:
        if transaction.transaction_status == "01":
            transaction.status = "pending"
        elif transaction.response_code == "07" or transaction.transaction_status in {"04", "05", "06", "07"}:
            transaction.status = "review_required"
        else:
            transaction.status = "failed"
    return {"RspCode": "00", "Message": "Confirm Success"}


def process_vnpay_ipn(db: Session, params: dict[str, Any]) -> dict[str, str]:
    if not verify_vnpay_signature(params, VNPAY_HASH_SECRET):
        return {"RspCode": "97", "Message": "Fail checksum"}
    if str(params.get("vnp_TmnCode") or "") != VNPAY_TMN_CODE:
        return {"RspCode": "97", "Message": "Fail checksum"}
    transaction = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.txn_ref == str(params.get("vnp_TxnRef") or ""))
        .with_for_update()
        .first()
    )
    if not transaction:
        return {"RspCode": "01", "Message": "Order not found"}
    order = db.query(Order).filter(Order.id == transaction.order_id).with_for_update(of=Order).first()
    if not order:
        return {"RspCode": "01", "Message": "Order not found"}
    try:
        amount_matches = int(params.get("vnp_Amount", 0)) == to_vnpay_amount(transaction.amount)
    except (TypeError, ValueError, HTTPException):
        amount_matches = False
    if not amount_matches:
        _record_event(
            db,
            transaction,
            "ipn_invalid_amount",
            params,
            signature_valid=True,
            response_code="04",
        )
        db.commit()
        return {"RspCode": "04", "Message": "Invalid amount"}
    try:
        result = _apply_gateway_result(
            db,
            transaction,
            order,
            params,
            event_type="ipn",
            signature_valid=True,
        )
        db.commit()
        return result
    except Exception:
        db.rollback()
        logger.exception("VNPay IPN processing failed for txn_ref=%s", transaction.txn_ref)
        return {"RspCode": "99", "Message": "Unknown error"}


def process_vnpay_return(db: Session, params: dict[str, Any]) -> tuple[PaymentTransaction, Order]:
    """Validate the browser return and audit it without changing payment state."""
    if not verify_vnpay_signature(params, VNPAY_HASH_SECRET):
        raise HTTPException(status_code=400, detail="Chữ ký thanh toán không hợp lệ (Signature verification failed)")
    if str(params.get("vnp_TmnCode") or "") != VNPAY_TMN_CODE:
        raise HTTPException(status_code=400, detail="Invalid VNPay merchant code")
    transaction = db.query(PaymentTransaction).filter(
        PaymentTransaction.txn_ref == str(params.get("vnp_TxnRef") or "")
    ).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Payment transaction not found")
    order = db.query(Order).filter(Order.id == transaction.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    try:
        if int(params.get("vnp_Amount", 0)) != to_vnpay_amount(transaction.amount):
            raise HTTPException(status_code=400, detail="Invalid VNPay amount")
    except (TypeError, ValueError, HTTPException):
        raise HTTPException(status_code=400, detail="Invalid VNPay amount")

    try:
        _record_event(
            db,
            transaction,
            "return",
            params,
            signature_valid=True,
            response_code=str(params.get("vnp_ResponseCode") or ""),
        )
        db.commit()
        return transaction, order
    except Exception:
        db.rollback()
        logger.exception("VNPay Return processing failed for txn_ref=%s", transaction.txn_ref)
        raise HTTPException(status_code=500, detail="Internal server error processing payment return")



def _post_vnpay_api(payload: dict[str, Any]) -> dict[str, Any]:
    response = requests.post(
        VNPAY_API_URL,
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=VNPAY_REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise ValueError("VNPay returned an invalid response.")
    return data


def reconcile_vnpay_transaction(db: Session, transaction_id: int, client_ip: str) -> PaymentTransaction:
    transaction = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.id == transaction_id, PaymentTransaction.provider == "VNPAY")
        .with_for_update()
        .first()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Payment transaction not found.")
    request_id = _new_reference("Q", transaction.id)
    create_date = _vnpay_datetime()
    api_ip_address = VNPAY_API_IP_ADDRESS or client_ip[:45]
    payload = {
        "vnp_RequestId": request_id,
        "vnp_Version": VNPAY_VERSION,
        "vnp_Command": "querydr",
        "vnp_TmnCode": VNPAY_TMN_CODE,
        "vnp_TxnRef": transaction.txn_ref,
        "vnp_TransactionNo": transaction.gateway_transaction_no or "0",
        "vnp_OrderInfo": f"Query transaction {transaction.txn_ref}",
        "vnp_TransactionDate": transaction.payment_create_date,
        "vnp_CreateDate": create_date,
        "vnp_IpAddr": api_ip_address,
    }
    payload["vnp_SecureHash"] = calculate_vnpay_api_signature(
        [
            request_id,
            VNPAY_VERSION,
            "querydr",
            VNPAY_TMN_CODE,
            transaction.txn_ref,
            transaction.payment_create_date,
            create_date,
            api_ip_address,
            payload["vnp_OrderInfo"],
        ],
        VNPAY_HASH_SECRET,
    )
    try:
        response = _post_vnpay_api(payload)
    except (requests.RequestException, ValueError) as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail="VNPay reconciliation request failed.") from exc

    signature_valid = _verify_api_response(response)
    transaction = db.query(PaymentTransaction).filter(PaymentTransaction.id == transaction_id).with_for_update().first()
    order = db.query(Order).filter(Order.id == transaction.order_id).with_for_update(of=Order).first()
    transaction.last_reconciled_at = datetime.utcnow()
    _record_event(
        db,
        transaction,
        "query",
        response,
        request_id=request_id,
        signature_valid=signature_valid,
        response_code=str(response.get("vnp_ResponseCode") or ""),
    )
    if not signature_valid:
        db.commit()
        raise HTTPException(status_code=502, detail="VNPay reconciliation response signature is invalid.")
    if str(response.get("vnp_ResponseCode")) == "00":
        if not _response_matches_transaction(response, transaction):
            db.commit()
            raise HTTPException(status_code=502, detail="VNPay reconciliation response does not match the transaction.")
        _apply_gateway_result(db, transaction, order, response, event_type="query_result", signature_valid=True)
    else:
        _update_transaction_from_response(transaction, response)
    db.commit()
    db.refresh(transaction)
    return transaction


def initiate_full_refund(
    db: Session,
    order_id: int,
    admin_id: int,
    reason: str,
    client_ip: str,
) -> PaymentRefund:
    order = db.query(Order).filter(Order.id == order_id).with_for_update(of=Order).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    if order.payment_status != "paid":
        raise HTTPException(status_code=409, detail="Only paid orders can be refunded.")
    transaction = (
        db.query(PaymentTransaction)
        .filter(
            PaymentTransaction.order_id == order.id,
            PaymentTransaction.provider == "VNPAY",
            PaymentTransaction.status == "succeeded",
        )
        .order_by(PaymentTransaction.id.desc())
        .with_for_update()
        .first()
    )
    if not transaction or not transaction.gateway_transaction_no:
        raise HTTPException(status_code=409, detail="Reconcile the successful VNPay transaction before refunding.")
    existing = (
        db.query(PaymentRefund)
        .filter(
            PaymentRefund.payment_transaction_id == transaction.id,
            PaymentRefund.status.in_(["pending", "unknown", "succeeded"]),
        )
        .first()
    )
    if existing:
        if existing.status == "pending":
            return existing
        if (
            existing.status == "unknown"
            and existing.response_code == "00"
            and existing.transaction_status in {"05", "06"}
        ):
            existing.status = "pending"
            db.commit()
            db.refresh(existing)
            return existing
        raise HTTPException(status_code=409, detail=f"Refund already exists with status '{existing.status}'.")

    refund = PaymentRefund(
        payment_transaction_id=transaction.id,
        order_id=order.id,
        request_id=_new_reference("R", transaction.id),
        amount=transaction.amount,
        status="unknown",
        reason=reason,
        requested_by=admin_id,
    )
    db.add(refund)
    db.flush()
    _record_event(db, transaction, "refund_created", refund=refund, request_id=refund.request_id)
    db.commit()

    create_date = _vnpay_datetime()
    api_ip_address = VNPAY_API_IP_ADDRESS or client_ip[:45]
    payload = {
        "vnp_RequestId": refund.request_id,
        "vnp_Version": VNPAY_VERSION,
        "vnp_Command": "refund",
        "vnp_TmnCode": VNPAY_TMN_CODE,
        "vnp_TransactionType": "02",
        "vnp_TxnRef": transaction.txn_ref,
        "vnp_Amount": to_vnpay_amount(refund.amount),
        "vnp_TransactionNo": transaction.gateway_transaction_no,
        "vnp_TransactionDate": transaction.payment_create_date,
        "vnp_CreateBy": f"admin{admin_id}",
        "vnp_CreateDate": create_date,
        "vnp_IpAddr": api_ip_address,
        "vnp_OrderInfo": f"Hoan tien don hang {order.id}",
    }
    payload["vnp_SecureHash"] = calculate_vnpay_api_signature(
        [
            payload["vnp_RequestId"],
            payload["vnp_Version"],
            payload["vnp_Command"],
            payload["vnp_TmnCode"],
            payload["vnp_TransactionType"],
            payload["vnp_TxnRef"],
            payload["vnp_Amount"],
            payload["vnp_TransactionNo"],
            payload["vnp_TransactionDate"],
            payload["vnp_CreateBy"],
            payload["vnp_CreateDate"],
            payload["vnp_IpAddr"],
            payload["vnp_OrderInfo"],
        ],
        VNPAY_HASH_SECRET,
    )
    try:
        response = _post_vnpay_api(payload)
    except (requests.RequestException, ValueError) as exc:
        refund = db.query(PaymentRefund).filter(PaymentRefund.id == refund.id).with_for_update().first()
        refund.status = "unknown"
        _record_event(db, transaction, "refund_unknown", refund=refund, request_id=refund.request_id)
        db.commit()
        raise HTTPException(
            status_code=502,
            detail="VNPay refund result is unknown. Reconcile it before any retry.",
        ) from exc

    signature_valid = _verify_api_response(response, refund=True)
    refund = db.query(PaymentRefund).filter(PaymentRefund.id == refund.id).with_for_update().first()
    transaction = db.query(PaymentTransaction).filter(PaymentTransaction.id == transaction.id).with_for_update().first()
    order = db.query(Order).filter(Order.id == order.id).with_for_update(of=Order).first()
    refund.gateway_response_id = str(response.get("vnp_ResponseId") or "") or None
    refund.gateway_transaction_no = str(response.get("vnp_TransactionNo") or "") or None
    refund.response_code = str(response.get("vnp_ResponseCode") or "") or None
    refund.transaction_status = str(response.get("vnp_TransactionStatus") or "") or None
    refund.raw_response = _safe_payload(response)
    _record_event(
        db,
        transaction,
        "refund_response",
        response,
        refund=refund,
        request_id=refund.request_id,
        signature_valid=signature_valid,
        response_code=refund.response_code,
    )
    response_matches = _response_matches_transaction(response, transaction)
    if not signature_valid or (refund.response_code == "00" and not response_matches):
        refund.status = "unknown"
    elif refund.response_code == "00" and refund.transaction_status == "00":
        refund.status = "succeeded"
        refund.completed_at = datetime.utcnow()
        transaction.status = "refunded"
        order.payment_status = "refunded"
    elif refund.response_code == "00" and refund.transaction_status in {"05", "06"}:
        refund.status = "pending"
    elif refund.response_code == "94" or refund.transaction_status in {"01", "04"}:
        refund.status = "unknown"
    else:
        refund.status = "failed"
        refund.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(refund)
    if refund.status == "unknown":
        raise HTTPException(status_code=502, detail="VNPay refund result is unknown; reconciliation required.")
    return refund


def serialize_payment_transaction(transaction: PaymentTransaction) -> dict[str, Any]:
    return {
        "id": transaction.id,
        "order_id": transaction.order_id,
        "provider": transaction.provider,
        "txn_ref": transaction.txn_ref,
        "amount": float(transaction.amount),
        "currency": transaction.currency,
        "status": transaction.status,
        "gateway_transaction_no": transaction.gateway_transaction_no,
        "response_code": transaction.response_code,
        "transaction_status": transaction.transaction_status,
        "bank_code": transaction.bank_code,
        "card_type": transaction.card_type,
        "pay_date": transaction.pay_date.isoformat() if transaction.pay_date else None,
        "confirmed_at": transaction.confirmed_at.isoformat() if transaction.confirmed_at else None,
        "last_reconciled_at": transaction.last_reconciled_at.isoformat() if transaction.last_reconciled_at else None,
        "created_at": transaction.created_at.isoformat() if transaction.created_at else None,
        "refunds": [
            {
                "id": refund.id,
                "request_id": refund.request_id,
                "amount": float(refund.amount),
                "status": refund.status,
                "reason": refund.reason,
                "response_code": refund.response_code,
                "transaction_status": refund.transaction_status,
                "created_at": refund.created_at.isoformat() if refund.created_at else None,
                "completed_at": refund.completed_at.isoformat() if refund.completed_at else None,
            }
            for refund in sorted(transaction.refunds, key=lambda item: item.id, reverse=True)
        ],
    }
