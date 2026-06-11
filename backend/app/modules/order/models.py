from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, DECIMAL, Enum, Index, SmallInteger
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base

class ShippingMethod(Base):
    __tablename__ = "shipping_methods"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    name = Column(String(100), nullable=False)
    cost = Column(DECIMAL(15, 2), default=0.00)
    estimated_delivery = Column(String(100), nullable=True)
    status = Column(SmallInteger, index=True, default=1) # 1: Đang hợp tác, 0: Ngừng sử dụng
    service_id = Column(Integer, nullable=True)
    service_type_id = Column(Integer, nullable=True)

class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(50), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(SmallInteger, index=True, default=1) # 1: Đang kích hoạt, 0: Tạm ẩn

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    order_code = Column(String(50), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    shipping_method_id = Column(Integer, ForeignKey("shipping_methods.id"), index=True, nullable=False)
    payment_method_id = Column(Integer, ForeignKey("payment_methods.id"), index=True, nullable=False)
    coupon_id   = Column(Integer, ForeignKey("coupons.id"), index=True, nullable=True)
    coupon_code = Column(String(50), index=True, nullable=True)  # Lưu mã coupon để tiện tra cứu

    # Thông tin người nhận
    receiver_name  = Column(String(255), nullable=True)
    receiver_phone = Column(String(20),  nullable=True)
    receiver_email = Column(String(255), nullable=True)

    status = Column(Enum('pending', 'confirmed', 'shipping', 'success', 'cancelled', name='order_status_enum'), index=True, default="pending")
    payment_status = Column(Enum('unpaid', 'paid', name='payment_status_enum'), index=True, default="unpaid")
    
    total_base_price = Column(DECIMAL(15, 2), nullable=False)
    shipping_fee = Column(DECIMAL(15, 2), nullable=False)
    discount_amount = Column(DECIMAL(15, 2), default=0.00)
    total_final = Column(DECIMAL(15, 2), index=True, nullable=False)
    
    shipping_full_address = Column(Text, nullable=False)
    to_district_id = Column(Integer, nullable=True)   # GHN district ID người nhận
    to_ward_code   = Column(String(20), nullable=True) # GHN ward code người nhận
    note = Column(Text, nullable=True)
    
    shipping_order_code = Column(String(50), unique=True, index=True, nullable=True)
    ghn_status = Column(String(50), index=True, nullable=True)
    expected_delivery_time = Column(DateTime, index=True, nullable=True)
    
    created_at = Column(DateTime, index=True, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    status_history = relationship("OrderStatusHistory", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (
        Index('ix_orders_user_created', 'user_id', 'created_at'),
        Index('ix_orders_status_created', 'status', 'created_at'),
        Index('ix_orders_payment_status_status', 'payment_status', 'status'),
        Index('ix_orders_shipping_ghn', 'shipping_order_code', 'ghn_status'),
    )

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), index=True)
    quantity = Column(Integer, nullable=False)
    price = Column(DECIMAL(15, 2), nullable=False)
    sku = Column(String(100), index=True, nullable=True)
    
    # Relationships
    order = relationship("Order", back_populates="items")
    variant = relationship("ProductVariant", lazy="joined")

    __table_args__ = (
        Index('ix_order_items_order_variant', 'order_id', 'variant_id'),
    )

class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True)
    status = Column(String(50), index=True, nullable=False)
    note = Column(Text, nullable=True)
    changed_by = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    created_at = Column(DateTime, index=True, server_default=func.now())
    
    # Relationships
    order = relationship("Order", back_populates="status_history")

    __table_args__ = (
        Index('ix_order_status_history_order_created', 'order_id', 'created_at'),
    )
