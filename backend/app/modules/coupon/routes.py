import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_admin, get_current_user
from app.db.database import get_db
from app.modules.coupon.models import Coupon, CouponUsage
from app.modules.coupon.schemas import (
    CouponAvailableItem,
    CouponCreate,
    CouponResponse,
    CouponValidateRequest,
    CouponValidateResponse,
)
from app.modules.coupon.service import (
    calculate_coupon_discount,
    coupon_ineligibility_reason,
    coupon_usage_limit,
)
from app.modules.user.models import User

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/available", response_model=List[CouponAvailableItem])
def get_available_coupons(
    order_total: float = Query(0, ge=0, description="Tong gia tri don hang hien tai"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[CouponAvailableItem]:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    coupons = db.query(Coupon).filter(Coupon.status == 1).order_by(Coupon.id).all()
    usage_counts = {
        coupon_id: int(count)
        for coupon_id, count in (
            db.query(CouponUsage.coupon_id, func.count(CouponUsage.id))
            .filter(CouponUsage.user_id == current_user.id)
            .group_by(CouponUsage.coupon_id)
            .all()
        )
    }

    result: List[CouponAvailableItem] = []
    for coupon in coupons:
        if coupon.type == "percent":
            description = f"Giảm {int(coupon.value)}%"
            if coupon.max_discount:
                description += f", tối đa {int(coupon.max_discount):,}₫"
        else:
            description = f"Giảm {int(coupon.value):,}₫"
        if coupon.min_order and float(coupon.min_order) > 0:
            description += f" | Đơn từ {int(coupon.min_order):,}₫"

        usage_count = usage_counts.get(coupon.id, 0)
        is_used = usage_count >= coupon_usage_limit(coupon)
        ineligible_reason = coupon_ineligibility_reason(
            coupon,
            order_total,
            user_usage_count=usage_count,
            now=now,
        )
        result.append(
            CouponAvailableItem(
                id=coupon.id,
                code=coupon.code,
                type=coupon.type,
                value=float(coupon.value),
                max_discount=float(coupon.max_discount) if coupon.max_discount else None,
                min_order=float(coupon.min_order or 0),
                description=description,
                expired_at=coupon.expired_at,
                is_eligible=ineligible_reason is None,
                is_used=is_used,
                ineligible_reason=ineligible_reason,
            )
        )

    result.sort(key=lambda item: (not item.is_eligible, item.is_used, item.id))
    return result


@router.post("/validate", response_model=CouponValidateResponse)
def validate_coupon(
    data: CouponValidateRequest,
    db: Session = Depends(get_db),
) -> CouponValidateResponse:
    code = data.code.strip().upper()
    coupon = db.query(Coupon).filter(Coupon.code == code).first()
    if not coupon:
        return CouponValidateResponse(valid=False, message="Mã giảm giá không tồn tại")

    reason = coupon_ineligibility_reason(coupon, data.order_total)
    if reason:
        return CouponValidateResponse(valid=False, message=reason)

    return CouponValidateResponse(
        valid=True,
        message=f"Áp dụng mã {coupon.code} thành công",
        discount_amount=calculate_coupon_discount(coupon, data.order_total),
        coupon=coupon,
    )


@router.post("/", response_model=CouponResponse)
def create_coupon(
    coupon: CouponCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
) -> CouponResponse:
    data = coupon.model_dump()
    data["code"] = coupon.code.strip().upper()
    db_coupon = Coupon(**data)
    db.add(db_coupon)
    db.flush()

    response = CouponResponse.model_validate(db_coupon)
    db.commit()
    logger.info(
        "Admin created coupon: code=%s, type=%s, value=%s",
        db_coupon.code,
        db_coupon.type,
        db_coupon.value,
    )
    return response
