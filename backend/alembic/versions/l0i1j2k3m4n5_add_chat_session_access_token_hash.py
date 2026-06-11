"""add_chat_session_access_token_hash

Revision ID: l0i1j2k3m4n5
Revises: k9h0i1j2l3m4
Create Date: 2026-06-06 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "l0i1j2k3m4n5"
down_revision: Union[str, Sequence[str], None] = "k9h0i1j2l3m4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_sessions", sa.Column("access_token_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_chat_sessions_access_token_hash", "chat_sessions", ["access_token_hash"], unique=False)
    op.create_index("ix_orders_payment_status_status", "orders", ["payment_status", "status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_orders_payment_status_status", table_name="orders")
    op.drop_index("ix_chat_sessions_access_token_hash", table_name="chat_sessions")
    op.drop_column("chat_sessions", "access_token_hash")
