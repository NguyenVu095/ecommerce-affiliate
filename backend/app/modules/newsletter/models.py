from sqlalchemy import Column, DateTime, Index, Integer, String
from sqlalchemy.sql import func

from app.db.database import Base


class NewsletterSubscription(Base):
    __tablename__ = "newsletter_subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    source = Column(String(50), index=True, nullable=False, default="website")
    status = Column(String(20), index=True, nullable=False, default="active")
    subscribed_at = Column(DateTime, index=True, server_default=func.now())
    unsubscribed_at = Column(DateTime, index=True, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_newsletter_subscriptions_status_date", "status", "subscribed_at"),
    )
