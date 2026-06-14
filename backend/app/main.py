"""
Tệp khởi chạy chính của ứng dụng FastAPI.

Thực hiện nạp các cấu hình, đăng ký middlewares (CORS, Security headers),
tự động khởi tạo database schema và nạp tất cả các API routers nghiệp vụ.
"""

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import is_production, validate_runtime_config
from app.core.middleware import SecurityHeadersMiddleware
from app.core.rate_limit import ensure_rate_limit_ready

validate_runtime_config()
production = is_production()

from app.db.database import engine, Base

# Import tất cả các SQLAlchemy Models để SQLAlchemy nhận diện các mối quan hệ (relationships) lúc khởi tạo
from app.modules.user.models import TokenBlocklist, User, UserAddress
from app.modules.product.models import Product
from app.modules.product.variant_models import ProductVariant
from app.modules.product.review_models import ProductReview
from app.modules.category.models import Category
from app.modules.coupon.models import Coupon, CouponUsage
from app.modules.order.models import (
    Order,
    OrderItem,
    OrderStatusHistory,
    PaymentGatewayEvent,
    PaymentMethod,
    PaymentRefund,
    PaymentTransaction,
    ShippingMethod,
)
from app.modules.affiliate.models import AffiliateClick, AffiliateCommission, AffiliateConversion, AffiliateLink
from app.modules.newsletter.models import NewsletterSubscription
from app.modules.chat.models import ChatSession, ChatMessage

# Import routers nghiệp vụ
from app.modules.user import routes as user_routes
from app.modules.product import routes as product_routes
from app.modules.order import routes as order_routes
from app.modules.category import routes as category_routes
from app.modules.coupon import routes as coupon_routes
from app.modules.shipping import routes as shipping_routes
from app.modules.shipper import routes as shipper_routes
from app.modules.admin import routes as admin_routes
from app.modules.affiliate import routes as affiliate_routes
from app.modules.newsletter import routes as newsletter_routes
from app.modules.chat import routes as chat_routes

app = FastAPI(
    title="Ecommerce Affiliate API",
    docs_url=None if production else "/docs",
    redoc_url=None if production else "/redoc",
    openapi_url=None if production else "/openapi.json",
)
app.add_middleware(SecurityHeadersMiddleware)

allowed_hosts = [
    host.strip()
    for host in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")
    if host.strip()
]
if "*" in allowed_hosts:
    raise RuntimeError("ALLOWED_HOSTS must list explicit hostnames.")
app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)

# Chỉ dùng create_all cho database local tạm thời khi được bật rõ ràng.
# PostgreSQL/Supabase phải được quản lý bằng Alembic để tránh schema drift.
auto_create_schema = os.getenv("AUTO_CREATE_SCHEMA", "false").lower() in {"1", "true", "yes", "on"}
if auto_create_schema:
    Base.metadata.create_all(bind=engine)

# Cấu hình CORS cho Frontend gọi API
allowed_origins_str = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_str:
    origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]
else:
    origins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ]

if "*" in origins:
    raise RuntimeError("ALLOWED_ORIGINS must be explicit when credentials are enabled.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With", "X-Chat-Session-Token"],
    expose_headers=["Retry-After"],
)

# Đăng ký các API routers nghiệp vụ
app.include_router(user_routes.router, prefix="/api/auth", tags=["auth"])
app.include_router(category_routes.router, prefix="/api/categories", tags=["categories"])
app.include_router(product_routes.router, prefix="/api/products", tags=["products"])
app.include_router(order_routes.router, prefix="/api/orders", tags=["orders"])
app.include_router(coupon_routes.router, prefix="/api/coupons", tags=["coupons"])
app.include_router(shipping_routes.router, prefix="/api/shipping", tags=["shipping"])
app.include_router(shipper_routes.router, prefix="/api/shipper", tags=["shipper"])
app.include_router(admin_routes.router, prefix="/api/admin", tags=["admin"])
app.include_router(affiliate_routes.router, prefix="/api/affiliate", tags=["affiliate"])
app.include_router(newsletter_routes.router, prefix="/api/newsletter", tags=["newsletter"])
app.include_router(chat_routes.router, prefix="/api/chat", tags=["chat"])


@app.get("/")
def home() -> dict[str, str]:
    """
    API gốc kiểm tra trạng thái hoạt động của hệ thống.
    """
    return {"status": "Hệ thống đang hoạt động", "version": "2.0.0"}


@app.get("/health/live", include_in_schema=False)
def health_live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready", include_in_schema=False)
def health_ready() -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        ensure_rate_limit_ready()
    except (SQLAlchemyError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail="Required dependency is unavailable") from exc
    return {"status": "ok"}
