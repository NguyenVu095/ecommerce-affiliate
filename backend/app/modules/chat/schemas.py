"""
Module định nghĩa các Pydantic schemas (Data Transfer Objects) cho tính năng Chat.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Any, Literal


class ChatSessionCreate(BaseModel):
    """
    Schema yêu cầu tạo phiên chat mới.
    """
    guest_name: str | None = Field(default=None, max_length=255)
    guest_phone: str | None = Field(default=None, max_length=20)
    source: Literal["web", "zalo", "facebook"] = "web"


class ChatSessionResponse(BaseModel):
    """
    Schema phản hồi thông tin phiên chat.
    """
    id: int
    user_id: int | None = None
    source: str
    status: str
    guest_name: str | None = None
    guest_phone: str | None = None
    last_message_at: datetime
    access_token: str | None = None

    class Config:
        from_attributes = True


class ChatMessageCreate(BaseModel):
    """
    Schema yêu cầu gửi tin nhắn mới.
    """
    session_id: int = Field(gt=0)
    message_content: str = Field(min_length=1, max_length=4000)


class ChatMessageResponse(BaseModel):
    """
    Schema phản hồi thông tin tin nhắn.
    """
    id: int
    session_id: int
    sender_type: str
    message_content: str | None = None
    intent: str | None = None
    product_ids: list[int] | None = None
    is_handoff_to_admin: bool
    metadata_json: Any | None = Field(None, serialization_alias="metadata", validation_alias="metadata_json")

    class Config:
        from_attributes = True
        populate_by_name = True
