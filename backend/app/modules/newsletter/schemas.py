from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class NewsletterSubscribeRequest(BaseModel):
    email: EmailStr
    source: Optional[str] = Field(default="website", max_length=50)


class NewsletterSubscribeResponse(BaseModel):
    id: int
    email: EmailStr
    status: str
    already_subscribed: bool
    message: str
    subscribed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
