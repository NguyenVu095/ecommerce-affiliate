"""create_newsletter_subscriptions

Revision ID: b6a9d2e4f701
Revises: f4c8d6a1b2e3
Create Date: 2026-05-14 15:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6a9d2e4f701"
down_revision: Union[str, Sequence[str], None] = "f4c8d6a1b2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "newsletter_subscriptions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False, server_default="website"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("subscribed_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("unsubscribed_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_newsletter_subscriptions_id"), "newsletter_subscriptions", ["id"], unique=False)
    op.create_index(op.f("ix_newsletter_subscriptions_email"), "newsletter_subscriptions", ["email"], unique=True)
    op.create_index(op.f("ix_newsletter_subscriptions_source"), "newsletter_subscriptions", ["source"], unique=False)
    op.create_index(op.f("ix_newsletter_subscriptions_status"), "newsletter_subscriptions", ["status"], unique=False)
    op.create_index(op.f("ix_newsletter_subscriptions_subscribed_at"), "newsletter_subscriptions", ["subscribed_at"], unique=False)
    op.create_index("ix_newsletter_subscriptions_status_date", "newsletter_subscriptions", ["status", "subscribed_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_newsletter_subscriptions_status_date", table_name="newsletter_subscriptions")
    op.drop_index(op.f("ix_newsletter_subscriptions_subscribed_at"), table_name="newsletter_subscriptions")
    op.drop_index(op.f("ix_newsletter_subscriptions_status"), table_name="newsletter_subscriptions")
    op.drop_index(op.f("ix_newsletter_subscriptions_source"), table_name="newsletter_subscriptions")
    op.drop_index(op.f("ix_newsletter_subscriptions_email"), table_name="newsletter_subscriptions")
    op.drop_index(op.f("ix_newsletter_subscriptions_id"), table_name="newsletter_subscriptions")
    op.drop_table("newsletter_subscriptions")
