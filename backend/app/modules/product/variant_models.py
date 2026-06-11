from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, JSON, SmallInteger, DateTime, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True, nullable=False)
    sku = Column(String(100), unique=True, index=True)
    attributes = Column(JSON)
    price = Column(Numeric(12, 2), index=True, nullable=False)
    sale_price = Column(Numeric(12, 2), index=True, nullable=True)
    stock = Column(Integer, index=True, default=0)
    image_url = Column(String(255))
    weight = Column(Integer, default=0)
    length = Column(Integer, default=0)
    width = Column(Integer, default=0)
    height = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    status = Column(SmallInteger, index=True, default=1)

    # Relationships
    product = relationship("Product", back_populates="variants")
