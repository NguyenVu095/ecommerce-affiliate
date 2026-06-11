from sqlalchemy import Column, Integer, String, SmallInteger, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    name = Column(String(100), nullable=False)
    parent_id = Column(Integer, ForeignKey("categories.id"), index=True, nullable=True)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    status = Column(SmallInteger, index=True, default=1)  # 1: Hiện trên Menu, 0: Ẩn
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent", cascade="all, delete-orphan", order_by="Category.id")
    products = relationship("Product", back_populates="category")
