from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ProductVariantResponse(BaseModel):
    id: int
    sku: Optional[str] = None
    attributes: Optional[dict] = None
    price: float
    sale_price: Optional[float] = None
    stock: int
    image_url: Optional[str] = None
    weight: int = 0
    length: int = 0
    width: int = 0
    height: int = 0

    class Config:
        from_attributes = True


class ProductVariantCreate(BaseModel):
    sku: Optional[str] = Field(default=None, max_length=100)
    attributes: Optional[dict] = None
    price: float = Field(ge=0)
    sale_price: Optional[float] = Field(default=None, ge=0)
    stock: int = Field(default=0, ge=0)
    image_url: Optional[str] = Field(default=None, max_length=2048)
    weight: int = Field(default=0, ge=0)
    length: int = Field(default=0, ge=0)
    width: int = Field(default=0, ge=0)
    height: int = Field(default=0, ge=0)


class CategoryInfo(BaseModel):
    id: int
    name: str
    slug: str

    class Config:
        from_attributes = True


class ProductResponse(BaseModel):
    id: int
    name: str
    category_id: Optional[int] = None
    category: Optional[CategoryInfo] = None
    description: Optional[str] = None
    base_price: float
    thumbnail: Optional[str] = None
    gender: int = 2
    status: int = 1
    deleted_at: Optional[datetime] = None
    variants: List[ProductVariantResponse] = []

    class Config:
        from_attributes = True


class ProductCardResponse(BaseModel):
    id: int
    name: str
    base_price: float
    thumbnail: Optional[str] = None
    min_price: float
    has_sale: bool = False
    total_stock: int = 0
    best_discount: int = 0


class ProductCardListResponse(BaseModel):
    total: int
    skip: int = 0
    limit: int = 12
    has_more: bool = False
    available_sizes: List[str] = []
    available_colors: List[str] = []
    data: List[ProductCardResponse]


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category_id: Optional[int] = Field(default=None, gt=0)
    description: Optional[str] = Field(default=None, max_length=5000)
    base_price: float = Field(ge=0)
    thumbnail: Optional[str] = Field(default=None, max_length=2048)
    gender: int = 2
    status: int = 1
    variants: List[ProductVariantCreate] = Field(default_factory=list, max_length=100)


class ProductReviewCreate(BaseModel):
    order_item_id: int = Field(gt=0)
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=2000)
    images: Optional[List[str]] = Field(default=None, max_length=4)


class ProductReviewUpdate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=2000)
    images: Optional[List[str]] = Field(default=None, max_length=4)


class ProductReviewResponse(BaseModel):
    id: int
    product_id: int
    order_item_id: int
    rating: int
    comment: Optional[str] = None
    images: Optional[List[str]] = None
    status: str
    user_name: str
    user_avatar: Optional[str] = None


class ProductReviewSummary(BaseModel):
    average_rating: float
    total_reviews: int
    rating_counts: Dict[int, int]


class ProductReviewsResponse(BaseModel):
    summary: ProductReviewSummary
    skip: int = 0
    limit: int = 5
    has_more: bool = False
    reviews: List[ProductReviewResponse]
