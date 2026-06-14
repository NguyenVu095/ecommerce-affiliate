import logging
from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload, joinedload
from app.db.database import get_db
from app.core.deps import get_current_shipper
from app.core.rate_limit import get_trusted_client_ip
from app.core.validation import clean_required_text, clean_text, normalize_public_code
from app.modules.user.models import User
from app.modules.order.models import Order, OrderStatusHistory, PaymentMethod
from app.modules.order.payment_service import initiate_full_refund
from app.modules.affiliate.models import AffiliateCommission
from app.modules.affiliate.routes import _dashboard_cache_invalidate
from app.modules.product.variant_models import ProductVariant

logger = logging.getLogger(__name__)

router = APIRouter()


class ShipmentDetailsUpdate(BaseModel):
    shipping_order_code: str = Field(min_length=3, max_length=50)
    expected_delivery_time: datetime | None = None


# Trạng thái giao hàng GHN và bước chuyển tiếp hợp lệ
GHN_FLOW: dict[str, dict] = {
    "ready_to_pick":     {"label": "Chờ lấy hàng",       "next": ["picking", "cancel"]},
    "picking":           {"label": "Đang lấy hàng",      "next": ["delivering", "cancel"]},
    "delivering":        {"label": "Đang giao hàng",     "next": ["delivered", "delivery_fail"]},
    "delivered":         {"label": "Giao thành công",    "next": []},
    "delivery_fail":     {"label": "Giao thất bại",      "next": ["delivering", "waiting_to_return"]},
    "waiting_to_return": {"label": "Chờ hoàn hàng",     "next": ["returned"]},
    "returned":          {"label": "Đã hoàn hàng",      "next": []},
    "cancel":            {"label": "Đã hủy",             "next": []},
}

# Ánh xạ từ trạng thái GHN sang trạng thái đơn hàng nội bộ
GHN_TO_ORDER_STATUS: dict[str, str] = {
    "ready_to_pick":     "confirmed",
    "picking":           "confirmed",
    "delivering":        "shipping",
    "delivered":         "success",
    "delivery_fail":     "shipping",
    "waiting_to_return": "shipping",
    "returned":          "cancelled",
    "cancel":            "cancelled",
}


def payment_allows_shipping(order: Order, payment_code: str) -> bool:
    """COD can ship unpaid; online payments must be confirmed before fulfillment."""
    return payment_code == "COD" or order.payment_status == "paid"


@router.get("/orders")
def get_shipper_orders(
    db: Session = Depends(get_db),
    current_shipper: User = Depends(get_current_shipper),
) -> list[dict[str, Any]]:
    """
    Lấy đơn đủ điều kiện vận chuyển và lịch sử giao/hoàn hàng.

    Tối ưu N+1 Query:
    - Cũ: Vòng lặp qua N đơn → K items mỗi đơn → mỗi item query DB 1 lần
      = N×K queries riêng lẻ (rất nặng khi có nhiều đơn).
    - Mới: Dùng `selectinload(Order.items)` tải trước toàn bộ items của N đơn
      bằng 1 query bổ sung; sau đó batch load toàn bộ ProductVariant+Product
      cần thiết bằng 1 query `joinedload` duy nhất — giảm từ N×K xuống còn
      2 queries bổ sung duy nhất.
    """
    orders = (
        db.query(Order)
        .filter(
            (Order.status.in_(["confirmed", "shipping", "success"]))
            | (
                (Order.status == "cancelled")
                & (Order.ghn_status.in_(["returned", "cancel"]))
            )
        )
        # selectinload tải trước tất cả items của mọi đơn hàng bằng 1 query bổ sung
        .options(selectinload(Order.items), joinedload(Order.payment_method))
        .order_by(Order.created_at.desc())
        .all()
    )
    orders = [
        order
        for order in orders
        if order.status != "confirmed"
        or payment_allows_shipping(
            order,
            order.payment_method.code.strip().upper() if order.payment_method else "",
        )
    ]

    # Batch load toàn bộ ProductVariant+Product cần thiết bằng 1 query duy nhất
    # (thay vì N×K queries trong vòng lặp lồng nhau)
    all_variant_ids: set[int] = {
        item.variant_id
        for o in orders
        for item in o.items
    }
    variants_map: dict[int, ProductVariant] = {}
    if all_variant_ids:
        variants_map = {
            v.id: v
            for v in db.query(ProductVariant)
            .filter(ProductVariant.id.in_(all_variant_ids))
            .options(joinedload(ProductVariant.product))
            .all()
        }

    result: list[dict[str, Any]] = []
    for o in orders:
        ghn_s = o.ghn_status or "ready_to_pick"
        flow  = GHN_FLOW.get(ghn_s, {"label": ghn_s, "next": []})

        # Tra cứu tên sản phẩm O(1) từ variants_map đã được preload
        items: list[dict[str, Any]] = []
        for item in o.items:
            variant = variants_map.get(item.variant_id)
            if variant and variant.product:
                variant_label = " / ".join(
                    str(value)
                    for value in (variant.attributes or {}).values()
                    if value
                )
                items.append({
                    "name": variant.product.name,
                    "variant": variant_label or None,
                    "sku": item.sku,
                    "quantity": item.quantity,
                })

        payment_code = o.payment_method.code.strip().upper() if o.payment_method else ""

        result.append({
            "id":            o.id,
            "order_code":    o.order_code,
            "order_status":  o.status,
            "ghn_status":    ghn_s,
            "ghn_label":     flow["label"],
            "next_statuses": [{"key": k, "label": GHN_FLOW[k]["label"]} for k in flow["next"]],
            "receiver_name": o.receiver_name,
            "receiver_phone": o.receiver_phone,
            "receiver_email": o.receiver_email,
            "total_final":   float(o.total_final),
            "shipping_fee":  float(o.shipping_fee),
            "payment_status": o.payment_status,
            "payment_method_code": payment_code,
            "cod_amount": float(o.total_final) if payment_code == "COD" and o.payment_status == "unpaid" else 0.0,
            "address":       o.shipping_full_address,
            "note":          o.note,
            "items":         items,
            "shipping_order_code": o.shipping_order_code,
            "expected_delivery_time": (
                o.expected_delivery_time.isoformat() if o.expected_delivery_time else None
            ),
            "created_at":    o.created_at.isoformat() if o.created_at else None,
            "updated_at":    o.updated_at.isoformat() if o.updated_at else None,
        })
    return result


