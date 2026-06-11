import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, aliased, joinedload, selectinload
from sqlalchemy import func, cast, Date, or_
from typing import List, Optional
from datetime import datetime, date, timedelta

from app.db.database import get_db
from app.core.deps import get_current_admin
from app.core.cache import category_cache, category_descendants_cache, home_products_cache, product_cards_cache
from app.core.validation import clean_required_text, clean_text, normalize_public_code, normalize_url
from app.modules.user.models import User
from app.modules.order.models import Order, OrderItem, OrderStatusHistory
from app.modules.affiliate.models import AffiliateClick, AffiliateCommission, AffiliateConversion, AffiliateLink
from app.modules.product.variant_models import ProductVariant
from app.modules.product.models import Product
from app.modules.category.models import Category
from app.modules.coupon.models import Coupon, CouponUsage
from pydantic import BaseModel, Field
from typing import Literal

router = APIRouter()

logger = logging.getLogger(__name__)

# ─── Schemas ─────────────────────────────────────────────────────────────────

class OrderItemAdminResponse(BaseModel):
    id: int
    variant_id: int
    quantity: int
    price: float
    sku: Optional[str] = None
    product_name: Optional[str] = None
    variant_name: Optional[str] = None

    class Config:
        from_attributes = True

class OrderAdminResponse(BaseModel):
    id: int
    order_code: str
    status: str
    payment_status: str
    user_id: Optional[int] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    coupon_code: Optional[str] = None
    receiver_name: Optional[str] = None
    receiver_phone: Optional[str] = None
    receiver_email: Optional[str] = None
    total_base_price: float
    shipping_fee: float
    discount_amount: float
    total_final: float
    shipping_full_address: str
    note: Optional[str] = None
    shipping_order_code: Optional[str] = None
    ghn_status: Optional[str] = None
    expected_delivery_time: Optional[datetime] = None
    created_at: Optional[datetime] = None
    items: List[OrderItemAdminResponse] = []

    class Config:
        from_attributes = True

class OrderStatusUpdate(BaseModel):
    status: str
    note: Optional[str] = None

class StatsResponse(BaseModel):
    total_orders: int
    orders_today: int
    pending_orders: int
    confirmed_orders: int
    shipping_orders: int
    cancelled_orders: int
    revenue_today: float
    revenue_total: float

class AffiliateCommissionStatusUpdate(BaseModel):
    status: Literal["pending", "approved", "paid", "cancelled"]
    note: Optional[str] = None

AFFILIATE_STATUSES = ("pending", "approved", "paid", "cancelled")


def _clean_product_data(data: dict) -> dict:
    if "name" in data and data["name"] is not None:
        data["name"] = clean_required_text(data["name"], max_length=255, field_name="name")
    if "slug" in data and data["slug"] is not None:
        data["slug"] = normalize_public_code(data["slug"], max_length=100, field_name="slug")
    if "description" in data:
        data["description"] = clean_text(data.get("description"), max_length=5000, field_name="description")
    if "thumbnail" in data:
        data["thumbnail"] = normalize_url(data.get("thumbnail"), max_length=2048, field_name="thumbnail")
    return data


def _clean_variant_data(data: dict) -> dict:
    if "sku" in data:
        data["sku"] = clean_text(data.get("sku"), max_length=100, field_name="sku")
    if "image_url" in data:
        data["image_url"] = normalize_url(data.get("image_url"), max_length=2048, field_name="image_url")
    return data

def _float_or_zero(value) -> float:
    return float(value or 0)

def _affiliate_user_query(db: Session):
    return db.query(User).filter(
        or_(
            User.referral_code.isnot(None),
            User.id.in_(db.query(AffiliateLink.user_id)),
            User.id.in_(db.query(AffiliateClick.referrer_user_id)),
            User.id.in_(db.query(AffiliateCommission.user_id)),
            User.id.in_(db.query(AffiliateConversion.referrer_user_id)),
        )
    )

# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/stats", response_model=StatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    today = date.today()

    total_orders = db.query(func.count(Order.id)).scalar() or 0
    orders_today = db.query(func.count(Order.id)).filter(
        cast(Order.created_at, Date) == today
    ).scalar() or 0
    pending_orders = db.query(func.count(Order.id)).filter(Order.status == "pending").scalar() or 0
    confirmed_orders = db.query(func.count(Order.id)).filter(Order.status == "confirmed").scalar() or 0
    shipping_orders = db.query(func.count(Order.id)).filter(Order.status == "shipping").scalar() or 0
    cancelled_orders = db.query(func.count(Order.id)).filter(Order.status == "cancelled").scalar() or 0

    revenue_today = db.query(func.sum(Order.total_final)).filter(
        cast(Order.created_at, Date) == today,
        Order.status != "cancelled"
    ).scalar() or 0.0
    revenue_total = db.query(func.sum(Order.total_final)).filter(
        Order.status != "cancelled"
    ).scalar() or 0.0

    return StatsResponse(
        total_orders=total_orders,
        orders_today=orders_today,
        pending_orders=pending_orders,
        confirmed_orders=confirmed_orders,
        shipping_orders=shipping_orders,
        cancelled_orders=cancelled_orders,
        revenue_today=float(revenue_today),
        revenue_total=float(revenue_total),
    )


@router.get("/revenue-chart", response_model=dict)
def admin_get_revenue_chart(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
):
    today = date.today()
    chart_year = year or today.year
    chart_month = month or today.month
    start_date = date(chart_year, chart_month, 1)
    if chart_month == 12:
        next_month = date(chart_year + 1, 1, 1)
    else:
        next_month = date(chart_year, chart_month + 1, 1)

    rows = (
        db.query(
            cast(Order.created_at, Date),
            func.count(Order.id),
            func.sum(Order.total_final),
        )
        .filter(
            Order.created_at >= datetime.combine(start_date, datetime.min.time()),
            Order.created_at < datetime.combine(next_month, datetime.min.time()),
            Order.status != "cancelled",
        )
        .group_by(cast(Order.created_at, Date))
        .all()
    )

    revenue_by_day = {
        str(day): {
            "orders": int(order_count or 0),
            "revenue": float(revenue or 0),
        }
        for day, order_count, revenue in rows
    }

    data = []
    cursor = start_date
    total_orders = 0
    total_revenue = 0.0
    while cursor < next_month:
        day_key = cursor.isoformat()
        day_data = revenue_by_day.get(day_key, {"orders": 0, "revenue": 0.0})
        total_orders += day_data["orders"]
        total_revenue += day_data["revenue"]
        data.append({
            "date": day_key,
            "day": cursor.day,
            "orders": day_data["orders"],
            "revenue": day_data["revenue"],
        })
        cursor += timedelta(days=1)

    return {
        "year": chart_year,
        "month": chart_month,
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "average_order_value": round(total_revenue / total_orders, 2) if total_orders else 0,
        "data": data,
    }


