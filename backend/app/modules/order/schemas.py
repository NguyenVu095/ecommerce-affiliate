from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class OrderItemCreate(BaseModel):
    variant_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=99)


class OrderCreate(BaseModel):
    shipping_method_id: int = Field(gt=0)
    payment_method_id: int = Field(gt=0)
    coupon_id: Optional[int] = Field(default=None, gt=0)
    coupon_code: Optional[str] = Field(default=None, max_length=50)
    receiver_name: Optional[str] = Field(default=None, max_length=255)
    receiver_phone: Optional[str] = Field(default=None, max_length=20)
    receiver_email: Optional[EmailStr] = None
    shipping_full_address: str = Field(min_length=1, max_length=1000)
    to_district_id: Optional[int] = Field(default=None, gt=0)
    to_ward_code: Optional[str] = Field(default=None, max_length=20)
    note: Optional[str] = Field(default=None, max_length=1000)
    shipping_fee: Optional[float] = Field(default=None, ge=0)
    discount_amount: Optional[float] = Field(default=None, ge=0)
    affiliate_referral_code: Optional[str] = Field(default=None, max_length=64)
    affiliate_link_id: Optional[int] = Field(default=None, gt=0)
    items: List[OrderItemCreate] = Field(min_length=1, max_length=50)

    @field_validator(
        "coupon_code",
        "receiver_name",
        "receiver_phone",
        "shipping_full_address",
        "to_ward_code",
        "note",
        "affiliate_referral_code",
        mode="before",
    )
    @classmethod
    def strip_blank_strings(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class PaymentMethodResponse(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str] = None
    status: int

    class Config:
        from_attributes = True


class ShippingMethodResponse(BaseModel):
    id: int
    name: str
    estimated_delivery: Optional[str] = None
    status: int
    service_type_id: Optional[int] = None

    class Config:
        from_attributes = True


class OrderItemProductInfo(BaseModel):
    product_id: int
    product_name: str
    thumbnail: Optional[str] = None
    attributes: Optional[dict] = None

    class Config:
        from_attributes = True


class OrderItemReviewInfo(BaseModel):
    id: int
    rating: int
    comment: Optional[str] = None
    images: Optional[List[str]] = None
    status: str

    class Config:
        from_attributes = True


class OrderItemResponse(BaseModel):
    id: int
    variant_id: int
    quantity: int
    price: float
    sku: Optional[str] = None
    review: Optional[OrderItemReviewInfo] = None
    product: Optional[OrderItemProductInfo] = None

    class Config:
        from_attributes = True


class OrderResponse(BaseModel):
    id: int
    order_code: str
    status: str
    payment_status: str
    payment_method_code: Optional[str] = None
    user_id: Optional[int] = None
    coupon_id: Optional[int] = None
    coupon_code: Optional[str] = None
    receiver_name: Optional[str] = None
    receiver_phone: Optional[str] = None
    receiver_email: Optional[str] = None
    total_base_price: float
    shipping_fee: float
    discount_amount: float
    total_final: float
    shipping_full_address: str
    to_district_id: Optional[int] = None
    to_ward_code: Optional[str] = None
    note: Optional[str] = None
    shipping_order_code: Optional[str] = None
    expected_delivery_time: Optional[datetime] = None
    ghn_status: Optional[str] = None
    created_at: Optional[datetime] = None
    items: List[OrderItemResponse] = []

    class Config:
        from_attributes = True


class OrderListResponse(BaseModel):
    total: int
    skip: int = 0
    limit: int = 10
    has_more: bool = False
    data: List[OrderResponse]
