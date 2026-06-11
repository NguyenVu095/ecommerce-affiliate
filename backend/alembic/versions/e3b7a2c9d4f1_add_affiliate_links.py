"""add_affiliate_links

Revision ID: e3b7a2c9d4f1
Revises: d65e698ce2c7
Create Date: 2026-05-13 10:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e3b7a2c9d4f1'
down_revision: Union[str, Sequence[str], None] = 'd65e698ce2c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    link_status = postgresql.ENUM('active', 'paused', name='affiliate_link_status_enum', create_type=False)
    link_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'affiliate_links',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('campaign_name', sa.String(length=255), nullable=False),
        sa.Column('channel', sa.String(length=50), nullable=False),
        sa.Column('status', link_status, nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_affiliate_links_id'), 'affiliate_links', ['id'], unique=False)
    op.create_index(op.f('ix_affiliate_links_product_id'), 'affiliate_links', ['product_id'], unique=False)
    op.create_index(op.f('ix_affiliate_links_status'), 'affiliate_links', ['status'], unique=False)
    op.create_index(op.f('ix_affiliate_links_user_id'), 'affiliate_links', ['user_id'], unique=False)
    op.create_index('ix_affiliate_links_user_product', 'affiliate_links', ['user_id', 'product_id'], unique=False)
    op.create_index('ix_affiliate_links_user_status', 'affiliate_links', ['user_id', 'status'], unique=False)

    op.add_column('affiliate_clicks', sa.Column('affiliate_link_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'affiliate_clicks', 'affiliate_links', ['affiliate_link_id'], ['id'])
    op.create_index(op.f('ix_affiliate_clicks_affiliate_link_id'), 'affiliate_clicks', ['affiliate_link_id'], unique=False)
    op.create_index('ix_affiliate_clicks_link_date', 'affiliate_clicks', ['affiliate_link_id', 'created_at'], unique=False)

    op.add_column('affiliate_commissions', sa.Column('affiliate_link_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'affiliate_commissions', 'affiliate_links', ['affiliate_link_id'], ['id'])
    op.create_index(op.f('ix_affiliate_commissions_affiliate_link_id'), 'affiliate_commissions', ['affiliate_link_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_affiliate_commissions_affiliate_link_id'), table_name='affiliate_commissions')
    op.drop_column('affiliate_commissions', 'affiliate_link_id')

    op.drop_index('ix_affiliate_clicks_link_date', table_name='affiliate_clicks')
    op.drop_index(op.f('ix_affiliate_clicks_affiliate_link_id'), table_name='affiliate_clicks')
    op.drop_column('affiliate_clicks', 'affiliate_link_id')

    op.drop_index('ix_affiliate_links_user_status', table_name='affiliate_links')
    op.drop_index('ix_affiliate_links_user_product', table_name='affiliate_links')
    op.drop_index(op.f('ix_affiliate_links_user_id'), table_name='affiliate_links')
    op.drop_index(op.f('ix_affiliate_links_status'), table_name='affiliate_links')
    op.drop_index(op.f('ix_affiliate_links_product_id'), table_name='affiliate_links')
    op.drop_index(op.f('ix_affiliate_links_id'), table_name='affiliate_links')
    op.drop_table('affiliate_links')

    sa.Enum(name='affiliate_link_status_enum').drop(op.get_bind(), checkfirst=True)
