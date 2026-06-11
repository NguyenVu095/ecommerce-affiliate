"""
Module định nghĩa các model SQLAlchemy cho tính năng Chat hỗ trợ trực tuyến.
"""

from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Enum, Index, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class ChatSession(Base):
    """
    Model lưu trữ phiên chat giữa khách hàng (thành viên hoặc khách vãng lai) và hệ thống.

    Attributes:
        id (int): ID duy nhất của phiên chat.
        user_id (int | None): ID của user (nếu đã đăng nhập).
        source (str): Nguồn của phiên chat (web, zalo, facebook).
        status (str): Trạng thái phiên chat (open: đang mở, closed: đã đóng, transferred: đã chuyển cho admin).
        guest_name (str | None): Tên của khách vãng lai.
        guest_phone (str | None): Số điện thoại của khách vãng lai.
        last_message_at (datetime): Thời điểm nhận/gửi tin nhắn cuối cùng.
    """
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    source = Column(Enum('web', 'zalo', 'facebook', name='chat_source_enum'), index=True, default='web')
    status = Column(Enum('open', 'closed', 'transferred', name='chat_status_enum'), index=True, default='open')
    guest_name = Column(String(255), nullable=True)
    guest_phone = Column(String(20), index=True, nullable=True)
    access_token_hash = Column(String(64), index=True, nullable=True)
    last_message_at = Column(DateTime, index=True, server_default=func.now())

    # Relationships
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index('ix_chat_sessions_user_last_msg', 'user_id', 'last_message_at'),
        Index('ix_chat_sessions_status_last_msg', 'status', 'last_message_at'),
        Index('ix_chat_sessions_source_status', 'source', 'status'),
    )


class ChatMessage(Base):
    """
    Model lưu trữ các tin nhắn chi tiết trong từng phiên chat.

    Attributes:
        id (int): ID duy nhất của tin nhắn.
        session_id (int): ID của phiên chat chứa tin nhắn này.
        sender_type (str): Đối tượng gửi tin nhắn (user: khách hàng, bot: trợ lý AI, admin: quản trị viên).
        message_content (str | None): Nội dung tin nhắn dạng văn bản.
        intent (str | None): Ý định của tin nhắn (nếu bot xử lý, ví dụ: RAG, handoff...).
        product_ids (list[int] | None): Danh sách ID sản phẩm được nhắc đến/gợi ý trong tin nhắn.
        is_handoff_to_admin (bool): Đánh dấu tin nhắn kích hoạt yêu cầu chuyển giao cho nhân viên thật.
        metadata_json (dict | None): Dữ liệu bổ sung (metadata) đi kèm với tin nhắn (ví dụ: thông tin sản phẩm gợi ý).
    """
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), index=True, nullable=False)
    sender_type = Column(Enum('user', 'bot', 'admin', name='chat_sender_type_enum'), index=True, nullable=False)
    message_content = Column(Text, nullable=True)
    intent = Column(String(100), index=True, nullable=True)
    product_ids = Column(JSON, nullable=True)
    is_handoff_to_admin = Column(Boolean, index=True, default=False)
    metadata_json = Column("metadata", JSON, nullable=True) # mapped as metadata since metadata is reserved in Base

    # Relationships
    session = relationship("ChatSession", back_populates="messages")

    __table_args__ = (
        Index('ix_chat_messages_session_id_asc', 'session_id', 'id'),
        Index('ix_chat_messages_session_sender', 'session_id', 'sender_type'),
        Index('ix_chat_messages_intent_session', 'intent', 'session_id'),
    )
