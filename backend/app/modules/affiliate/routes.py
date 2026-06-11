import logging
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.deps import get_current_user
from app.core.rate_limit import affiliate_click_rate_limiter, get_trusted_client_ip
from app.core.validation import clean_required_text, clean_text, normalize_public_code, normalize_url
from app.db.database import get_db
from app.modules.affiliate.models import (
    AffiliateClick,
    AffiliateCommission,
    AffiliateConversion,
    AffiliateLink,
    WithdrawalRequest,
)
from app.modules.order.models import Order, OrderItem
from app.modules.product.models import Product
from app.modules.product.variant_models import ProductVariant
from app.modules.user.models import User

logger = logging.getLogger(__name__)

router = APIRouter()


class DashboardMetric(BaseModel):
    label: str
    value: float
    change: float


class AffiliateBalance(BaseModel):
    available: float
    pending: float
    paid_total: float


class ChartPoint(BaseModel):
    date: str
    commission: float


class TopProduct(BaseModel):
    product_id: Optional[int] = None
    name: str
    orders: int
    revenue: float
    commission: float


class RecentActivity(BaseModel):
    title: str
    meta: str
    amount: float
    status: str
    created_at: Optional[datetime] = None


class AffiliateDashboardResponse(BaseModel):
    month_commission: DashboardMetric
    month_clicks: DashboardMetric
    success_orders: DashboardMetric
    conversion_rate: DashboardMetric
    balance: AffiliateBalance
    chart: List[ChartPoint]
    top_products: List[TopProduct]
    recent_activities: List[RecentActivity]


class AffiliateProduct(BaseModel):
    id: int
    name: str
    category_name: Optional[str] = None
    description: Optional[str] = None
    thumbnail: Optional[str] = None
    base_price: float
    sale_price: Optional[float] = None
    stock: int
    commission_rate: float  # Lấy từ Product.commission_rate (không hardcode)
    estimated_commission: float
    month_orders: int
    month_commission: float


class AffiliateProductListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    total_pages: int
    data: List[AffiliateProduct]


class AffiliateLinkCreate(BaseModel):
    product_id: int = Field(gt=0)
    campaign_name: str = Field(min_length=1, max_length=255)
    channel: str = Field(default="direct", max_length=50)


class AffiliateLinkUpdate(BaseModel):
    campaign_name: Optional[str] = Field(default=None, max_length=255)
    channel: Optional[str] = Field(default=None, max_length=50)
    status: Optional[str] = None


class AffiliateLinkResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_thumbnail: Optional[str] = None
    campaign_name: str
    channel: str
    status: str
    tracking_url: str
    clicks: int
    orders: int
    commission: float
    created_at: datetime


class AffiliateCommissionSummary(BaseModel):
    total: float
    pending: float
    approved: float
    paid: float
    cancelled: float
    orders: int
    average_rate: float


class AffiliateCommissionItem(BaseModel):
    id: int
    order_id: int
    order_code: str
    order_status: str
    order_total: float
    commission_rate: float
    amount: float
    status: str
    campaign_name: Optional[str] = None
    channel: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime
    approved_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None


class AffiliateCommissionListResponse(BaseModel):
    summary: AffiliateCommissionSummary
    # Phân trang cho phần data
    total: int
    page: int
    page_size: int
    total_pages: int
    data: List[AffiliateCommissionItem]


class AffiliateConversionSummary(BaseModel):
    total_conversions: int
    valid_conversions: int
    total_clicks: int
    conversion_rate: float
    unique_buyers: int
    total_order_value: float
    total_commission: float
    by_attribution: Dict[str, int]


class AffiliateConversionItem(BaseModel):
    id: int
    order_id: int
    order_code: str
    order_status: str
    referred_user_id: Optional[int] = None
    buyer_label: str
    commission_id: int
    commission_status: str
    order_total: float
    commission_amount: float
    attribution_type: str
    campaign_name: Optional[str] = None
    channel: Optional[str] = None
    created_at: datetime


class AffiliateConversionListResponse(BaseModel):
    summary: AffiliateConversionSummary
    total: int
    page: int
    page_size: int
    total_pages: int
    data: List[AffiliateConversionItem]


# ---- Link summary + paginated response ----

class AffiliateLinkSummary(BaseModel):
    total_links: int
    active_links: int
    total_clicks: int
    total_orders: int
    total_commission: float


class AffiliateLinkListResponse(BaseModel):
    summary: AffiliateLinkSummary
    total: int
    page: int
    page_size: int
    total_pages: int
    data: List[AffiliateLinkResponse]


# ---- Withdrawal schemas ----

class WithdrawalCreate(BaseModel):
    amount: float = Field(gt=0)
    bank_name: str = Field(min_length=1, max_length=100)
    bank_account: str = Field(min_length=1, max_length=50)
    bank_owner: str = Field(min_length=1, max_length=255)
    note: Optional[str] = Field(default=None, max_length=500)


class WithdrawalResponse(BaseModel):
    id: int
    amount: float
    status: str
    bank_name: str
    bank_account: str
    bank_owner: str
    note: Optional[str] = None
    admin_note: Optional[str] = None
    created_at: datetime
    processed_at: Optional[datetime] = None


class WithdrawalListResponse(BaseModel):
    balance: AffiliateBalance
    pending_withdrawal: float  # tổng tiền đang chờ duyệt rút
    net_available: float       # số dư có thể rút (approved - pending_withdrawal)
    total: int
    data: List[WithdrawalResponse]


class AffiliateClickCreate(BaseModel):
    referral_code: str = Field(min_length=1, max_length=64)
    affiliate_link_id: Optional[int] = Field(default=None, gt=0)
    landing_url: Optional[str] = Field(default=None, max_length=2048)


class AffiliateClickResponse(BaseModel):
    ok: bool


# ---- Link analytics schemas (#10) ----

class LinkAnalyticsDayPoint(BaseModel):
    date: str          # YYYY-MM-DD
    clicks: int
    orders: int
    commission: float


class LinkAnalyticsResponse(BaseModel):
    link_id: int
    product_name: str
    campaign_name: str
    channel: str
    tracking_url: str
    total_clicks: int
    total_orders: int
    total_commission: float
    days: List[LinkAnalyticsDayPoint]  # 30 ngày gần nhất


def _day_start(value: date) -> datetime:
    return datetime.combine(value, datetime.min.time())