@router.get("/affiliate-stats", response_model=dict)
def admin_get_affiliate_stats(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    total_affiliates = _affiliate_user_query(db).count()
    total_links = db.query(func.count(AffiliateLink.id)).scalar() or 0
    active_links = db.query(func.count(AffiliateLink.id)).filter(AffiliateLink.status == "active").scalar() or 0
    total_clicks = db.query(func.count(AffiliateClick.id)).scalar() or 0
    total_orders = (
        db.query(func.count(AffiliateConversion.id))
        .join(AffiliateCommission, AffiliateCommission.id == AffiliateConversion.commission_id)
        .filter(AffiliateCommission.status != "cancelled")
        .scalar()
        or 0
    )
    revenue_attributed = (
        db.query(func.sum(AffiliateCommission.order_total))
        .filter(AffiliateCommission.status != "cancelled")
        .scalar()
        or 0
    )

    commission_by_status = {status: 0.0 for status in AFFILIATE_STATUSES}
    rows = (
        db.query(AffiliateCommission.status, func.sum(AffiliateCommission.amount))
        .group_by(AffiliateCommission.status)
        .all()
    )
    for status, amount in rows:
        if status in commission_by_status:
            commission_by_status[status] = _float_or_zero(amount)

    payable_commission = commission_by_status["approved"]
    total_commission = (
        commission_by_status["pending"]
        + commission_by_status["approved"]
        + commission_by_status["paid"]
    )
    conversion_rate = round((total_orders / total_clicks) * 100, 2) if total_clicks else 0.0

    return {
        "total_affiliates": total_affiliates,
        "total_links": total_links,
        "active_links": active_links,
        "total_clicks": total_clicks,
        "total_orders": total_orders,
        "conversion_rate": conversion_rate,
        "revenue_attributed": _float_or_zero(revenue_attributed),
        "total_commission": total_commission,
        "pending_commission": commission_by_status["pending"],
        "approved_commission": commission_by_status["approved"],
        "paid_commission": commission_by_status["paid"],
        "cancelled_commission": commission_by_status["cancelled"],
        "payable_commission": payable_commission,
    }


@router.get("/affiliates", response_model=dict)
def admin_get_affiliates(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Optional[int] = Query(None),
):
    query = _affiliate_user_query(db)

    if search:
        keyword = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(keyword),
                User.email.ilike(keyword),
                User.phone.ilike(keyword),
                User.referral_code.ilike(keyword),
            )
        )
    if status is not None:
        query = query.filter(User.status == status)

    total = query.count()
    users = (
        query.order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    user_ids = [user.id for user in users]

    link_count_by_user = {}
    active_link_count_by_user = {}
    click_count_by_user = {}
    order_count_by_user = {}
    commission_by_user_status = {}
    last_link_by_user = {}
    last_click_by_user = {}
    last_order_by_user = {}

    if user_ids:
        link_count_by_user = {
            user_id: count
            for user_id, count in (
                db.query(AffiliateLink.user_id, func.count(AffiliateLink.id))
                .filter(AffiliateLink.user_id.in_(user_ids))
                .group_by(AffiliateLink.user_id)
                .all()
            )
        }
        active_link_count_by_user = {
            user_id: count
            for user_id, count in (
                db.query(AffiliateLink.user_id, func.count(AffiliateLink.id))
                .filter(AffiliateLink.user_id.in_(user_ids), AffiliateLink.status == "active")
                .group_by(AffiliateLink.user_id)
                .all()
            )
        }
        last_link_by_user = {
            user_id: last_at
            for user_id, last_at in (
                db.query(AffiliateLink.user_id, func.max(AffiliateLink.created_at))
                .filter(AffiliateLink.user_id.in_(user_ids))
                .group_by(AffiliateLink.user_id)
                .all()
            )
        }
        click_rows = (
            db.query(
                AffiliateClick.referrer_user_id,
                func.count(AffiliateClick.id),
                func.max(AffiliateClick.created_at),
            )
            .filter(AffiliateClick.referrer_user_id.in_(user_ids))
            .group_by(AffiliateClick.referrer_user_id)
            .all()
        )
        click_count_by_user = {user_id: count for user_id, count, _ in click_rows}
        last_click_by_user = {user_id: last_at for user_id, _, last_at in click_rows}
        order_count_by_user = {
            user_id: count
            for user_id, count in (
                db.query(AffiliateConversion.referrer_user_id, func.count(AffiliateConversion.id))
                .join(AffiliateCommission, AffiliateCommission.id == AffiliateConversion.commission_id)
                .filter(
                    AffiliateConversion.referrer_user_id.in_(user_ids),
                    AffiliateCommission.status != "cancelled",
                )
                .group_by(AffiliateConversion.referrer_user_id)
                .all()
            )
        }
        last_order_by_user = {
            user_id: last_at
            for user_id, last_at in (
                db.query(AffiliateConversion.referrer_user_id, func.max(AffiliateConversion.created_at))
                .filter(AffiliateConversion.referrer_user_id.in_(user_ids))
                .group_by(AffiliateConversion.referrer_user_id)
                .all()
            )
        }
        for user_id, status_name, amount in (
            db.query(
                AffiliateCommission.user_id,
                AffiliateCommission.status,
                func.sum(AffiliateCommission.amount),
            )
            .filter(AffiliateCommission.user_id.in_(user_ids))
            .group_by(AffiliateCommission.user_id, AffiliateCommission.status)
            .all()
        ):
            commission_by_user_status.setdefault(user_id, {})[status_name] = _float_or_zero(amount)

    result = []
    for user in users:
        commission_by_status = {status_name: 0.0 for status_name in AFFILIATE_STATUSES}
        for status_name, amount in commission_by_user_status.get(user.id, {}).items():
            if status_name in commission_by_status:
                commission_by_status[status_name] = amount

        link_count = link_count_by_user.get(user.id, 0)
        active_link_count = active_link_count_by_user.get(user.id, 0)
        click_count = click_count_by_user.get(user.id, 0)
        order_count = order_count_by_user.get(user.id, 0)
        last_link_at = last_link_by_user.get(user.id)
        last_click_at = last_click_by_user.get(user.id)
        last_order_at = last_order_by_user.get(user.id)
        activity_dates = [value for value in [last_link_at, last_click_at, last_order_at] if value]
        last_activity_at = max(activity_dates) if activity_dates else None

        pending_commission = commission_by_status["pending"]
        approved_commission = commission_by_status["approved"]
        paid_commission = commission_by_status["paid"]
        total_commission = pending_commission + approved_commission + paid_commission
        conversion_rate = round((order_count / click_count) * 100, 2) if click_count else 0.0

        result.append({
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "status": user.status,
            "referral_code": user.referral_code or f"AFF{user.id}",
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_activity_at": last_activity_at.isoformat() if last_activity_at else None,
            "link_count": link_count,
            "active_link_count": active_link_count,
            "click_count": click_count,
            "order_count": order_count,
            "conversion_rate": conversion_rate,
            "pending_commission": pending_commission,
            "approved_commission": approved_commission,
            "paid_commission": paid_commission,
            "cancelled_commission": commission_by_status["cancelled"],
            "total_commission": total_commission,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "data": result,
    }


@router.get("/affiliate-commissions", response_model=dict)
def admin_get_affiliate_commissions(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    if status and status not in AFFILIATE_STATUSES:
        raise HTTPException(status_code=400, detail="Trạng thái hoa hồng không hợp lệ")

    query = (
        db.query(AffiliateCommission, Order, User, AffiliateLink)
        .join(Order, Order.id == AffiliateCommission.order_id)
        .join(User, User.id == AffiliateCommission.user_id)
        .outerjoin(AffiliateLink, AffiliateLink.id == AffiliateCommission.affiliate_link_id)
    )

    if status:
        query = query.filter(AffiliateCommission.status == status)
    if search:
        keyword = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Order.order_code.ilike(keyword),
                User.full_name.ilike(keyword),
                User.email.ilike(keyword),
                User.referral_code.ilike(keyword),
                AffiliateLink.campaign_name.ilike(keyword),
                AffiliateLink.channel.ilike(keyword),
            )
        )

    total = query.count()
    rows = (
        query.order_by(Order.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    result = []
    for commission, order, user, link in rows:
        result.append({
            "id": commission.id,
            "user_id": user.id,
            "user_name": user.full_name,
            "user_email": user.email,
            "referral_code": user.referral_code or f"AFF{user.id}",
            "order_id": order.id,
            "order_code": order.order_code,
            "order_status": order.status,
            "order_total": _float_or_zero(commission.order_total),
            "commission_rate": _float_or_zero(commission.commission_rate),
            "amount": _float_or_zero(commission.amount),
            "status": commission.status,
            "campaign_name": link.campaign_name if link else None,
            "channel": link.channel if link else None,
            "note": commission.note,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "approved_at": commission.approved_at.isoformat() if commission.approved_at else None,
            "paid_at": commission.paid_at.isoformat() if commission.paid_at else None,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "data": result,
    }


@router.get("/affiliate-conversions", response_model=dict)
def admin_get_affiliate_conversions(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    attribution_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    if attribution_type and attribution_type not in {"cookie", "code", "manual"}:
        raise HTTPException(status_code=400, detail="Attribution type khong hop le")
    if status and status not in AFFILIATE_STATUSES:
        raise HTTPException(status_code=400, detail="Trang thai hoa hong khong hop le")

    Referrer = aliased(User)
    Buyer = aliased(User)
    query = (
        db.query(AffiliateConversion, AffiliateCommission, Order, Referrer, Buyer, AffiliateLink)
        .join(AffiliateCommission, AffiliateCommission.id == AffiliateConversion.commission_id)
        .join(Order, Order.id == AffiliateConversion.order_id)
        .join(Referrer, Referrer.id == AffiliateConversion.referrer_user_id)
        .outerjoin(Buyer, Buyer.id == AffiliateConversion.referred_user_id)
        .outerjoin(AffiliateLink, AffiliateLink.id == AffiliateCommission.affiliate_link_id)
    )

    if attribution_type:
        query = query.filter(AffiliateConversion.attribution_type == attribution_type)
    if status:
        query = query.filter(AffiliateCommission.status == status)
    if search:
        keyword = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Order.order_code.ilike(keyword),
                Referrer.full_name.ilike(keyword),
                Referrer.email.ilike(keyword),
                Referrer.referral_code.ilike(keyword),
                Buyer.full_name.ilike(keyword),
                Buyer.email.ilike(keyword),
                AffiliateLink.campaign_name.ilike(keyword),
                AffiliateLink.channel.ilike(keyword),
            )
        )
    if date_from:
        query = query.filter(AffiliateConversion.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(AffiliateConversion.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))

    total = query.count()
    valid_query = query.filter(AffiliateCommission.status != "cancelled")
    valid_conversions = valid_query.count()

    total_clicks_query = db.query(func.count(AffiliateClick.id))
    if date_from:
        total_clicks_query = total_clicks_query.filter(AffiliateClick.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        total_clicks_query = total_clicks_query.filter(AffiliateClick.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    total_clicks = int(total_clicks_query.scalar() or 0)

    attr_rows = (
        query.with_entities(AffiliateConversion.attribution_type, func.count(AffiliateConversion.id))
        .group_by(AffiliateConversion.attribution_type)
        .all()
    )
    by_attribution = {"cookie": 0, "code": 0, "manual": 0}
    for attr, count in attr_rows:
        if attr in by_attribution:
            by_attribution[attr] = int(count or 0)

    rows = (
        query.order_by(AffiliateConversion.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    result = []
    for conversion, commission, order, referrer, buyer, link in rows:
        result.append({
            "id": conversion.id,
            "order_id": order.id,
            "order_code": order.order_code,
            "order_status": order.status,
            "referrer_user_id": referrer.id,
            "referrer_name": referrer.full_name,
            "referrer_email": referrer.email,
            "referral_code": referrer.referral_code or f"AFF{referrer.id}",
            "referred_user_id": buyer.id if buyer else None,
            "buyer_name": buyer.full_name if buyer else None,
            "buyer_email": buyer.email if buyer else None,
            "commission_id": commission.id,
            "commission_status": commission.status,
            "order_total": _float_or_zero(commission.order_total),
            "commission_amount": _float_or_zero(commission.amount),
            "attribution_type": conversion.attribution_type or "code",
            "campaign_name": link.campaign_name if link else None,
            "channel": link.channel if link else None,
            "created_at": conversion.created_at.isoformat() if conversion.created_at else None,
        })

    total_order_value = _float_or_zero(valid_query.with_entities(func.sum(AffiliateCommission.order_total)).scalar())
    total_commission = _float_or_zero(valid_query.with_entities(func.sum(AffiliateCommission.amount)).scalar())
    unique_buyers = int(query.with_entities(func.count(func.distinct(AffiliateConversion.referred_user_id))).scalar() or 0)

    return {
        "summary": {
            "total_conversions": total,
            "valid_conversions": valid_conversions,
            "total_clicks": total_clicks,
            "conversion_rate": round((valid_conversions / total_clicks) * 100, 2) if total_clicks else 0.0,
            "unique_buyers": unique_buyers,
            "total_order_value": round(total_order_value, 2),
            "total_commission": round(total_commission, 2),
            "by_attribution": by_attribution,
        },
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "data": result,
    }


@router.patch("/affiliate-commissions/{commission_id}/status", response_model=dict)
def admin_update_affiliate_commission_status(
    commission_id: int,
    body: AffiliateCommissionStatusUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """
    Cập nhật trạng thái hoa hồng (pending/approved/paid/cancelled).
    Tối ưu: loại bỏ db.refresh() dư thừa, build response từ object session-tracked trong memory.
    Thay datetime.utcnow() đã deprecated bằng datetime.now().
    """
    commission = db.query(AffiliateCommission).filter(AffiliateCommission.id == commission_id).first()
    if not commission:
        raise HTTPException(status_code=404, detail="Không tìm thấy hoa hồng")

    now = datetime.now()
    commission.status = body.status
    if body.status == "approved" and commission.approved_at is None:
        commission.approved_at = now
    elif body.status == "paid":
        if commission.approved_at is None:
            commission.approved_at = now
        commission.paid_at = now
    elif body.status == "pending":
        commission.approved_at = None
        commission.paid_at = None

    if body.note is not None:
        commission.note = clean_text(body.note, max_length=1000, field_name="note")

    db.commit()
    # Tối ưu: không gọi db.refresh() — các giá trị đã được gán trực tiếp vào object
    # và session đang tracking đầy đủ trạng thái, không cần load lại từ DB.
    logger.info("Commission status updated: commission_id=%d, status=%s", commission_id, body.status)
    return {
        "message": "Cập nhật trạng thái hoa hồng thành công",
        "commission_id": commission.id,
        "status": commission.status,
        "approved_at": commission.approved_at.isoformat() if commission.approved_at else None,
        "paid_at": commission.paid_at.isoformat() if commission.paid_at else None,
    }


@router.get("/orders", response_model=dict)
def get_all_orders(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),  # tìm theo order_code hoặc receiver_name
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
):
    """
    Lấy danh sách đơn hàng cho admin.
    Tối ưu N+1: batch load User bằng 1 query .in_() và joinedload items→variant→product
    thay vì gọi db.query(User) và db.query(ProductVariant/Product) trong từng vòng lặp.
    """
    query = db.query(Order)

    if status:
        query = query.filter(Order.status == status)
    if payment_status:
        query = query.filter(Order.payment_status == payment_status)
    if search:
        query = query.filter(
            Order.order_code.ilike(f"%{search}%") |
            Order.receiver_name.ilike(f"%{search}%") |
            Order.receiver_phone.ilike(f"%{search}%")
        )
    if date_from:
        query = query.filter(Order.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(Order.created_at <= datetime.combine(date_to, datetime.max.time()))

    total = query.count()
    orders = (
        query.order_by(Order.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Tối ưu N+1 Batch Load #1: Load tất cả User cần thiết bằng 1 query .in_()
    # thay vì gọi db.query(User) trong từng vòng lặp — giảm từ N queries xuống 1 query.
    user_ids = list({o.user_id for o in orders if o.user_id})
    user_map: dict[int, User] = {}
    if user_ids:
        user_map = {
            u.id: u
            for u in db.query(User).filter(User.id.in_(user_ids)).all()
        }

    # Tối ưu N+1 Batch Load #2: Load tất cả Variant (kèm joinedload Product) bằng 1 query
    # thay vì gọi db.query(ProductVariant) + db.query(Product) trong từng item của từng order.
    # Bước 1: thu thập hết variant_ids cần thiết
    all_variant_ids = list({item.variant_id for o in orders for item in o.items})
    variant_map: dict[int, ProductVariant] = {}
    if all_variant_ids:
        variant_map = {
            v.id: v
            for v in (
                db.query(ProductVariant)
                .options(joinedload(ProductVariant.product))
                .filter(ProductVariant.id.in_(all_variant_ids))
                .all()
            )
        }

    result = []
    for order in orders:
        user = user_map.get(order.user_id) if order.user_id else None

        items_data = []
        for item in order.items:
            variant = variant_map.get(item.variant_id)
            product_name = variant.product.name if variant and variant.product else None
            variant_name = variant.name if variant and hasattr(variant, 'name') else None
            items_data.append(OrderItemAdminResponse(
                id=item.id,
                variant_id=item.variant_id,
                quantity=item.quantity,
                price=float(item.price),
                sku=item.sku,
                product_name=product_name,
                variant_name=variant_name,
            ))

        result.append(OrderAdminResponse(
            id=order.id,
            order_code=order.order_code,
            status=order.status,
            payment_status=order.payment_status,
            user_id=order.user_id,
            user_email=user.email if user else None,
            user_name=user.full_name if user else None,
            coupon_code=order.coupon_code,
            receiver_name=order.receiver_name,
            receiver_phone=order.receiver_phone,
            receiver_email=order.receiver_email,
            total_base_price=float(order.total_base_price),
            shipping_fee=float(order.shipping_fee),
            discount_amount=float(order.discount_amount),
            total_final=float(order.total_final),
            shipping_full_address=order.shipping_full_address,
            note=order.note,
            shipping_order_code=order.shipping_order_code,
            ghn_status=order.ghn_status,
            expected_delivery_time=order.expected_delivery_time,
            created_at=order.created_at,
            items=items_data,
        ))

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "data": [r.model_dump() for r in result],
    }


@router.get("/orders/{order_id}", response_model=OrderAdminResponse)
def get_order_detail(
    order_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """
    Lấy chi tiết một đơn hàng.
    Tối ưu N+1: batch load Variant (kèm joinedload Product) bằng 1 query .in_()
    thay vì gọi db.query(ProductVariant) + db.query(Product) cho từng item.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")

    user = db.query(User).filter(User.id == order.user_id).first() if order.user_id else None

    # Tối ưu N+1: batch load tất cả variant + product liên quan trong 1 query
    variant_ids = [item.variant_id for item in order.items]
    variant_map: dict[int, ProductVariant] = {}
    if variant_ids:
        variant_map = {
            v.id: v
            for v in (
                db.query(ProductVariant)
                .options(joinedload(ProductVariant.product))
                .filter(ProductVariant.id.in_(variant_ids))
                .all()
            )
        }

    items_data = []
    for item in order.items:
        variant = variant_map.get(item.variant_id)
        product_name = variant.product.name if variant and variant.product else None
        variant_name = variant.name if variant and hasattr(variant, 'name') else None
        items_data.append(OrderItemAdminResponse(
            id=item.id,
            variant_id=item.variant_id,
            quantity=item.quantity,
            price=float(item.price),
            sku=item.sku,
            product_name=product_name,
            variant_name=variant_name,
        ))

    return OrderAdminResponse(
        id=order.id,
        order_code=order.order_code,
        status=order.status,
        payment_status=order.payment_status,
        user_id=order.user_id,
        user_email=user.email if user else None,
        user_name=user.full_name if user else None,
        coupon_code=order.coupon_code,
        receiver_name=order.receiver_name,
        receiver_phone=order.receiver_phone,
        receiver_email=order.receiver_email,
        total_base_price=float(order.total_base_price),
        shipping_fee=float(order.shipping_fee),
        discount_amount=float(order.discount_amount),
        total_final=float(order.total_final),
        shipping_full_address=order.shipping_full_address,
        note=order.note,
        shipping_order_code=order.shipping_order_code,
        ghn_status=order.ghn_status,
        expected_delivery_time=order.expected_delivery_time,
        created_at=order.created_at,
        items=items_data,
    )


@router.patch("/orders/{order_id}/status")
def update_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    VALID_STATUSES = ["pending", "confirmed", "shipping", "success", "cancelled"]
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Trạng thái không hợp lệ. Chọn: {VALID_STATUSES}")

    # Khóa dòng đơn hàng để tránh race condition
    order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")

    old_status = order.status
    if old_status == body.status:
        return {"message": "Trạng thái không thay đổi", "order_id": order.id, "status": order.status}

    # Chặn cập nhật trạng thái nếu đơn hàng đã thành công hoặc đã bị hủy
    if old_status in ["success", "cancelled"]:
        raise HTTPException(
            status_code=400,
            detail=f"Không thể cập nhật đơn hàng đã ở trạng thái cuối '{old_status}'",
        )

    # ── Xử lý khi trạng thái chuyển sang CANCELLED ─────────────────────────
    if body.status == "cancelled":
        # Hoàn lại stock cho từng item
        for item in order.items:
            variant = db.query(ProductVariant).filter(ProductVariant.id == item.variant_id).with_for_update().first()
            if variant:
                variant.stock += item.quantity

        # Hoàn lại lượt dùng coupon (nếu có)
        if order.coupon_id:
            from app.modules.coupon.models import Coupon, CouponUsage
            coupon = db.query(Coupon).filter(Coupon.id == order.coupon_id).with_for_update().first()
            if coupon:
                coupon.quantity += 1
            # Xóa coupon usage record
            db.query(CouponUsage).filter(
                CouponUsage.coupon_id == order.coupon_id,
                CouponUsage.order_id == order.id,
            ).delete()

    order.status = body.status

    # Tự động cập nhật payment_status khi đơn thành công
    if body.status == "success":
        order.payment_status = "paid"

    # Ghi lịch sử trạng thái & commission
    commission = db.query(AffiliateCommission).filter(AffiliateCommission.order_id == order.id).first()
    if commission:
        if body.status == "success":
            commission.status = "approved"
            commission.approved_at = datetime.utcnow()
        elif body.status == "cancelled":
            commission.status = "cancelled"

    db.add(OrderStatusHistory(
        order_id=order.id,
        status=body.status,
        note=clean_text(body.note, max_length=1000, field_name="note") or f"Admin update: {old_status} -> {body.status}",
        changed_by=current_admin.id,
    ))

    db.commit()
    db.refresh(order)

    # Invalidate cache vì stock sản phẩm đã có thay đổi
    home_products_cache.invalidate()
    product_cards_cache.invalidate()

    return {"message": "Cập nhật trạng thái thành công", "order_id": order.id, "status": order.status}


# ─────────────────────────────────────────────────────────────────────────────
# PRODUCT MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

class VariantCreateAdmin(BaseModel):
    sku: Optional[str] = None
    attributes: Optional[dict] = None
    price: float
    sale_price: Optional[float] = None
    stock: int = 0
    image_url: Optional[str] = None
    weight: int = 0
    length: int = 0
    width: int = 0
    height: int = 0

class ProductCreateAdmin(BaseModel):
    name: str
    slug: str
    category_id: Optional[int] = None
    description: Optional[str] = None
    base_price: float
    thumbnail: Optional[str] = None
    gender: int = 2
    status: int = 1
    variants: List[VariantCreateAdmin] = []

class ProductUpdateAdmin(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    base_price: Optional[float] = None
    thumbnail: Optional[str] = None
    gender: Optional[int] = None
    status: Optional[int] = None

class VariantUpdateAdmin(BaseModel):
    id: Optional[int] = None  # None = new variant
    sku: Optional[str] = None
    attributes: Optional[dict] = None
    price: float
    sale_price: Optional[float] = None
    stock: int = 0
    image_url: Optional[str] = None
    weight: int = 0
    length: int = 0
    width: int = 0
    height: int = 0
    _delete: bool = False

class ProductWithVariantsUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    base_price: Optional[float] = None
    thumbnail: Optional[str] = None
    gender: Optional[int] = None
    status: Optional[int] = None
    variants: Optional[List[VariantUpdateAdmin]] = None
    delete_variant_ids: Optional[List[int]] = []


@router.get("/products", response_model=dict)
def admin_get_products(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    status: Optional[int] = Query(None),
    gender: Optional[int] = Query(None),
):
    query = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.variants),
    ).filter(Product.deleted_at.is_(None))

    if search:
        query = query.filter(
            or_(
                Product.name.ilike(f"%{search}%"),
                Product.slug.ilike(f"%{search}%"),
            )
        )
    if category_id is not None:
        query = query.filter(Product.category_id == category_id)
    if status is not None:
        query = query.filter(Product.status == status)
    if gender is not None:
        query = query.filter(Product.gender == gender)

    total = query.count()
    products = (
        query.order_by(Product.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    result = []
    for p in products:
        total_stock = sum(v.stock for v in p.variants)
        result.append({
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "category_id": p.category_id,
            "category_name": p.category.name if p.category else None,
            "description": p.description,
            "base_price": float(p.base_price),
            "thumbnail": p.thumbnail,
            "gender": p.gender,
            "status": p.status,
            "total_stock": total_stock,
            "variant_count": len(p.variants),
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "data": result,
    }


@router.get("/products/{product_id}", response_model=dict)
def admin_get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    product = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.variants),
    ).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()

    if not product:
        raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")

    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "category_id": product.category_id,
        "category_name": product.category.name if product.category else None,
        "description": product.description,
        "base_price": float(product.base_price),
        "thumbnail": product.thumbnail,
        "gender": product.gender,
        "status": product.status,
        "created_at": product.created_at.isoformat() if product.created_at else None,
        "variants": [
            {
                "id": v.id,
                "sku": v.sku,
                "attributes": v.attributes,
                "price": float(v.price),
                "sale_price": float(v.sale_price) if v.sale_price else None,
                "stock": v.stock,
                "image_url": v.image_url,
                "weight": v.weight,
                "length": v.length,
                "width": v.width,
                "height": v.height,
                "status": v.status,
            }
            for v in product.variants
        ],
    }


@router.post("/products", response_model=dict, status_code=201)
def admin_create_product(
    body: ProductCreateAdmin,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    # Check slug unique
    product_data = _clean_product_data(body.model_dump(exclude={"variants"}))
    existing = db.query(Product).filter(Product.slug == product_data["slug"], Product.deleted_at.is_(None)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Slug đã tồn tại")

    product = Product(**product_data)
    db.add(product)
    db.flush()  # get product.id

    for v_data in body.variants:
        variant = ProductVariant(**_clean_variant_data(v_data.model_dump()), product_id=product.id)
        db.add(variant)

    db.commit()
    home_products_cache.invalidate()
    product_cards_cache.invalidate()
    db.refresh(product)
    return {"message": "Tạo sản phẩm thành công", "product_id": product.id}


@router.put("/products/{product_id}", response_model=dict)
def admin_update_product(
    product_id: int,
    body: ProductWithVariantsUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()
    if not product:
        raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")

    # Check slug unique (exclude self)
    requested_slug = normalize_public_code(body.slug, max_length=100, field_name="slug") if body.slug else None
    if requested_slug and requested_slug != product.slug:
        existing = db.query(Product).filter(
            Product.slug == requested_slug,
            Product.id != product_id,
            Product.deleted_at.is_(None)
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Slug đã tồn tại")

    # Update product fields
    update_data = _clean_product_data(body.model_dump(exclude={"variants", "delete_variant_ids"}, exclude_none=True))
    for key, value in update_data.items():
        setattr(product, key, value)

    # Delete specified variants
    if body.delete_variant_ids:
        for vid in body.delete_variant_ids:
            v = db.query(ProductVariant).filter(ProductVariant.id == vid, ProductVariant.product_id == product_id).first()
            if v:
                db.delete(v)

    # Upsert variants
    if body.variants is not None:
        for v_data in body.variants:
            v_dict = _clean_variant_data(v_data.model_dump())
            vid = v_dict.pop("id", None)
            v_dict.pop("_delete", None)

            if vid:
                # Update existing
                existing_v = db.query(ProductVariant).filter(
                    ProductVariant.id == vid,
                    ProductVariant.product_id == product_id
                ).first()
                if existing_v:
                    for k, val in v_dict.items():
                        if val is not None:
                            setattr(existing_v, k, val)
            else:
                # Create new variant
                new_v = ProductVariant(**v_dict, product_id=product_id)
                db.add(new_v)

    db.commit()
    home_products_cache.invalidate()
    product_cards_cache.invalidate()
    db.refresh(product)
    return {"message": "Cập nhật sản phẩm thành công", "product_id": product.id}


@router.patch("/products/{product_id}/status", response_model=dict)
def admin_toggle_product_status(
    product_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()
    if not product:
        raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")

    product.status = 0 if product.status == 1 else 1
    db.commit()
    home_products_cache.invalidate()
    product_cards_cache.invalidate()
    return {"message": "Cập nhật trạng thái thành công", "product_id": product.id, "status": product.status}


@router.delete("/products/{product_id}", response_model=dict)
def admin_delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    product = db.query(Product).filter(Product.id == product_id, Product.deleted_at.is_(None)).first()
    if not product:
        raise HTTPException(status_code=404, detail="Không tìm thấy sản phẩm")

    product.deleted_at = datetime.now()
    product.status = 0
    db.commit()
    home_products_cache.invalidate()
    product_cards_cache.invalidate()
    return {"message": "Đã xóa sản phẩm", "product_id": product_id}


class BulkProductStatusBody(BaseModel):
    ids: List[int]
    status: int  # 0 or 1


class BulkProductDeleteBody(BaseModel):
    ids: List[int]


@router.patch("/products/bulk-status", response_model=dict)
def admin_bulk_product_status(
    body: BulkProductStatusBody,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if body.status not in (0, 1):
        raise HTTPException(status_code=400, detail="status phải là 0 hoặc 1")
    if not body.ids:
        return {"message": "Không có sản phẩm nào được chọn", "updated": 0}

    updated = (
        db.query(Product)
        .filter(Product.id.in_(body.ids), Product.deleted_at.is_(None))
        .update({"status": body.status}, synchronize_session="fetch")
    )
    db.commit()
    home_products_cache.invalidate()
    product_cards_cache.invalidate()
    label = "hiện" if body.status == 1 else "ẩn"
    return {"message": f"Đã {label} {updated} sản phẩm", "updated": updated}


@router.delete("/products/bulk-delete", response_model=dict)
def admin_bulk_product_delete(
    body: BulkProductDeleteBody,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if not body.ids:
        return {"message": "Không có sản phẩm nào được chọn", "deleted": 0}

    now = datetime.utcnow()
    deleted = (
        db.query(Product)
        .filter(Product.id.in_(body.ids), Product.deleted_at.is_(None))
        .update({"deleted_at": now, "status": 0}, synchronize_session="fetch")
    )
    db.commit()
    home_products_cache.invalidate()
    product_cards_cache.invalidate()
    return {"message": f"Đã xóa {deleted} sản phẩm", "deleted": deleted}


# ─── Batch Commission Approve ─────────────────────────────────────────────────

class BatchCommissionStatusBody(BaseModel):
    ids: List[int]
    status: Literal["approved", "paid", "cancelled"]
    note: Optional[str] = None


@router.patch("/affiliate-commissions/batch", response_model=dict)
def admin_batch_commission_status(
    body: BatchCommissionStatusBody,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if not body.ids:
        return {"message": "Không có hoa hồng nào được chọn", "updated": 0}

    commissions = db.query(AffiliateCommission).filter(
        AffiliateCommission.id.in_(body.ids)
    ).all()

    now = datetime.now()
    for commission in commissions:
        commission.status = body.status
        if body.status == "approved" and commission.approved_at is None:
            commission.approved_at = now
        elif body.status == "paid":
            if commission.approved_at is None:
                commission.approved_at = now
            commission.paid_at = now
        elif body.status == "cancelled":
            pass  # just set status
        if body.note is not None:
            commission.note = clean_text(body.note, max_length=1000, field_name="note")

    db.commit()
    label_map = {"approved": "duyệt", "paid": "đánh dấu đã thanh toán", "cancelled": "hủy"}
    return {
        "message": f"Đã {label_map[body.status]} {len(commissions)} hoa hồng",
        "updated": len(commissions),
        "status": body.status,
    }


@router.get("/categories-flat", response_model=list)
def admin_get_categories_flat(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Trả về danh sách categories phẳng để dùng trong dropdown"""
    categories = db.query(Category).order_by(Category.id).all()
    return [{"id": c.id, "name": c.name, "slug": c.slug, "parent_id": c.parent_id, "status": c.status} for c in categories]


# ─────────────────────────────────────────────────────────────────────────────
# COUPON MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

class CouponCreateAdmin(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    type: Literal["percent", "fixed"]
    value: float = Field(gt=0)
    min_order: float = Field(default=0, ge=0)
    max_discount: Optional[float] = Field(default=None, gt=0)
    quantity: int = Field(default=100, ge=0)
    max_uses_per_user: int = Field(default=1, ge=1)
    applicable_type: Literal["all"] = "all"
    start_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None
    status: Literal[0, 1] = 1

class CouponUpdateAdmin(BaseModel):
    code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    type: Optional[Literal["percent", "fixed"]] = None
    value: Optional[float] = Field(default=None, gt=0)
    min_order: Optional[float] = Field(default=None, ge=0)
    max_discount: Optional[float] = Field(default=None, gt=0)
    quantity: Optional[int] = Field(default=None, ge=0)
    max_uses_per_user: Optional[int] = Field(default=None, ge=1)
    applicable_type: Optional[Literal["all"]] = None
    start_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None
    status: Optional[Literal[0, 1]] = None


@router.get("/coupons", response_model=dict)
def admin_get_coupons(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Optional[int] = Query(None),
    coupon_type: Optional[str] = Query(None, alias="type"),
):
    """
    Lấy danh sách mã giảm giá cho admin.
    Tối ưu N+1: batch count số lần dùng của từng coupon bằng 1 query GROUP BY
    thay vì gọi db.query(func.count(CouponUsage.id)) riêng cho từng coupon trong vòng lặp.
    """
    now = datetime.utcnow()
    query = db.query(Coupon)

    if search:
        query = query.filter(Coupon.code.ilike(f"%{search}%"))
    if status is not None:
        query = query.filter(Coupon.status == status)
    if coupon_type:
        query = query.filter(Coupon.type == coupon_type)

    total = query.count()
    coupons = (
        query.order_by(Coupon.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Tối ưu N+1: thay vì gọi db.query(func.count(CouponUsage.id)) cho từng coupon trong vòng lặp,
    # dùng 1 query GROUP BY coupon_id duy nhất — giảm từ N queries xuống 1 query.
    coupon_ids = [c.id for c in coupons]
    used_count_by_coupon: dict[int, int] = {}
    if coupon_ids:
        used_count_by_coupon = {
            cid: int(cnt)
            for cid, cnt in (
                db.query(CouponUsage.coupon_id, func.count(CouponUsage.id))
                .filter(CouponUsage.coupon_id.in_(coupon_ids))
                .group_by(CouponUsage.coupon_id)
                .all()
            )
        }

    result = []
    for c in coupons:
        used_count = used_count_by_coupon.get(c.id, 0)

        if c.expired_at and c.expired_at < now:
            computed_status = "expired"
        elif c.start_at and c.start_at > now:
            computed_status = "scheduled"
        elif c.status == 0:
            computed_status = "inactive"
        elif c.quantity <= 0:
            computed_status = "out"
        else:
            computed_status = "active"

        result.append({
            "id": c.id,
            "code": c.code,
            "type": c.type,
            "value": float(c.value),
            "min_order": float(c.min_order or 0),
            "max_discount": float(c.max_discount) if c.max_discount else None,
            "quantity": c.quantity,
            "max_uses_per_user": c.max_uses_per_user,
            "applicable_type": c.applicable_type,
            "start_at": c.start_at.isoformat() if c.start_at else None,
            "expired_at": c.expired_at.isoformat() if c.expired_at else None,
            "status": c.status,
            "computed_status": computed_status,
            "used_count": used_count,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "data": result,
    }


@router.get("/coupons/{coupon_id}", response_model=dict)
def admin_get_coupon(
    coupon_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    c = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Không tìm thấy mã giảm giá")

    used_count = db.query(func.count(CouponUsage.id)).filter(CouponUsage.coupon_id == c.id).scalar() or 0

    return {
        "id": c.id,
        "code": c.code,
        "type": c.type,
        "value": float(c.value),
        "min_order": float(c.min_order or 0),
        "max_discount": float(c.max_discount) if c.max_discount else None,
        "quantity": c.quantity,
        "max_uses_per_user": c.max_uses_per_user,
        "applicable_type": c.applicable_type,
        "start_at": c.start_at.isoformat() if c.start_at else None,
        "expired_at": c.expired_at.isoformat() if c.expired_at else None,
        "status": c.status,
        "used_count": used_count,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.post("/coupons", response_model=dict, status_code=201)
def admin_create_coupon(
    body: CouponCreateAdmin,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    # Check code unique
    code = body.code.strip().upper()
    existing = db.query(Coupon).filter(Coupon.code == code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Mã giảm giá đã tồn tại")

    data = body.model_dump()
    data["code"] = code
    coupon = Coupon(**data)
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return {"message": "Tạo mã giảm giá thành công", "coupon_id": coupon.id, "code": coupon.code}


@router.put("/coupons/{coupon_id}", response_model=dict)
def admin_update_coupon(
    coupon_id: int,
    body: CouponUpdateAdmin,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Không tìm thấy mã giảm giá")

    update_data = body.model_dump(exclude_none=True)
    for nullable_field in ("max_discount", "start_at", "expired_at"):
        if nullable_field in body.model_fields_set and getattr(body, nullable_field) is None:
            update_data[nullable_field] = None
    if "code" in update_data:
        # Check unique (exclude self)
        code_upper = update_data["code"].strip().upper()
        conflict = db.query(Coupon).filter(Coupon.code == code_upper, Coupon.id != coupon_id).first()
        if conflict:
            raise HTTPException(status_code=400, detail="Mã giảm giá đã tồn tại")
        update_data["code"] = code_upper

    for key, value in update_data.items():
        setattr(coupon, key, value)

    db.commit()
    db.refresh(coupon)
    return {"message": "Cập nhật mã giảm giá thành công", "coupon_id": coupon.id}


@router.patch("/coupons/{coupon_id}/status", response_model=dict)
def admin_toggle_coupon_status(
    coupon_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Không tìm thấy mã giảm giá")

    coupon.status = 0 if coupon.status == 1 else 1
    db.commit()
    return {"message": "Cập nhật trạng thái thành công", "coupon_id": coupon.id, "status": coupon.status}


@router.delete("/coupons/{coupon_id}", response_model=dict)
def admin_delete_coupon(
    coupon_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Không tìm thấy mã giảm giá")

    # Prevent deletion if coupon has been used
    used = db.query(func.count(CouponUsage.id)).filter(CouponUsage.coupon_id == coupon_id).scalar() or 0
    if used > 0:
        raise HTTPException(status_code=400, detail=f"Không thể xóa: mã đã được sử dụng {used} lần. Hãy vô hiệu hóa thay thế.")

    db.delete(coupon)
    db.commit()
    return {"message": "Đã xóa mã giảm giá", "coupon_id": coupon_id}


@router.get("/coupons/{coupon_id}/usage-stats", response_model=dict)
def admin_get_coupon_usage_stats(
    coupon_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    """Thống kê chi tiết sử dụng của một mã giảm giá: 30 ngày gần nhất, top users, revenue."""
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Không tìm thấy mã giảm giá")

    total_used = db.query(func.count(CouponUsage.id)).filter(CouponUsage.coupon_id == coupon_id).scalar() or 0

    # Revenue từ các đơn dùng coupon này
    revenue_rows = (
        db.query(func.sum(Order.total_final))
        .join(CouponUsage, CouponUsage.order_id == Order.id)
        .filter(CouponUsage.coupon_id == coupon_id, Order.status != "cancelled")
        .scalar()
    )
    total_revenue = float(revenue_rows or 0)

    # Discount saved
    discount_rows = (
        db.query(func.sum(Order.discount_amount))
        .join(CouponUsage, CouponUsage.order_id == Order.id)
        .filter(CouponUsage.coupon_id == coupon_id, Order.status != "cancelled")
        .scalar()
    )
    total_discount = float(discount_rows or 0)

    # Usage per day – 30 ngày gần nhất
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    daily_rows = (
        db.query(
            cast(CouponUsage.used_at, Date).label("day"),
            func.count(CouponUsage.id).label("count"),
        )
        .filter(CouponUsage.coupon_id == coupon_id, CouponUsage.used_at >= thirty_days_ago)
        .group_by(cast(CouponUsage.used_at, Date))
        .order_by(cast(CouponUsage.used_at, Date))
        .all()
    )
    usage_by_day = {str(row.day): row.count for row in daily_rows}

    # Fill all 30 days (0 nếu không có dữ liệu)
    daily_data = []
    cursor_date = thirty_days_ago.date()
    today = datetime.utcnow().date()
    while cursor_date <= today:
        daily_data.append({
            "date": cursor_date.isoformat(),
            "count": usage_by_day.get(str(cursor_date), 0),
        })
        cursor_date += timedelta(days=1)

    # Top users
    top_user_rows = (
        db.query(User.id, User.full_name, User.email, func.count(CouponUsage.id).label("times"))
        .join(CouponUsage, CouponUsage.user_id == User.id)
        .filter(CouponUsage.coupon_id == coupon_id)
        .group_by(User.id, User.full_name, User.email)
        .order_by(func.count(CouponUsage.id).desc())
        .limit(5)
        .all()
    )
    top_users = [
        {"user_id": r.id, "name": r.full_name, "email": r.email, "times": r.times}
        for r in top_user_rows
    ]

    return {
        "coupon_id": coupon_id,
        "code": coupon.code,
        "total_used": total_used,
        "quantity": coupon.quantity,
        "total_revenue": total_revenue,
        "total_discount": total_discount,
        "daily_data": daily_data,
        "top_users": top_users,
    }


# ─────────────────────────────────────────────────────────────────────────────
# USER MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=dict)
def admin_get_users(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    role: Optional[int] = Query(None),
    status: Optional[int] = Query(None),
):
    """
    Lấy danh sách user cho admin.
    Tối ưu N+1: batch count đơn hàng theo user_id bằng 1 query GROUP BY
    thay vì gọi db.query(func.count(Order.id)) riêng cho từng user trong vòng lặp.
    """
    query = db.query(User)

    if search:
        keyword = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(keyword),
                User.email.ilike(keyword),
                User.phone.ilike(keyword),
            )
        )
    if role is not None:
        query = query.filter(User.role == role)
    if status is not None:
        query = query.filter(User.status == status)

    total = query.count()
    users = (
        query.order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Tối ưu N+1: thay vì gọi db.query(func.count(Order.id)) cho từng user trong vòng lặp,
    # dùng 1 query GROUP BY user_id duy nhất — giảm từ N queries xuống 1 query.
    user_ids = [u.id for u in users]
    order_count_by_user: dict[int, int] = {}
    if user_ids:
        order_count_by_user = {
            uid: int(cnt)
            for uid, cnt in (
                db.query(Order.user_id, func.count(Order.id))
                .filter(Order.user_id.in_(user_ids))
                .group_by(Order.user_id)
                .all()
            )
        }

    result = []
    for u in users:
        result.append({
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "phone": u.phone,
            "role": u.role,
            "status": u.status,
            "referral_code": u.referral_code,
            "auth_provider": u.auth_provider,
            "avatar": u.avatar,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "updated_at": u.updated_at.isoformat() if u.updated_at else None,
            "order_count": order_count_by_user.get(u.id, 0),
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "data": result,
    }


@router.patch("/users/{user_id}/status", response_model=dict)
def admin_toggle_user_status(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Không thể khóa tài khoản của chính mình")

    user.status = 0 if user.status == 1 else 1
    db.commit()
    return {"message": "Cập nhật trạng thái thành công", "user_id": user.id, "status": user.status}


# ─────────────────────────────────────────────────────────────────────────────
# CATEGORY MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

class CategoryCreateAdmin(BaseModel):
    name: str
    slug: str
    parent_id: Optional[int] = None
    status: int = 1

class CategoryUpdateAdmin(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    parent_id: Optional[int] = None
    status: Optional[int] = None


@router.get("/categories", response_model=dict)
def admin_get_categories(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
    search: Optional[str] = Query(None),
    status: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """
    Lấy danh sách danh mục cho admin.
    Tối ưu N+1:
    - Batch count số sản phẩm theo category_id bằng 1 query GROUP BY.
    - joinedload(Category.parent) để lấy c.parent.name không kích hoạt lazy load
      trong vòng lặp. Giảm từ 2N queries xuống 2 queries bổ sung duy nhất.
    """
    query = (
        db.query(Category)
        .options(joinedload(Category.parent))
    )

    if search:
        keyword = f"%{search.strip()}%"
        query = query.filter(
            or_(Category.name.ilike(keyword), Category.slug.ilike(keyword))
        )
    if status is not None:
        query = query.filter(Category.status == status)

    total = query.count()
    categories = (
        query.order_by(Category.parent_id.asc().nullsfirst(), Category.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Tối ưu N+1: thay vì gọi db.query(func.count(Product.id)) cho từng category trong vòng lặp,
    # dùng 1 query GROUP BY category_id duy nhất — giảm từ N queries xuống 1 query.
    cat_ids = [c.id for c in categories]
    product_count_by_cat: dict[int, int] = {}
    if cat_ids:
        product_count_by_cat = {
            cid: int(cnt)
            for cid, cnt in (
                db.query(Product.category_id, func.count(Product.id))
                .filter(Product.category_id.in_(cat_ids), Product.deleted_at.is_(None))
                .group_by(Product.category_id)
                .all()
            )
        }

    result = []
    for c in categories:
        result.append({
            "id": c.id,
            "name": c.name,
            "slug": c.slug,
            "parent_id": c.parent_id,
            "parent_name": c.parent.name if c.parent else None,
            "status": c.status,
            "product_count": product_count_by_cat.get(c.id, 0),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "data": result,
    }


@router.post("/categories", response_model=dict, status_code=201)
def admin_create_category(
    body: CategoryCreateAdmin,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    data = body.model_dump()
    data["name"] = clean_required_text(data["name"], max_length=100, field_name="name")
    data["slug"] = normalize_public_code(data["slug"], max_length=100, field_name="slug")
    existing = db.query(Category).filter(Category.slug == data["slug"]).first()
    if existing:
        raise HTTPException(status_code=400, detail="Slug danh mục đã tồn tại")

    if body.parent_id:
        parent = db.query(Category).filter(Category.id == body.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Danh mục cha không tồn tại")

    category = Category(**data)
    db.add(category)
    db.commit()
    db.refresh(category)
    category_cache.invalidate()
    category_descendants_cache.invalidate()
    product_cards_cache.invalidate()
    return {"message": "Tạo danh mục thành công", "category_id": category.id}


@router.put("/categories/{category_id}", response_model=dict)
def admin_update_category(
    category_id: int,
    body: CategoryUpdateAdmin,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Không tìm thấy danh mục")

    requested_slug = normalize_public_code(body.slug, max_length=100, field_name="slug") if body.slug else None
    if requested_slug and requested_slug != category.slug:
        conflict = db.query(Category).filter(
            Category.slug == requested_slug, Category.id != category_id
        ).first()
        if conflict:
            raise HTTPException(status_code=400, detail="Slug danh mục đã tồn tại")

    if body.parent_id and body.parent_id == category_id:
        raise HTTPException(status_code=400, detail="Danh mục không thể là cha của chính nó")

    update_data = body.model_dump(exclude_none=True)
    if "name" in update_data:
        update_data["name"] = clean_required_text(update_data["name"], max_length=100, field_name="name")
    if "slug" in update_data:
        if not requested_slug:
            raise HTTPException(status_code=400, detail="Slug is required")
        update_data["slug"] = requested_slug
    for key, value in update_data.items():
        setattr(category, key, value)

    db.commit()
    db.refresh(category)
    category_cache.invalidate()
    category_descendants_cache.invalidate()
    product_cards_cache.invalidate()
    return {"message": "Cập nhật danh mục thành công", "category_id": category.id}


@router.patch("/categories/{category_id}/status", response_model=dict)
def admin_toggle_category_status(
    category_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Không tìm thấy danh mục")

    category.status = 0 if category.status == 1 else 1
    db.commit()
    category_cache.invalidate()
    category_descendants_cache.invalidate()
    product_cards_cache.invalidate()
    return {"message": "Cập nhật trạng thái thành công", "category_id": category.id, "status": category.status}


@router.delete("/categories/{category_id}", response_model=dict)
def admin_delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Không tìm thấy danh mục")

    product_count = db.query(func.count(Product.id)).filter(
        Product.category_id == category_id, Product.deleted_at.is_(None)
    ).scalar() or 0
    if product_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Không thể xóa: danh mục đang chứa {product_count} sản phẩm. Hãy chuyển sản phẩm sang danh mục khác trước."
        )

    child_count = db.query(func.count(Category.id)).filter(Category.parent_id == category_id).scalar() or 0
    if child_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Không thể xóa: danh mục có {child_count} danh mục con. Hãy xóa hoặc chuyển danh mục con trước."
        )

    db.delete(category)
    db.commit()
    category_cache.invalidate()
    category_descendants_cache.invalidate()
    product_cards_cache.invalidate()
    return {"message": "Đã xóa danh mục", "category_id": category_id}
