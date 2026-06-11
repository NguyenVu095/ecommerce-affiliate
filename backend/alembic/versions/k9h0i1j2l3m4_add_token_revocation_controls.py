"""add_token_revocation_controls

Revision ID: k9h0i1j2l3m4
Revises: 8e3b0e3c34f3
Create Date: 2026-05-21 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k9h0i1j2l3m4"
down_revision: Union[str, Sequence[str], None] = "8e3b0e3c34f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("password_changed_at", sa.DateTime(), nullable=True))

    op.create_table(
        "token_blocklist",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("reason", sa.String(length=50), nullable=True),
    )
    op.create_index("ix_token_blocklist_id", "token_blocklist", ["id"], unique=False)
    op.create_index("ix_token_blocklist_jti", "token_blocklist", ["jti"], unique=True)
    op.create_index("ix_token_blocklist_user_id", "token_blocklist", ["user_id"], unique=False)
    op.create_index("ix_token_blocklist_expires_at", "token_blocklist", ["expires_at"], unique=False)
    op.create_index("ix_token_blocklist_user_expires", "token_blocklist", ["user_id", "expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_token_blocklist_user_expires", table_name="token_blocklist")
    op.drop_index("ix_token_blocklist_expires_at", table_name="token_blocklist")
    op.drop_index("ix_token_blocklist_user_id", table_name="token_blocklist")
    op.drop_index("ix_token_blocklist_jti", table_name="token_blocklist")
    op.drop_index("ix_token_blocklist_id", table_name="token_blocklist")
    op.drop_table("token_blocklist")
    op.drop_column("users", "password_changed_at")
    op.drop_column("users", "token_version")