def _month_bounds(today: date) -> tuple[datetime, datetime, datetime, datetime]:
    current_start_date = today.replace(day=1)
    if current_start_date.month == 1:
        previous_start_date = current_start_date.replace(year=current_start_date.year - 1, month=12)
    else:
        previous_start_date = current_start_date.replace(month=current_start_date.month - 1)

    if current_start_date.month == 12:
        next_start_date = current_start_date.replace(year=current_start_date.year + 1, month=1)
    else:
        next_start_date = current_start_date.replace(month=current_start_date.month + 1)

    return (
        _day_start(current_start_date),
        _day_start(next_start_date),
        _day_start(previous_start_date),
        _day_start(current_start_date),
    )


def _sum_or_zero(value) -> float:
    return float(value or 0)


def _count_or_zero(value) -> int:
    return int(value or 0)


def _change_percent(current: float, previous: float) -> float:
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return round(((current - previous) / previous) * 100, 2)


def _customer_app_url() -> str:
    return os.getenv("CUSTOMER_APP_URL", "http://127.0.0.1:5173").rstrip("/")


def _referral_code(user: User) -> str:
    return user.referral_code or f"AFF{user.id}"


def _build_tracking_url(user: User, link: AffiliateLink) -> str:
    return f"{_customer_app_url()}/product/{link.product_id}?ref={_referral_code(user)}&campaign={link.id}"


# ─── #12: Thay _link_response N+1 → batch helpers ───────────────────────────

LinkStatsByLinkId = Dict[int, Dict[str, Any]]


def _batch_link_stats(db: Session, user_id: int, link_ids: list[int]) -> LinkStatsByLinkId:
    """
    Trả {link_id: {clicks, orders, commission}} bằng 2 queries thay vì 4N queries.
    #12 fix: loại bỏ N+1 trong _link_response()
    """
    if not link_ids:
        return {}

    # Query 1: click counts per link_id
    click_rows = (
        db.query(AffiliateClick.affiliate_link_id, func.count(AffiliateClick.id))
        .filter(
            AffiliateClick.referrer_user_id == user_id,
            AffiliateClick.affiliate_link_id.in_(link_ids),
        )
        .group_by(AffiliateClick.affiliate_link_id)
        .all()
    )
    clicks_by_link: dict[int, int] = {link_id: count for link_id, count in click_rows}

    # Query 2: orders + commission per link_id
    comm_rows = (
        db.query(
            AffiliateCommission.affiliate_link_id,
            func.count(AffiliateCommission.id),
            func.coalesce(func.sum(AffiliateCommission.amount), 0),
        )
        .filter(
            AffiliateCommission.user_id == user_id,
            AffiliateCommission.affiliate_link_id.in_(link_ids),
            AffiliateCommission.status != "cancelled",
        )
        .group_by(AffiliateCommission.affiliate_link_id)
        .all()
    )
    comm_by_link: dict[int, tuple[int, float]] = {
        link_id: (count, float(total)) for link_id, count, total in comm_rows
    }

    result: LinkStatsByLinkId = {}
    for link_id in link_ids:
        orders, commission = comm_by_link.get(link_id, (0, 0.0))
        result[link_id] = {
            "clicks": clicks_by_link.get(link_id, 0),
            "orders": orders,
            "commission": commission,
        }
    return result


def _build_link_response(
    user: User,
    link: AffiliateLink,
    product_map: dict[int, Product],
    stats: LinkStatsByLinkId,
) -> AffiliateLinkResponse:
    """Xây dựng AffiliateLinkResponse từ dữ liệu đã batch-load — không query DB."""
    product = product_map.get(link.product_id)
    link_stats = stats.get(link.id, {"clicks": 0, "orders": 0, "commission": 0.0})
    return AffiliateLinkResponse(
        id=link.id,
        product_id=link.product_id,
        product_name=product.name if product else "Unknown product",
        product_thumbnail=product.thumbnail if product else None,
        campaign_name=link.campaign_name,
        channel=link.channel,
        status=link.status,
        tracking_url=_build_tracking_url(user, link),
        clicks=link_stats["clicks"],
        orders=link_stats["orders"],
        commission=link_stats["commission"],
        created_at=link.created_at,
    )


# Giữ _link_response() cho các endpoint đơn lẻ (create, update)
def _link_response(db: Session, user: User, link: AffiliateLink) -> AffiliateLinkResponse:
    product = db.query(Product).filter(Product.id == link.product_id).first()
    clicks = _count_or_zero(
        db.query(func.count(AffiliateClick.id))
        .filter(
            AffiliateClick.referrer_user_id == user.id,
            AffiliateClick.affiliate_link_id == link.id,
        )
        .scalar()
    )
    orders = _count_or_zero(
        db.query(func.count(AffiliateCommission.id))
        .filter(
            AffiliateCommission.user_id == user.id,
            AffiliateCommission.affiliate_link_id == link.id,
            AffiliateCommission.status != "cancelled",
        )
        .scalar()
    )
    commission = _sum_or_zero(
        db.query(func.sum(AffiliateCommission.amount))
        .filter(
            AffiliateCommission.user_id == user.id,
            AffiliateCommission.affiliate_link_id == link.id,
            AffiliateCommission.status != "cancelled",
        )
        .scalar()
    )
    return AffiliateLinkResponse(
        id=link.id,
        product_id=link.product_id,
        product_name=product.name if product else "Unknown product",
        product_thumbnail=product.thumbnail if product else None,
        campaign_name=link.campaign_name,
        channel=link.channel,
        status=link.status,
        tracking_url=_build_tracking_url(user, link),
        clicks=clicks,
        orders=orders,
        commission=commission,
        created_at=link.created_at,
    )


def resolve_referrer(db: Session, referral_code: str) -> User | None:
    code = referral_code.strip()
    if not code:
        return None

    if code.upper().startswith("AFF") and code[3:].isdigit():
        user = db.query(User).filter(User.id == int(code[3:])).first()
        if user:
            return user

    return db.query(User).filter(User.referral_code == code).first()


def _commission_sum_query(db: Session, user_id: int, start: datetime | None = None, end: datetime | None = None):
    # Fix #3: Tách join ra khỏi các nhánh if để tránh double join
    query = db.query(func.sum(AffiliateCommission.amount)).filter(
        AffiliateCommission.user_id == user_id,
        AffiliateCommission.status != "cancelled",
    )
    need_join = start is not None or end is not None
    if need_join:
        query = query.join(Order, Order.id == AffiliateCommission.order_id)
    if start is not None:
        query = query.filter(Order.created_at >= start)
    if end is not None:
        query = query.filter(Order.created_at < end)
    return _sum_or_zero(query.scalar())


