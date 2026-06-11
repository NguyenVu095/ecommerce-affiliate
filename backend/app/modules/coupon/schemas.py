from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class CouponCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    type: Literal["percent", "fixed"]
    value: float = Field(gt=0)
    min_order: float = Field(default=0, ge=0)
    max_discount: Optional[float] = Field(default=None, gt=0)
    quantity: int = Field(default=0, ge=0)
    max_uses_per_user: int = Field(default=1, ge=1)
    applicable_type: Literal["all"] = "all"
    start_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None
    status: Literal[0, 1] = 1


class CouponResponse(BaseModel):
    id: int
    code: str
    type: str
    value: float
    min_order: float
    quantity: int
    expired_at: Optional[datetime] = None
    max_uses_per_user: int = 1
    max_discount: Optional[float] = None
    applicable_type: Literal["all"] = "all"
    start_at: Optional[datetime] = None
    status: int = 1

    class Config:
        from_attributes = True


class CouponValidateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    order_total: float = Field(ge=0)


class CouponValidateResponse(BaseModel):
    valid: bool
    message: str
    discount_amount: float = 0
    coupon: Optional[CouponResponse] = None


class CouponAvailableItem(BaseModel):
    id: int
    code: str
    type: str
    value: float
    max_discount: Optional[float] = None
    min_order: float
    description: str
    expired_at: Optional[datetime] = None
    is_eligible: bool
    is_used: bool
    ineligible_reason: Optional[str] = None

    class Config:
        from_attributes = True
