from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, SmallInteger, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    full_name = Column(String(255), index=True, nullable=False, default="No Name")
    email = Column(String(255), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=True)
    google_id = Column(String(255), unique=True, index=True, nullable=True)
    auth_provider = Column(String(50), index=True, default="local")
    phone = Column(String(20), unique=True, index=True, nullable=True)
    avatar = Column(String(255), nullable=True)
    role = Column(SmallInteger, index=True, default=0)
    status = Column(SmallInteger, index=True, default=1)
    token_version = Column(Integer, nullable=False, default=0, server_default="0")
    password_changed_at = Column(DateTime, nullable=True)
    referral_code = Column(String(20), unique=True, index=True, nullable=True)
    referred_by_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    created_at = Column(DateTime, index=True, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    addresses = relationship("UserAddress", back_populates="user", cascade="all, delete-orphan")


class UserAddress(Base):
    __tablename__ = "user_addresses"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    receiver_name = Column(String(255), nullable=False)
    receiver_phone = Column(String(20), nullable=False)
    province_id = Column(Integer, nullable=False)
    district_id = Column(Integer, nullable=False)
    ward_id = Column(String(50), nullable=False)
    address_detail = Column(String(255), nullable=False)
    is_default = Column(Boolean, default=False)

    user = relationship("User", back_populates="addresses")

    __table_args__ = (
        Index("ix_user_addresses_user_default", "user_id", "is_default"),
    )


class TokenBlocklist(Base):
    __tablename__ = "token_blocklist"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    jti = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    expires_at = Column(DateTime, index=True, nullable=False)
    revoked_at = Column(DateTime, server_default=func.now(), nullable=False)
    reason = Column(String(50), nullable=True)

    __table_args__ = (
        Index("ix_token_blocklist_user_expires", "user_id", "expires_at"),
    )
