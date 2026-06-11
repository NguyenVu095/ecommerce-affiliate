from sqlalchemy import CheckConstraint, Column, Integer, String, Numeric, DateTime, Enum, SmallInteger, ForeignKey, Index
from sqlalchemy.sql import func
from app.db.database import Base

class Coupon(Base):
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    type = Column(Enum('percent', 'fixed', name='coupon_type_enum'), nullable=False)
    value = Column(Numeric(12, 2), nullable=False)
    max_discount = Column(Numeric(12, 2), nullable=True)
    min_order = Column(Numeric(12, 2), index=True, default=0)
    quantity = Column(Integer, default=0)
    max_uses_per_user = Column(Integer, default=1)
    applicable_type = Column(Enum('all', 'category', 'product', name='coupon_applicable_type_enum'), index=True, default='all')
    start_at = Column(DateTime, index=True, nullable=True)
    expired_at = Column(DateTime, index=True, nullable=True)
    status = Column(SmallInteger, index=True, default=1)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('ix_coupons_code_status_dates', 'code', 'status', 'start_at', 'expired_at'),
        CheckConstraint("applicable_type = 'all'", name="ck_coupons_applicable_type_all"),
        CheckConstraint("max_uses_per_user >= 1", name="ck_coupons_max_uses_per_user_positive"),
    )

class CouponUsage(Base):
    __tablename__ = "coupon_usages"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    coupon_id = Column(Integer, ForeignKey("coupons.id"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True, index=True, nullable=False)
    used_at = Column(DateTime, index=True, server_default=func.now())

    __table_args__ = (
        Index('ix_coupon_usages_coupon_user', 'coupon_id', 'user_id'),
        Index('ix_coupon_usages_coupon_date', 'coupon_id', 'used_at'),
    )
