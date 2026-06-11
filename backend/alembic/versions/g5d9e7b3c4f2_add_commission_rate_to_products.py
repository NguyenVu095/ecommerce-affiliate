"""add_commission_rate_to_products

Revision ID: g5d9e7b3c4f2
Revises: f4c8d6a1b2e3
Create Date: 2026-05-15 23:17:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'g5d9e7b3c4f2'
down_revision: Union[str, Sequence[str], None] = 'f4c8d6a1b2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Thêm cột commission_rate vào bảng products
    # Mặc định 10.00% — tương thích với giá trị cứng hiện tại
    op.add_column(
        'products',
        sa.Column(
            'commission_rate',
            sa.Numeric(5, 2),
            nullable=False,
            server_default='10.00',
        ),
    )
    op.create_index('ix_products_commission_rate', 'products', ['commission_rate'])


def downgrade() -> None:
    op.drop_index('ix_products_commission_rate', table_name='products')
    op.drop_column('products', 'commission_rate')
