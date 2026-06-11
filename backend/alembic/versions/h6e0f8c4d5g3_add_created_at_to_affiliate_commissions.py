"""add_created_at_to_affiliate_commissions

Revision ID: h6e0f8c4d5g3
Revises: g5d9e7b3c4f2
Create Date: 2026-05-15 23:19:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'h6e0f8c4d5g3'
down_revision: Union[str, Sequence[str], None] = 'g5d9e7b3c4f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Fix #4: Thêm cột created_at vào bảng affiliate_commissions
    # để commission có timestamp riêng, không phải mượn Order.created_at
    op.add_column(
        'affiliate_commissions',
        sa.Column(
            'created_at',
            sa.DateTime,
            nullable=True,
            server_default=sa.text('NOW()'),
        ),
    )
    op.create_index(
        'ix_affiliate_commissions_created_at',
        'affiliate_commissions',
        ['created_at'],
    )
    # Backfill: gán created_at = Order.created_at cho các bản ghi cũ
    # PostgreSQL dùng UPDATE ... FROM thay vì UPDATE ... JOIN (MySQL)
    op.execute("""
        UPDATE affiliate_commissions
        SET created_at = orders.created_at
        FROM orders
        WHERE orders.id = affiliate_commissions.order_id
          AND affiliate_commissions.created_at IS NULL
    """)
    # Sau khi backfill xong, đặt NOT NULL
    op.alter_column('affiliate_commissions', 'created_at', nullable=False)


def downgrade() -> None:
    op.drop_index('ix_affiliate_commissions_created_at', table_name='affiliate_commissions')
    op.drop_column('affiliate_commissions', 'created_at')
