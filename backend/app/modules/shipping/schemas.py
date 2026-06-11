from typing import List

from pydantic import BaseModel, Field


class FeeItemRequest(BaseModel):
    variant_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=99)


class ShippingFeeRequest(BaseModel):
    to_district_id: int = Field(gt=0)
    to_ward_code: str = Field(min_length=1, max_length=20)
    items: List[FeeItemRequest] = Field(min_length=1, max_length=50)
    service_type_id: int = Field(default=2, gt=0)


class WardRequest(BaseModel):
    district_id: int = Field(gt=0)
