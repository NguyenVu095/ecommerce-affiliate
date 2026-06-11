from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, DECIMAL, Enum, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

class AffiliateClick(Base):
    __tablename__ = "affiliate_clicks"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    referrer_user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    affiliate_link_id = Column(Integer, ForeignKey("affiliate_links.id"), index=True, nullable=True)
    referral_code = Column(String(20), index=True, nullable=False)
    ip_address = Column(String(45), index=True, nullable=True)
    user_agent = Column(Text, nullable=True)
    landing_url = Column(Text, nullable=True)
    created_at = Column(DateTime, index=True, server_default=func.now())

    __table_args__ = (
        Index('ix_affiliate_clicks_user_date', 'referrer_user_id', 'created_at'),
        Index('ix_affiliate_clicks_link_date', 'affiliate_link_id', 'created_at'),
        Index('ix_affiliate_clicks_code_date', 'referral_code', 'created_at'),
        Index('ix_affiliate_clicks_ip_date', 'ip_address', 'created_at'),
    )

class AffiliateLink(Base):
    __tablename__ = "affiliate_links"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), index=True, nullable=False)
    campaign_name = Column(String(255), nullable=False)
    channel = Column(String(50), index=True, nullable=False, default="direct")
    status = Column(Enum('active', 'paused', name='affiliate_link_status_enum'), index=True, default='active')
    created_at = Column(DateTime, index=True, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('ix_affiliate_links_user_status', 'user_id', 'status'),
        Index('ix_affiliate_links_user_product', 'user_id', 'product_id'),
    )

class AffiliateCommission(Base):
    __tablename__ = "affiliate_commissions"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    affiliate_link_id = Column(Integer, ForeignKey("affiliate_links.id"), index=True, nullable=True)
    order_total = Column(DECIMAL(15, 2), nullable=False)
    commission_rate = Column(DECIMAL(5, 2), nullable=False)
    amount = Column(DECIMAL(15, 2), nullable=False)
    status = Column(Enum('pending', 'approved', 'paid', 'cancelled', name='commission_status_enum'), index=True, default='pending')
    note = Column(Text, nullable=True)
    # Fix #4 (liên quan): Thêm created_at để có timestamp riêng của commission,
    # không cần mượn Order.created_at nữa
    created_at = Column(DateTime, index=True, server_default=func.now())
    approved_at = Column(DateTime, index=True, nullable=True)
    paid_at = Column(DateTime, index=True, nullable=True)

    __table_args__ = (
        Index('ix_affiliate_commissions_user_status', 'user_id', 'status'),
        Index('ix_affiliate_commissions_user_paid', 'user_id', 'paid_at'),
        Index('ix_affiliate_commissions_status_approved', 'status', 'approved_at'),
    )


# AffiliateConversion là ledger attribution cho đơn affiliate.
# Order flow ghi bảng này, còn affiliate/admin dùng để xem conversion theo code/cookie/manual.
class AffiliateConversion(Base):
    __tablename__ = "affiliate_conversions"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True, index=True, nullable=False)
    referrer_user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    referred_user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    commission_id = Column(Integer, ForeignKey("affiliate_commissions.id"), unique=True, index=True, nullable=False)
    attribution_type = Column(Enum('cookie', 'code', 'manual', name='attribution_type_enum'), index=True, default='cookie')
    created_at = Column(DateTime, index=True, server_default=func.now())

    __table_args__ = (
        Index('ix_affiliate_conversions_referrer_date', 'referrer_user_id', 'created_at'),
        Index('ix_affiliate_conversions_referred_date', 'referred_user_id', 'created_at'),
    )


class WithdrawalRequest(Base):
    """Yêu cầu rút tiền hoa hồng của affiliate."""
    __tablename__ = "withdrawal_requests"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    amount = Column(DECIMAL(15, 2), nullable=False)
    # pending → approved/rejected → paid
    status = Column(
        Enum('pending', 'approved', 'rejected', 'paid', name='withdrawal_status_enum'),
        index=True,
        default='pending',
    )
    bank_name = Column(String(100), nullable=False)
    bank_account = Column(String(50), nullable=False)
    bank_owner = Column(String(255), nullable=False)
    note = Column(Text, nullable=True)          # ghi chú từ affiliate
    admin_note = Column(Text, nullable=True)    # ghi chú từ admin khi duyệt/từ chối
    created_at = Column(DateTime, index=True, server_default=func.now())
    processed_at = Column(DateTime, index=True, nullable=True)  # khi admin xử lý

    __table_args__ = (
        Index('ix_withdrawal_requests_user_status', 'user_id', 'status'),
        Index('ix_withdrawal_requests_user_created', 'user_id', 'created_at'),
    )
