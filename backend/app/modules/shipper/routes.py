import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload, joinedload
from app.db.database import get_db
from app.core.deps import get_current_shipper
from app.modules.user.models import User
from app.modules.order.models import Order, OrderItem, OrderStatusHistory
from app.modules.product.variant_models import ProductVariant

logger = logging.getLogger(__name__)

router = APIRouter()

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


@router.get("/orders")
def get_shipper_orders(
    db: Session = Depends(get_db),
    current_shipper: User = Depends(get_current_shipper),
) -> list[dict[str, Any]]:
    """
    Lấy tất cả đơn hàng (trừ pending chưa xác nhận) cho màn hình Shipper.

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
        .filter(Order.status.in_(["confirmed", "shipping", "success", "cancelled"]))
        # selectinload tải trước tất cả items của mọi đơn hàng bằng 1 query bổ sung
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
        .all()
    )

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
        item_names: list[str] = []
        for item in o.items:
            variant = variants_map.get(item.variant_id)
            if variant and variant.product:
                item_names.append(f"{variant.product.name} x{item.quantity}")

        result.append({
            "id":            o.id,
            "order_code":    o.order_code,
            "status":        o.status,
            "ghn_status":    ghn_s,
            "ghn_label":     flow["label"],
            "next_statuses": [{"key": k, "label": GHN_FLOW[k]["label"]} for k in flow["next"]],
            "total_final":   float(o.total_final),
            "shipping_fee":  float(o.shipping_fee),
            "address":       o.shipping_full_address,
            "note":          o.note,
            "items":         item_names,
            "created_at":    o.created_at.isoformat() if o.created_at else None,
        })
    return result


@router.patch("/orders/{order_id}/status")
def update_shipper_status(
    order_id: int,
    body: dict,
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
    note: str = body.get("note", "")

    if not new_ghn_status or new_ghn_status not in GHN_FLOW:
        raise HTTPException(status_code=400, detail=f"Trạng thái không hợp lệ: {new_ghn_status}")

    # Khóa dòng đơn hàng để tránh race condition khi nhiều shipper cùng cập nhật
    order: Order | None = (
        db.query(Order)
        .filter(Order.id == order_id)
        .options(selectinload(Order.items))  # Preload items tránh Lazy Load sau
        .with_for_update()
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

    order.ghn_status = new_ghn_status
    new_order_status = GHN_TO_ORDER_STATUS.get(new_ghn_status, order.status)

    # ── Xử lý hoàn trả khi shipper cập nhật hủy/trả hàng ──────────────────
    if new_order_status == "cancelled" and order.status != "cancelled":
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
        from app.modules.affiliate.models import AffiliateCommission
        commission: AffiliateCommission | None = (
            db.query(AffiliateCommission)
            .filter(AffiliateCommission.order_id == order.id)
            .first()
        )
        if commission:
            commission.status = "cancelled"

    order.status = new_order_status

    # Ghi lịch sử trạng thái
    db.add(OrderStatusHistory(
        order_id=order.id,
        status=f"ghn:{new_ghn_status}",
        note=note or f"Shipper cập nhật: {GHN_FLOW[new_ghn_status]['label']}",
    ))

    # Commit duy nhất 1 lần — toàn bộ thay đổi (stock, coupon, commission, status, history)
    # được ghi đĩa nguyên tử trong 1 transaction duy nhất, đảm bảo tính ACID.
    db.commit()

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
