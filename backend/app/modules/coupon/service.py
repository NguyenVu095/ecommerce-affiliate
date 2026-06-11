"""Shared coupon eligibility and discount helpers."""

from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.coupon.models import Coupon, CouponUsage


def coupon_usage_limit(coupon: Coupon) -> int:
    """Return a defensive positive per-user usage limit."""
    return max(1, int(coupon.max_uses_per_user or 1))


def get_user_coupon_usage_count(db: Session, coupon_id: int, user_id: int) -> int:
    """Count usage records for one user and coupon."""
    return int(
        db.query(func.count(CouponUsage.id))
        .filter(CouponUsage.coupon_id == coupon_id, CouponUsage.user_id == user_id)
        .scalar()
        or 0
    )


def coupon_ineligibility_reason(
    coupon: Coupon,
    order_total: float,
    *,
    user_usage_count: int = 0,
    now: datetime | None = None,
) -> str | None:
    """Return the first reason a coupon cannot be used, or None."""
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    if coupon.applicable_type != "all":
        return "Phạm vi áp dụng của mã giảm giá chưa được hỗ trợ"
    if coupon.status != 1:
        return "Mã giảm giá không còn hoạt động"
    if user_usage_count >= coupon_usage_limit(coupon):
        return f"Bạn đã dùng hết {coupon_usage_limit(coupon)} lượt của mã giảm giá này"
    if coupon.quantity <= 0:
        return "Mã giảm giá đã hết lượt sử dụng"
    if coupon.expired_at and coupon.expired_at < now:
        return "Mã giảm giá đã hết hạn"
    if coupon.start_at and coupon.start_at > now:
        return "Mã giảm giá chưa đến thời gian áp dụng"
    if order_total < float(coupon.min_order or 0):
        return f"Đơn hàng tối thiểu {int(coupon.min_order or 0):,}₫ để sử dụng mã này"
    return None


def calculate_coupon_discount(coupon: Coupon, order_total: float) -> float:
    """Calculate a bounded discount from trusted server-side values."""
    if coupon.type == "percent":
        discount = order_total * float(coupon.value) / 100
        if coupon.max_discount:
            discount = min(discount, float(coupon.max_discount))
    else:
        discount = float(coupon.value)
    return min(discount, order_total)
