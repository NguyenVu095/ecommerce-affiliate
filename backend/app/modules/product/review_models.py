from sqlalchemy import Column, Integer, Text, ForeignKey, JSON, Enum, SmallInteger, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.database import Base

class ProductReview(Base):
    __tablename__ = "product_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), index=True, nullable=False)
    order_item_id = Column(Integer, ForeignKey("order_items.id"), unique=True, index=True, nullable=False)
    rating = Column(SmallInteger, index=True, nullable=False)
    comment = Column(Text, nullable=True)
    images = Column(JSON, nullable=True)
    status = Column(Enum('pending', 'approved', 'hidden', name='review_status_enum'), index=True, default='pending')

    # Relationships
    product = relationship("Product", back_populates="reviews")

    __table_args__ = (
        UniqueConstraint('user_id', 'product_id', 'order_item_id', name='uix_product_reviews_user_product_order'),
        Index('ix_product_reviews_product_status', 'product_id', 'status'),
        Index('ix_product_reviews_product_rating', 'product_id', 'rating'),
        Index('ix_product_reviews_user_product', 'user_id', 'product_id'),
    )
