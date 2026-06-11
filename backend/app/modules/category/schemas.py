from typing import List, Optional

from pydantic import BaseModel, Field


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=1, max_length=100)
    parent_id: Optional[int] = Field(default=None, gt=0)
    status: int = 1


class CategoryCreate(CategoryBase):
    pass


class CategoryResponse(BaseModel):
    id: int
    name: str
    slug: str
    parent_id: Optional[int] = None
    status: int
    children: List["CategoryResponse"] = []

    class Config:
        from_attributes = True


CategoryResponse.model_rebuild()
