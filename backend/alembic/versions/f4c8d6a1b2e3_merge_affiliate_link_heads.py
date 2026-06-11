"""merge_affiliate_link_heads

Revision ID: f4c8d6a1b2e3
Revises: a2e8893765de, e3b7a2c9d4f1
Create Date: 2026-05-13 10:35:00.000000

"""
from typing import Sequence, Union


revision: str = 'f4c8d6a1b2e3'
down_revision: Union[str, Sequence[str], None] = ('a2e8893765de', 'e3b7a2c9d4f1')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