@router.get("/links", response_model=AffiliateLinkListResponse)
def get_affiliate_links(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
):
    query = db.query(AffiliateLink).filter(AffiliateLink.user_id == current_user.id)
    if status:
        query = query.filter(AffiliateLink.status == status)
    if search:
        query = query.join(Product, Product.id == AffiliateLink.product_id).filter(
            (AffiliateLink.campaign_name.ilike(f"%{search}%")) | (Product.name.ilike(f"%{search}%"))
        )

    total = query.count()
    # Lấy tất cả link IDs để tính aggregate summary
    all_link_ids: list[int] = [row[0] for row in query.with_entities(AffiliateLink.id).all()]

    # Aggregate clicks (1 query)
    total_clicks = _count_or_zero(
        db.query(func.count(AffiliateClick.id))
        .filter(AffiliateClick.affiliate_link_id.in_(all_link_ids))
        .scalar()
    ) if all_link_ids else 0

    # Aggregate orders + commission (1 query)
    comm_agg = (
        db.query(func.count(AffiliateCommission.id), func.coalesce(func.sum(AffiliateCommission.amount), 0))
        .filter(
            AffiliateCommission.affiliate_link_id.in_(all_link_ids),
            AffiliateCommission.status != "cancelled",
        )
        .first()
    ) if all_link_ids else (0, 0.0)
    total_orders = _count_or_zero(comm_agg[0])
    total_commission = _sum_or_zero(comm_agg[1])

    # Active count (1 query)
    total_active = _count_or_zero(
        db.query(func.count(AffiliateLink.id))
        .filter(
            AffiliateLink.user_id == current_user.id,
            AffiliateLink.id.in_(all_link_ids),
            AffiliateLink.status == "active",
        )
        .scalar()
    ) if all_link_ids else 0

    # Phân trang
    paginated_links = (
        query.order_by(AffiliateLink.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # #12 FIX: Batch load product info + stats — thay vì gọi _link_response() (4 queries/link)
    paginated_link_ids = [link.id for link in paginated_links]
    product_ids = list({link.product_id for link in paginated_links})
    product_map = {
        p.id: p
        for p in db.query(Product).filter(Product.id.in_(product_ids)).all()
    } if product_ids else {}
    batch_stats = _batch_link_stats(db, current_user.id, paginated_link_ids)

    return AffiliateLinkListResponse(
        summary=AffiliateLinkSummary(
            total_links=total,
            active_links=total_active,
            total_clicks=total_clicks,
            total_orders=total_orders,
            total_commission=total_commission,
        ),
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
        data=[
            _build_link_response(current_user, link, product_map, batch_stats)
            for link in paginated_links
        ],
    )


@router.post("/links", response_model=AffiliateLinkResponse)
def create_affiliate_link(
    body: AffiliateLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Tạo affiliate link mới cho sản phẩm.
    Nếu link với cùng campaign_name + channel đã tồn tại, trả về link cũ.
    Tối ưu: dùng db.flush() để sinh ID và build response in-memory trước db.commit() duy nhất,
    loại bỏ db.refresh() làm tăng thêm 1 roundtrip Supabase.
    """
    product = (
        db.query(Product)
        .filter(Product.id == body.product_id, Product.status == 1, Product.deleted_at.is_(None))
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    campaign_name = clean_required_text(body.campaign_name, max_length=255, field_name="campaign_name") or product.name
    channel = clean_required_text(body.channel or "direct", max_length=50, field_name="channel")
    existing_link = (
        db.query(AffiliateLink)
        .filter(
            AffiliateLink.user_id == current_user.id,
            AffiliateLink.product_id == product.id,
            AffiliateLink.campaign_name == campaign_name[:255],
            AffiliateLink.channel == channel[:50],
        )
        .first()
    )
    if existing_link:
        return _link_response(db, current_user, existing_link)

    now = datetime.now()
    link = AffiliateLink(
        user_id=current_user.id,
        product_id=product.id,
        campaign_name=campaign_name[:255],
        channel=channel[:50],
        status="active",
        created_at=now,
    )
    db.add(link)
    # Tối ưu DB Transaction: dùng flush() để SQLAlchemy sinh link.id trong bộ nhớ
    # mà không kích hoạt Disk I/O vật lý. Build response ngay trong memory,
    # sau đó chỉ gọi commit() 1 lần duy nhất — giảm Supabase roundtrips từ 3 xuống 1.
    db.flush()
    response = AffiliateLinkResponse(
        id=link.id,
        product_id=link.product_id,
        product_name=product.name,
        product_thumbnail=product.thumbnail,
        campaign_name=link.campaign_name,
        channel=link.channel,
        status=link.status,
        tracking_url=_build_tracking_url(current_user, link),
        clicks=0,
        orders=0,
        commission=0.0,
        created_at=now,
    )
    db.commit()
    logger.info("Affiliate link created: user_id=%d, link_id=%d, product_id=%d", current_user.id, link.id, product.id)
    return response


@router.patch("/links/{link_id}", response_model=AffiliateLinkResponse)
def update_affiliate_link(
    link_id: int,
    body: AffiliateLinkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cập nhật thông tin affiliate link (campaign, channel, status).
    Tối ưu: loại bỏ db.refresh() dư thừa — dùng _link_response() trước db.commit()
    vì SQLAlchemy session đã tracking đầy đủ trạng thái object sau khi flush.
    Giảm Supabase roundtrips từ 5 xuống 4 (commit + 3 queries trong _link_response).
    """
    link = db.query(AffiliateLink).filter(AffiliateLink.id == link_id, AffiliateLink.user_id == current_user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Affiliate link not found")

    if body.campaign_name is not None:
        link.campaign_name = clean_required_text(body.campaign_name, max_length=255, field_name="campaign_name")
    if body.channel is not None:
        link.channel = clean_required_text(body.channel, max_length=50, field_name="channel")
    if body.status is not None:
        if body.status not in {"active", "paused"}:
            raise HTTPException(status_code=400, detail="Invalid link status")
        link.status = body.status

    # Tối ưu: build response từ trạng thái object đã được session tracking —
    # không cần db.refresh() để load lại từ DB sau commit.
    response = _link_response(db, current_user, link)
    db.commit()
    logger.info("Affiliate link updated: user_id=%d, link_id=%d", current_user.id, link_id)
    return response


@router.delete("/links/{link_id}")
def delete_affiliate_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    link = db.query(AffiliateLink).filter(AffiliateLink.id == link_id, AffiliateLink.user_id == current_user.id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Affiliate link not found")
    db.delete(link)
    db.commit()
    return {"ok": True}


# #10: Analytics endpoint cho từng link
@router.get("/links/{link_id}/analytics", response_model=LinkAnalyticsResponse)
def get_link_analytics(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    days: int = Query(30, ge=7, le=90, description="Số ngày cần xem (7-90)"),
):
    """Thống kê click + đơn hàng + hoa hồng theo ngày cho một link cụ thể."""
    link = db.query(AffiliateLink).filter(
        AffiliateLink.id == link_id,
        AffiliateLink.user_id == current_user.id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Affiliate link not found")

    product = db.query(Product).filter(Product.id == link.product_id).first()

    # Khoảng thời gian cần thống kê
    today = date.today()
    start_dt = _day_start(today - timedelta(days=days - 1))
    end_dt = _day_start(today + timedelta(days=1))

    # Clicks theo ngày — dùng func.date() để GROUP BY ngày
    click_rows = (
        db.query(
            func.date(AffiliateClick.created_at).label("day"),
            func.count(AffiliateClick.id).label("cnt"),
        )
        .filter(
            AffiliateClick.affiliate_link_id == link_id,
            AffiliateClick.referrer_user_id == current_user.id,
            AffiliateClick.created_at >= start_dt,
            AffiliateClick.created_at < end_dt,
        )
        .group_by(func.date(AffiliateClick.created_at))
        .all()
    )
    clicks_by_day: dict[str, int] = {str(row.day): int(row.cnt) for row in click_rows}

    # Orders + commission theo ngày — join qua Order.created_at
    comm_rows = (
        db.query(
            func.date(AffiliateCommission.created_at).label("day"),
            func.count(AffiliateCommission.id).label("order_cnt"),
            func.coalesce(func.sum(AffiliateCommission.amount), 0).label("comm_total"),
        )
        .filter(
            AffiliateCommission.affiliate_link_id == link_id,
            AffiliateCommission.user_id == current_user.id,
            AffiliateCommission.status != "cancelled",
            AffiliateCommission.created_at >= start_dt,
            AffiliateCommission.created_at < end_dt,
        )
        .group_by(func.date(AffiliateCommission.created_at))
        .all()
    )
    comm_by_day: dict[str, tuple[int, float]] = {
        str(row.day): (int(row.order_cnt), float(row.comm_total))
        for row in comm_rows
    }

    # Build danh sách ngày đầy đủ (điền 0 cho những ngày không có data)
    day_points: list[LinkAnalyticsDayPoint] = []
    total_clicks = 0
    total_orders = 0
    total_commission = 0.0
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        day_str = d.strftime("%Y-%m-%d")
        click_cnt = clicks_by_day.get(day_str, 0)
        order_cnt, comm_total = comm_by_day.get(day_str, (0, 0.0))
        total_clicks += click_cnt
        total_orders += order_cnt
        total_commission += comm_total
        day_points.append(LinkAnalyticsDayPoint(
            date=day_str,
            clicks=click_cnt,
            orders=order_cnt,
            commission=round(comm_total, 2),
        ))

    return LinkAnalyticsResponse(
        link_id=link.id,
        product_name=product.name if product else "Unknown product",
        campaign_name=link.campaign_name,
        channel=link.channel,
        tracking_url=_build_tracking_url(current_user, link),
        total_clicks=total_clicks,
        total_orders=total_orders,
        total_commission=round(total_commission, 2),
        days=day_points,
    )


@router.get("/commissions", response_model=AffiliateCommissionListResponse)
def get_affiliate_commissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None, description="Lọc từ ngày (YYYY-MM-DD)"),
    date_to: Optional[date] = Query(None, description="Lọc đến ngày (YYYY-MM-DD)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    if status and status not in {"pending", "approved", "paid", "cancelled"}:
        raise HTTPException(status_code=400, detail="Invalid commission status")

    base_query = (
        db.query(AffiliateCommission, Order, AffiliateLink)
        .join(Order, Order.id == AffiliateCommission.order_id)
        .outerjoin(AffiliateLink, AffiliateLink.id == AffiliateCommission.affiliate_link_id)
        .filter(AffiliateCommission.user_id == current_user.id)
    )
    if status:
        base_query = base_query.filter(AffiliateCommission.status == status)
    if search:
        keyword = f"%{search}%"
        base_query = base_query.filter(
            (Order.order_code.ilike(keyword))
            | (AffiliateLink.campaign_name.ilike(keyword))
            | (AffiliateLink.channel.ilike(keyword))
        )
    # #8: Lọc theo ngày (dùng commission.created_at)
    if date_from:
        base_query = base_query.filter(AffiliateCommission.created_at >= _day_start(date_from))
    if date_to:
        # đến cuối ngày date_to
        next_day = date_to + timedelta(days=1)
        base_query = base_query.filter(AffiliateCommission.created_at < _day_start(next_day))

    # Tính summary trên TOÀN BỘ kết quả (trước pagination)
    totals = {"pending": 0.0, "approved": 0.0, "paid": 0.0, "cancelled": 0.0}
    rate_total = 0.0
    total_count = 0
    summary_rows = (
        base_query.with_entities(
            AffiliateCommission.status,
            func.coalesce(func.sum(AffiliateCommission.amount), 0),
            func.coalesce(func.sum(AffiliateCommission.commission_rate), 0),
            func.count(AffiliateCommission.id),
        )
        .group_by(AffiliateCommission.status)
        .all()
    )
    for status_name, amount, rate_sum, count in summary_rows:
        if status_name in totals:
            totals[status_name] = _sum_or_zero(amount)
        rate_total += _sum_or_zero(rate_sum)
        total_count += _count_or_zero(count)

    # Phân trang: query lại với offset/limit
    paginated_rows = (
        base_query
        .order_by(AffiliateCommission.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items: list[AffiliateCommissionItem] = []
    for commission, order, link in paginated_rows:
        items.append(
            AffiliateCommissionItem(
                id=commission.id,
                order_id=order.id,
                order_code=order.order_code,
                order_status=order.status,
                order_total=_sum_or_zero(commission.order_total),
                commission_rate=_sum_or_zero(commission.commission_rate),
                amount=_sum_or_zero(commission.amount),
                status=commission.status,
                campaign_name=link.campaign_name if link else None,
                channel=link.channel if link else None,
                note=commission.note,
                created_at=commission.created_at,
                approved_at=commission.approved_at,
                paid_at=commission.paid_at,
            )
        )

    return AffiliateCommissionListResponse(
        summary=AffiliateCommissionSummary(
            total=totals["pending"] + totals["approved"] + totals["paid"],
            pending=totals["pending"],
            approved=totals["approved"],
            paid=totals["paid"],
            cancelled=totals["cancelled"],
            orders=total_count,
            average_rate=round(rate_total / total_count, 2) if total_count else 0.0,
        ),
        total=total_count,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total_count + page_size - 1) // page_size),
        data=items,
    )


@router.get("/conversions", response_model=AffiliateConversionListResponse)
def get_affiliate_conversions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    attribution_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    if attribution_type and attribution_type not in {"cookie", "code", "manual"}:
        raise HTTPException(status_code=400, detail="Invalid attribution type")
    if status and status not in {"pending", "approved", "paid", "cancelled"}:
        raise HTTPException(status_code=400, detail="Invalid commission status")

    base_query = (
        db.query(AffiliateConversion, AffiliateCommission, Order, AffiliateLink)
        .join(AffiliateCommission, AffiliateCommission.id == AffiliateConversion.commission_id)
        .join(Order, Order.id == AffiliateConversion.order_id)
        .outerjoin(AffiliateLink, AffiliateLink.id == AffiliateCommission.affiliate_link_id)
        .filter(AffiliateConversion.referrer_user_id == current_user.id)
    )

    if attribution_type:
        base_query = base_query.filter(AffiliateConversion.attribution_type == attribution_type)
    if status:
        base_query = base_query.filter(AffiliateCommission.status == status)
    if search:
        keyword = f"%{search.strip()}%"
        base_query = base_query.filter(
            or_(
                Order.order_code.ilike(keyword),
                AffiliateLink.campaign_name.ilike(keyword),
                AffiliateLink.channel.ilike(keyword),
            )
        )
    if date_from:
        base_query = base_query.filter(AffiliateConversion.created_at >= _day_start(date_from))
    if date_to:
        base_query = base_query.filter(AffiliateConversion.created_at < _day_start(date_to + timedelta(days=1)))

    total = base_query.count()
    valid_query = base_query.filter(AffiliateCommission.status != "cancelled")
    valid_conversions = valid_query.count()

    total_clicks_query = db.query(func.count(AffiliateClick.id)).filter(
        AffiliateClick.referrer_user_id == current_user.id
    )
    if date_from:
        total_clicks_query = total_clicks_query.filter(AffiliateClick.created_at >= _day_start(date_from))
    if date_to:
        total_clicks_query = total_clicks_query.filter(AffiliateClick.created_at < _day_start(date_to + timedelta(days=1)))
    total_clicks = _count_or_zero(total_clicks_query.scalar())

    total_order_value = _sum_or_zero(valid_query.with_entities(func.sum(AffiliateCommission.order_total)).scalar())
    total_commission = _sum_or_zero(valid_query.with_entities(func.sum(AffiliateCommission.amount)).scalar())
    unique_buyers = _count_or_zero(
        base_query.with_entities(func.count(func.distinct(AffiliateConversion.referred_user_id))).scalar()
    )
    attr_rows = (
        base_query.with_entities(AffiliateConversion.attribution_type, func.count(AffiliateConversion.id))
        .group_by(AffiliateConversion.attribution_type)
        .all()
    )
    by_attribution = {"cookie": 0, "code": 0, "manual": 0}
    for attr, count in attr_rows:
        if attr in by_attribution:
            by_attribution[attr] = _count_or_zero(count)

    rows = (
        base_query.order_by(AffiliateConversion.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items: list[AffiliateConversionItem] = []
    for conversion, commission, order, link in rows:
        buyer_label = (
            f"Registered buyer #{conversion.referred_user_id}"
            if conversion.referred_user_id
            else "Guest buyer"
        )
        items.append(
            AffiliateConversionItem(
                id=conversion.id,
                order_id=order.id,
                order_code=order.order_code,
                order_status=order.status,
                referred_user_id=conversion.referred_user_id,
                buyer_label=buyer_label,
                commission_id=commission.id,
                commission_status=commission.status,
                order_total=_sum_or_zero(commission.order_total),
                commission_amount=_sum_or_zero(commission.amount),
                attribution_type=conversion.attribution_type or "code",
                campaign_name=link.campaign_name if link else None,
                channel=link.channel if link else None,
                created_at=conversion.created_at,
            )
        )

    return AffiliateConversionListResponse(
        summary=AffiliateConversionSummary(
            total_conversions=total,
            valid_conversions=valid_conversions,
            total_clicks=total_clicks,
            conversion_rate=round((valid_conversions / total_clicks) * 100, 2) if total_clicks else 0.0,
            unique_buyers=unique_buyers,
            total_order_value=round(total_order_value, 2),
            total_commission=round(total_commission, 2),
            by_attribution=by_attribution,
        ),
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
        data=items,
    )


@router.post("/clicks", response_model=AffiliateClickResponse)
def create_affiliate_click(
    body: AffiliateClickCreate,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(affiliate_click_rate_limiter),
):
    referral_code = normalize_public_code(body.referral_code, max_length=64, field_name="referral_code")
    landing_url = normalize_url(body.landing_url, max_length=2048, field_name="landing_url")
    if not referral_code:
        return AffiliateClickResponse(ok=False)
    referrer = resolve_referrer(db, referral_code)
    if not referrer:
        return AffiliateClickResponse(ok=False)

    affiliate_link_id = None
    if body.affiliate_link_id:
        link = (
            db.query(AffiliateLink)
            .filter(
                AffiliateLink.id == body.affiliate_link_id,
                AffiliateLink.user_id == referrer.id,
                AffiliateLink.status == "active",
            )
            .first()
        )
        if link:
            affiliate_link_id = link.id

    ip_address = get_trusted_client_ip(request)

    user_agent = request.headers.get("user-agent")
    # Fix #5: Dùng timezone-aware datetime thay cho datetime.utcnow() đã deprecated
    dedupe_after = datetime.now(tz=timezone.utc) - timedelta(minutes=5)
    existing_click = (
        db.query(AffiliateClick)
        .filter(
            AffiliateClick.referrer_user_id == referrer.id,
            AffiliateClick.affiliate_link_id == affiliate_link_id,
            AffiliateClick.referral_code == referral_code,
            AffiliateClick.ip_address == ip_address,
            AffiliateClick.user_agent == user_agent,
            AffiliateClick.landing_url == landing_url,
            AffiliateClick.created_at >= dedupe_after,
        )
        .first()
    )
    if existing_click:
        return AffiliateClickResponse(ok=True)

    db.add(
        AffiliateClick(
            referrer_user_id=referrer.id,
            affiliate_link_id=affiliate_link_id,
            referral_code=referral_code,
            ip_address=ip_address,
            user_agent=user_agent,
            landing_url=landing_url,
        )
    )
    db.commit()
    return AffiliateClickResponse(ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# #13: In-memory TTL cache cho /dashboard
# ─────────────────────────────────────────────────────────────────────────────
# Dict: cache_key → (expire_at_epoch, response_dict)
_DASHBOARD_CACHE: Dict[str, tuple[float, Any]] = {}
_DASHBOARD_TTL = 300  # 5 phút


def _dashboard_cache_key(user_id: int) -> str:
    # Reset cache khi bước sang tháng mới
    today = date.today()
    return f"dashboard:{user_id}:{today.year}-{today.month}"


def _dashboard_cache_get(user_id: int) -> Optional[Any]:
    key = _dashboard_cache_key(user_id)
    entry = _DASHBOARD_CACHE.get(key)
    if entry and time.monotonic() < entry[0]:
        return entry[1]
    # Xóa entry hết hạn
    _DASHBOARD_CACHE.pop(key, None)
    return None


def _dashboard_cache_set(user_id: int, data: Any) -> None:
    key = _dashboard_cache_key(user_id)
    _DASHBOARD_CACHE[key] = (time.monotonic() + _DASHBOARD_TTL, data)


def _dashboard_cache_invalidate(user_id: int) -> None:
    """Gọi khi có action thay đổi data (VD: tạo withdrawal)."""
    key = _dashboard_cache_key(user_id)
    _DASHBOARD_CACHE.pop(key, None)


@router.get("/dashboard", response_model=AffiliateDashboardResponse)
def get_affiliate_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # #13: Trả cache nếu còn hiệu lực (TTL 5 phút)
    cached = _dashboard_cache_get(current_user.id)
    if cached is not None:
        return cached

    today = date.today()
    month_start, next_month_start, previous_month_start, previous_month_end = _month_bounds(today)

    current_commission = _commission_sum_query(db, current_user.id, month_start, next_month_start)
    previous_commission = _commission_sum_query(db, current_user.id, previous_month_start, previous_month_end)

    current_clicks = _count_or_zero(
        db.query(func.count(AffiliateClick.id))
        .filter(
            AffiliateClick.referrer_user_id == current_user.id,
            AffiliateClick.created_at >= month_start,
            AffiliateClick.created_at < next_month_start,
        )
        .scalar()
    )
    previous_clicks = _count_or_zero(
        db.query(func.count(AffiliateClick.id))
        .filter(
            AffiliateClick.referrer_user_id == current_user.id,
            AffiliateClick.created_at >= previous_month_start,
            AffiliateClick.created_at < previous_month_end,
        )
        .scalar()
    )

    success_orders = _count_or_zero(
        db.query(func.count(AffiliateCommission.id))
        .join(Order, Order.id == AffiliateCommission.order_id)
        .filter(
            AffiliateCommission.user_id == current_user.id,
            Order.status == "success",
            Order.created_at >= month_start,
            Order.created_at < next_month_start,
        )
        .scalar()
    )
    previous_success_orders = _count_or_zero(
        db.query(func.count(AffiliateCommission.id))
        .join(Order, Order.id == AffiliateCommission.order_id)
        .filter(
            AffiliateCommission.user_id == current_user.id,
            Order.status == "success",
            Order.created_at >= previous_month_start,
            Order.created_at < previous_month_end,
        )
        .scalar()
    )

    conversion_rate = round((success_orders / current_clicks) * 100, 2) if current_clicks else 0.0
    previous_conversion_rate = (
        round((previous_success_orders / previous_clicks) * 100, 2) if previous_clicks else 0.0
    )

    available_balance = _sum_or_zero(
        db.query(func.sum(AffiliateCommission.amount))
        .filter(
            AffiliateCommission.user_id == current_user.id,
            AffiliateCommission.status == "approved",
        )
        .scalar()
    )
    pending_balance = _sum_or_zero(
        db.query(func.sum(AffiliateCommission.amount))
        .filter(
            AffiliateCommission.user_id == current_user.id,
            AffiliateCommission.status == "pending",
        )
        .scalar()
    )
    paid_total = _sum_or_zero(
        db.query(func.sum(AffiliateCommission.amount))
        .filter(
            AffiliateCommission.user_id == current_user.id,
            AffiliateCommission.status == "paid",
        )
        .scalar()
    )

    chart: list[ChartPoint] = []
    chart_start = _day_start(today - timedelta(days=11))
    rows = (
        db.query(func.date(Order.created_at), func.sum(AffiliateCommission.amount))
        .join(Order, Order.id == AffiliateCommission.order_id)
        .filter(
            AffiliateCommission.user_id == current_user.id,
            AffiliateCommission.status != "cancelled",
            Order.created_at >= chart_start,
        )
        .group_by(func.date(Order.created_at))
        .all()
    )
    commission_by_day = {str(day): _sum_or_zero(total) for day, total in rows}
    for offset in range(12):
        day = today - timedelta(days=11 - offset)
        day_key = day.isoformat()
        chart.append(ChartPoint(date=day_key, commission=commission_by_day.get(day_key, 0.0)))

    item_revenue = OrderItem.price * OrderItem.quantity
    allocated_commission = AffiliateCommission.amount * item_revenue / func.nullif(Order.total_base_price, 0)
    # Fix #2: Đưa AffiliateCommission vào FROM bằng cách khai báo trong query() đầu tiên
    # sau đó join theo đúng thứ tự phụ thuộc
    top_rows = (
        db.query(
            Product.id,
            Product.name,
            func.count(func.distinct(Order.id)),
            func.sum(item_revenue),
            func.coalesce(func.sum(allocated_commission), 0),
        )
        .select_from(AffiliateCommission)
        .join(Order, Order.id == AffiliateCommission.order_id)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
        .join(Product, Product.id == ProductVariant.product_id)
        .filter(
            AffiliateCommission.user_id == current_user.id,
            AffiliateCommission.status != "cancelled",
            Order.created_at >= month_start,
            Order.created_at < next_month_start,
        )
        .group_by(Product.id, Product.name)
        .order_by(func.sum(AffiliateCommission.amount).desc())
        .limit(5)
        .all()
    )
    top_products = [
        TopProduct(
            product_id=product_id,
            name=name,
            orders=_count_or_zero(orders),
            revenue=_sum_or_zero(revenue),
            commission=_sum_or_zero(commission),
        )
        for product_id, name, orders, revenue, commission in top_rows
    ]

    recent_rows = (
        db.query(AffiliateCommission, Order)
        .join(Order, Order.id == AffiliateCommission.order_id)
        .filter(AffiliateCommission.user_id == current_user.id)
        .order_by(AffiliateCommission.created_at.desc())  # Dùng timestamp riêng của commission
        .limit(6)
        .all()
    )
    status_titles = {
        "pending": "Hoa hồng đang chờ duyệt",
        "approved": "Hoa hồng đã được duyệt",
        "paid": "Hoa hồng đã thanh toán",
        "cancelled": "Hoa hồng bị hủy",
    }
    recent_activities = [
        RecentActivity(
            title=status_titles.get(commission.status, "Cập nhật hoa hồng"),
            meta=f"Đơn {order.order_code}",
            amount=_sum_or_zero(commission.amount),
            status=commission.status,
            created_at=commission.created_at,  # Dùng timestamp riêng của commission
        )
        for commission, order in recent_rows
    ]

    response = AffiliateDashboardResponse(
        month_commission=DashboardMetric(
            label="Hoa hồng tháng này",
            value=current_commission,
            change=_change_percent(current_commission, previous_commission),
        ),
        month_clicks=DashboardMetric(
            label="Click ghi nhận",
            value=current_clicks,
            change=_change_percent(current_clicks, previous_clicks),
        ),
        success_orders=DashboardMetric(
            label="Đơn thành công",
            value=success_orders,
            change=_change_percent(success_orders, previous_success_orders),
        ),
        conversion_rate=DashboardMetric(
            label="Tỷ lệ chuyển đổi",
            value=conversion_rate,
            change=round(conversion_rate - previous_conversion_rate, 2),
        ),
        balance=AffiliateBalance(
            available=available_balance,
            pending=pending_balance,
            paid_total=paid_total,
        ),
        chart=chart,
        top_products=top_products,
        recent_activities=recent_activities,
    )
    # #13: Lưu vào cache
    _dashboard_cache_set(current_user.id, response)
    return response


@router.get("/products", response_model=AffiliateProductListResponse)
def get_affiliate_products(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=60),
    search: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    sort: str = Query("commission_desc"),
):
    today = date.today()
    month_start, next_month_start, _, _ = _month_bounds(today)
    # Fix #1: Không hardcode commission_rate — lấy từ Product.commission_rate
    item_revenue = OrderItem.price * OrderItem.quantity
    allocated_commission = AffiliateCommission.amount * item_revenue / func.nullif(Order.total_base_price, 0)

    # Tối ưu N+1 Lazy Load: dùng selectinload cho variants và joinedload cho category
    # để tải trước tất cả dữ liệu liên kết trong 2 queries bổ sung thay vì N+1 queries
    # khi truy cập product.variants và product.category trong vòng lặp bên dưới.
    query = (
        db.query(Product)
        .options(selectinload(Product.variants), joinedload(Product.category))
        .filter(Product.status == 1, Product.deleted_at.is_(None))
    )
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    if category_id:
        query = query.filter(Product.category_id == category_id)

    if sort == "price_asc":
        query = query.order_by(Product.base_price.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.base_price.desc())
    elif sort == "newest":
        query = query.order_by(Product.created_at.desc())
    elif sort == "commission_desc":
        # Fix #9 (liên quan #1): sort thực sự theo commission_rate, không phải base_price
        query = query.order_by(Product.commission_rate.desc(), Product.base_price.desc())
    else:
        query = query.order_by(Product.commission_rate.desc(), Product.base_price.desc())

    total = query.count()
    products = (
        query.offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    result: list[AffiliateProduct] = []

    # #11 FIX: Batch query tất cả product stats trong 1 lần thay vì N+1 queries
    product_ids_on_page = [p.id for p in products]
    stats_rows: list[Any] = []
    if product_ids_on_page:
        stats_rows = (
            db.query(
                ProductVariant.product_id,
                func.count(func.distinct(Order.id)),
                func.coalesce(func.sum(allocated_commission), 0),
            )
            .select_from(AffiliateCommission)
            .join(Order, Order.id == AffiliateCommission.order_id)
            .join(OrderItem, OrderItem.order_id == Order.id)
            .join(ProductVariant, ProductVariant.id == OrderItem.variant_id)
            .filter(
                ProductVariant.product_id.in_(product_ids_on_page),
                AffiliateCommission.user_id == current_user.id,
                AffiliateCommission.status != "cancelled",
                Order.created_at >= month_start,
                Order.created_at < next_month_start,
            )
            .group_by(ProductVariant.product_id)
            .all()
        )
    # Dict {product_id: (month_orders, month_commission)}
    stats_by_product: dict[int, tuple[int, float]] = {
        product_id: (_count_or_zero(orders), _sum_or_zero(commission))
        for product_id, orders, commission in stats_rows
    }

    for product in products:
        active_variants = [variant for variant in product.variants if variant.status == 1]
        prices = [
            float(variant.sale_price or variant.price)
            for variant in active_variants
            if variant.sale_price is not None or variant.price is not None
        ]
        display_price = min(prices) if prices else float(product.base_price)
        total_stock = sum(int(variant.stock or 0) for variant in active_variants)

        month_orders, month_commission = stats_by_product.get(product.id, (0, 0.0))
        product_commission_rate = float(product.commission_rate)
        result.append(
            AffiliateProduct(
                id=product.id,
                name=product.name,
                category_name=product.category.name if product.category else None,
                description=product.description,
                thumbnail=product.thumbnail,
                base_price=float(product.base_price),
                sale_price=display_price,
                stock=total_stock,
                commission_rate=product_commission_rate,
                estimated_commission=round(display_price * product_commission_rate / 100, 2),
                month_orders=month_orders,
                month_commission=month_commission,
            )
        )

    return AffiliateProductListResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
        data=result,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Withdrawal endpoints (#6)
# ─────────────────────────────────────────────────────────────────────────────

MIN_WITHDRAWAL_AMOUNT = 50_000.0  # VNĐ — số tiền rút tối thiểu


def _get_approved_balance(db: Session, user_id: int) -> float:
    """Số dư hoa hồng đã được duyệt (chưa thanh toán)."""
    return _sum_or_zero(
        db.query(func.sum(AffiliateCommission.amount))
        .filter(AffiliateCommission.user_id == user_id, AffiliateCommission.status == "approved")
        .scalar()
    )


def _get_pending_withdrawal_amount(db: Session, user_id: int) -> float:
    """Tổng tiền của các yêu cầu rút đang chờ duyệt."""
    return _sum_or_zero(
        db.query(func.sum(WithdrawalRequest.amount))
        .filter(WithdrawalRequest.user_id == user_id, WithdrawalRequest.status == "pending")
        .scalar()
    )


@router.post("/withdrawals", response_model=WithdrawalResponse, status_code=201)
def create_withdrawal_request(
    body: WithdrawalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Tạo yêu cầu rút tiền hoa hồng.
    Sử dụng SELECT FOR UPDATE để khoá row User tránh race condition rút tiền song song.
    Tối ưu DB Transaction: dùng flush() để sinh withdrawal.id, gán created_at trong Python,
    build response in-memory rồi mới commit() 1 lần duy nhất —
    loại bỏ db.refresh() giảm Supabase roundtrips từ 3 xuống 2.
    """
    if body.amount < MIN_WITHDRAWAL_AMOUNT:
        raise HTTPException(
            status_code=400,
            detail=f"Số tiền rút tối thiểu là {int(MIN_WITHDRAWAL_AMOUNT):,} ₫",
        )

    # Khóa dòng dữ liệu User để tránh race condition rút tiền song song
    user_lock = db.query(User).filter(User.id == current_user.id).with_for_update().first()
    if not user_lock:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy thông tin tài khoản người dùng",
        )

    approved_balance = _get_approved_balance(db, current_user.id)
    pending_withdrawal = _get_pending_withdrawal_amount(db, current_user.id)
    net_available = approved_balance - pending_withdrawal

    if body.amount > net_available:
        raise HTTPException(
            status_code=400,
            detail=f"Số dư khả dụng không đủ. Có thể rút tối đa {int(net_available):,} ₫",
        )

    now = datetime.now()
    bank_name = clean_required_text(body.bank_name, max_length=100, field_name="bank_name")
    bank_account = clean_required_text(body.bank_account, max_length=50, field_name="bank_account")
    bank_owner = clean_required_text(body.bank_owner, max_length=255, field_name="bank_owner")
    note = clean_text(body.note, max_length=500, field_name="note")
    withdrawal = WithdrawalRequest(
        user_id=current_user.id,
        amount=body.amount,
        status="pending",
        bank_name=bank_name,
        bank_account=bank_account,
        bank_owner=bank_owner,
        note=note,
        created_at=now,
    )
    db.add(withdrawal)
    # Tối ưu DB Transaction: dùng flush() để SQLAlchemy sinh withdrawal.id trong bộ nhớ
    # mà không kích hoạt ghi Disk vật lý. Gán created_at trực tiếp trong Python.
    # Build response ngay trong memory, sau đó commit() 1 lần duy nhất.
    # Loại bỏ db.refresh() giảm Supabase roundtrips từ 3 xuống 2.
    db.flush()
    response = WithdrawalResponse(
        id=withdrawal.id,
        amount=float(withdrawal.amount),
        status=withdrawal.status,
        bank_name=withdrawal.bank_name,
        bank_account=withdrawal.bank_account,
        bank_owner=withdrawal.bank_owner,
        note=withdrawal.note,
        admin_note=withdrawal.admin_note,
        created_at=now,
        processed_at=withdrawal.processed_at,
    )
    db.commit()
    # #13: Xóa cache dashboard vì balance đã thay đổi
    _dashboard_cache_invalidate(current_user.id)
    logger.info(
        "Withdrawal request created: user_id=%d, withdrawal_id=%d, amount=%.0f",
        current_user.id, withdrawal.id, float(body.amount),
    )
    return response


@router.get("/withdrawals", response_model=WithdrawalListResponse)
def get_withdrawal_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lịch sử yêu cầu rút tiền của affiliate."""
    approved_balance = _get_approved_balance(db, current_user.id)
    pending_balance = _sum_or_zero(
        db.query(func.sum(AffiliateCommission.amount))
        .filter(AffiliateCommission.user_id == current_user.id, AffiliateCommission.status == "pending")
        .scalar()
    )
    paid_total = _sum_or_zero(
        db.query(func.sum(AffiliateCommission.amount))
        .filter(AffiliateCommission.user_id == current_user.id, AffiliateCommission.status == "paid")
        .scalar()
    )
    pending_withdrawal = _get_pending_withdrawal_amount(db, current_user.id)
    net_available = max(0.0, approved_balance - pending_withdrawal)

    withdrawals = (
        db.query(WithdrawalRequest)
        .filter(WithdrawalRequest.user_id == current_user.id)
        .order_by(WithdrawalRequest.created_at.desc())
        .all()
    )

    return WithdrawalListResponse(
        balance=AffiliateBalance(
            available=approved_balance,
            pending=pending_balance,
            paid_total=paid_total,
        ),
        pending_withdrawal=pending_withdrawal,
        net_available=net_available,
        total=len(withdrawals),
        data=[
            WithdrawalResponse(
                id=w.id,
                amount=float(w.amount),
                status=w.status,
                bank_name=w.bank_name,
                bank_account=w.bank_account,
                bank_owner=w.bank_owner,
                note=w.note,
                admin_note=w.admin_note,
                created_at=w.created_at,
                processed_at=w.processed_at,
            )
            for w in withdrawals
        ],
    )