@router.patch("/orders/{order_id}/shipment")
def update_shipment_details(
    order_id: int,
    body: ShipmentDetailsUpdate,
    db: Session = Depends(get_db),
    current_shipper: User = Depends(get_current_shipper),
) -> dict[str, Any]:
    order = db.query(Order).filter(Order.id == order_id).with_for_update(of=Order).first()
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")
    if order.status not in {"confirmed", "shipping"}:
        raise HTTPException(status_code=409, detail="Chỉ có thể cập nhật vận đơn đang chuẩn bị hoặc đang giao.")

    shipping_order_code = normalize_public_code(
        body.shipping_order_code,
        max_length=50,
        field_name="shipping_order_code",
    )
    if not shipping_order_code:
        raise HTTPException(status_code=400, detail="Mã vận đơn là bắt buộc.")
    current_time = (
        datetime.now(body.expected_delivery_time.tzinfo)
        if body.expected_delivery_time and body.expected_delivery_time.tzinfo
        else datetime.now()
    )
    if body.expected_delivery_time and body.expected_delivery_time < current_time:
        raise HTTPException(status_code=422, detail="Thời gian dự kiến giao phải ở tương lai.")

    order.shipping_order_code = shipping_order_code
    order.expected_delivery_time = body.expected_delivery_time
    db.add(OrderStatusHistory(
        order_id=order.id,
        status="shipping:details",
        note=f"Cập nhật mã vận đơn: {shipping_order_code}",
        changed_by=current_shipper.id,
    ))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Mã vận đơn đã được sử dụng cho đơn hàng khác.") from exc

    return {
        "message": "Cập nhật thông tin vận đơn thành công.",
        "order_id": order.id,
        "shipping_order_code": order.shipping_order_code,
        "expected_delivery_time": (
            order.expected_delivery_time.isoformat() if order.expected_delivery_time else None
        ),
    }


