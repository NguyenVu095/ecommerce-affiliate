from sqlalchemy import Column, Integer, String, Text, SmallInteger, ForeignKey, Numeric, DateTime, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    name = Column(String(255), index=True, nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), index=True, nullable=True)
    description = Column(Text)
    base_price = Column(Numeric(12, 2), index=True, nullable=False)
    commission_rate = Column(Numeric(5, 2), index=True, nullable=False, default=10.00)
    thumbnail = Column(String(255))
    gender = Column(SmallInteger, index=True, default=2)  # 0: Nam, 1: Nữ, 2: Unisex
    status = Column(SmallInteger, index=True, default=1)  # 1: Đang kinh doanh, 0: Ngừng/Ẩn
    created_at = Column(DateTime, index=True, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime, index=True, nullable=True)

    # Relationships
    category = relationship("Category", back_populates="products")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")
    reviews = relationship("ProductReview", back_populates="product", cascade="all, delete-orphan")


# Tránh lỗi Mapper initialization khi import Product riêng lẻ
from app.modules.product.review_models import ProductReview