@router.patch("/orders/{order_id}/status")
def update_shipper_status(
    order_id: int,
    body: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_shipper: User = Depends(get_current_shipper),
) -> dict[str, Any]:
    """
    Cập nhật trạng thái giao hàng GHN của một đơn hàng.
    Tự động đồng bộ trạng thái đơn hàng nội bộ và xử lý hoàn trả (stock, coupon, commission)
    khi trạng thái chuyển sang 'cancelled'.

    Tối ưu N+1 Query trong luồng hoàn trả:
    - Cũ: Vòng lặp items → mỗi item query 1 variant với with_for_update() riêng = N queries.
    - Mới: Batch load toàn bộ variants của đơn bằng 1 query `.in_()` + `with_for_update()`
      vào dict, sau đó tra cứu O(1) trong vòng lặp = 1 query duy nhất.
    """
    new_ghn_status: str | None = body.get("ghn_status")
    note = clean_text(body.get("note"), max_length=500, field_name="note") or ""

    if not new_ghn_status or new_ghn_status not in GHN_FLOW:
        raise HTTPException(status_code=400, detail=f"Trạng thái không hợp lệ: {new_ghn_status}")

    # Khóa dòng đơn hàng để tránh race condition khi nhiều shipper cùng cập nhật
    order: Order | None = (
        db.query(Order)
        .filter(Order.id == order_id)
        .options(selectinload(Order.items))  # Preload items tránh Lazy Load sau
        .with_for_update(of=Order)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")

    old_status = order.status
    if old_status in ["success", "cancelled"]:
        raise HTTPException(
            status_code=400,
            detail=f"Không thể cập nhật đơn hàng đã ở trạng thái cuối '{old_status}'",
        )

    old_ghn_status = order.ghn_status or "ready_to_pick"
    if new_ghn_status != old_ghn_status:
        # Validate chuyển trạng thái GHN theo luồng hợp lệ
        valid_next = GHN_FLOW.get(old_ghn_status, {}).get("next", [])
        if new_ghn_status not in valid_next:
            raise HTTPException(
                status_code=400,
                detail=f"Không thể chuyển trạng thái giao hàng từ '{GHN_FLOW[old_ghn_status]['label']}' sang '{GHN_FLOW[new_ghn_status]['label']}'"
            )

    payment_method = db.query(PaymentMethod).filter(PaymentMethod.id == order.payment_method_id).first()
    payment_code = payment_method.code.strip().upper() if payment_method else ""
    if old_status == "confirmed" and not payment_allows_shipping(order, payment_code):
        raise HTTPException(
            status_code=409,
            detail="Đơn thanh toán trực tuyến chưa được xác nhận, không thể bắt đầu vận chuyển.",
        )

    order.ghn_status = new_ghn_status
    new_order_status = GHN_TO_ORDER_STATUS.get(new_ghn_status, order.status)

    # ── Xử lý hoàn trả khi shipper cập nhật hủy/trả hàng ──────────────────
    if new_order_status == "cancelled" and order.status != "cancelled":
        cancellation_reason = clean_required_text(note, max_length=500, field_name="reason")
        if len(cancellation_reason) < 5:
            raise HTTPException(status_code=422, detail="Vui lòng nhập lý do hủy/hoàn hàng ít nhất 5 ký tự.")
        if order.payment_status == "paid":
            if payment_code != "VNPAY":
                raise HTTPException(status_code=409, detail="Đơn đã thanh toán không hỗ trợ hoàn tiền tự động.")
            initiate_full_refund(
                db,
                order.id,
                current_shipper.id,
                cancellation_reason,
                get_trusted_client_ip(request),
            )
            db.refresh(order)
        logger.info("Đơn hàng #%s chuyển sang cancelled — bắt đầu hoàn trả stock/coupon/commission.", order_id)

        # Tối ưu N+1: Batch load toàn bộ variants bằng 1 query với SKIP LOCKED
        # thay vì query từng variant riêng lẻ trong vòng lặp
        item_variant_ids = [item.variant_id for item in order.items]
        variants_map: dict[int, ProductVariant] = {
            v.id: v
            for v in db.query(ProductVariant)
            .filter(ProductVariant.id.in_(item_variant_ids))
            .with_for_update()
            .all()
        }

        # Hoàn lại stock cho từng item — tra cứu O(1) từ dict
        for item in order.items:
            variant = variants_map.get(item.variant_id)
            if variant:
                variant.stock += item.quantity

        # Hoàn lại lượt dùng coupon và xóa usage record
        if order.coupon_id:
            from app.modules.coupon.models import Coupon, CouponUsage
            coupon: Coupon | None = (
                db.query(Coupon)
                .filter(Coupon.id == order.coupon_id)
                .with_for_update()
                .first()
            )
            if coupon:
                coupon.quantity += 1
            # Xóa coupon usage record để user có thể dùng lại mã
            db.query(CouponUsage).filter(
                CouponUsage.coupon_id == order.coupon_id,
                CouponUsage.order_id == order.id,
            ).delete()

        # Đánh dấu commission affiliate là cancelled
        commission: AffiliateCommission | None = (
            db.query(AffiliateCommission)
            .filter(AffiliateCommission.order_id == order.id)
            .first()
        )
        if commission:
            commission.status = "cancelled"

    order.status = new_order_status
    if new_order_status == "success":
        from app.modules.order.routes import ensure_order_can_be_completed

        ensure_order_can_be_completed(db, order)
    commission = db.query(AffiliateCommission).filter(AffiliateCommission.order_id == order.id).first()
    if commission and new_order_status == "success" and commission.status == "pending":
        commission.status = "approved"
        commission.approved_at = datetime.now()

    # Ghi lịch sử trạng thái
    db.add(OrderStatusHistory(
        order_id=order.id,
        status=f"ghn:{new_ghn_status}",
        note=note or f"Shipper cập nhật: {GHN_FLOW[new_ghn_status]['label']}",
        changed_by=current_shipper.id,
    ))

    # Commit duy nhất 1 lần — toàn bộ thay đổi (stock, coupon, commission, status, history)
    # được ghi đĩa nguyên tử trong 1 transaction duy nhất, đảm bảo tính ACID.
    db.commit()
    if commission:
        _dashboard_cache_invalidate(commission.user_id)

    logger.info(
        "Đơn hàng #%s: GHN status %s → %s, order status → %s (shipper_id=%s).",
        order_id, old_ghn_status, new_ghn_status, new_order_status, current_shipper.id
    )

    # Invalidate cache vì tồn kho hoặc trạng thái đơn đã thay đổi
    from app.core.cache import home_products_cache, product_cards_cache
    home_products_cache.invalidate()
    product_cards_cache.invalidate()

    flow = GHN_FLOW[new_ghn_status]
    return {
        "success":       True,
        "ghn_status":    new_ghn_status,
        "ghn_label":     flow["label"],
        "order_status":  order.status,
        "next_statuses": [{"key": k, "label": GHN_FLOW[k]["label"]} for k in flow["next"]],
    }
