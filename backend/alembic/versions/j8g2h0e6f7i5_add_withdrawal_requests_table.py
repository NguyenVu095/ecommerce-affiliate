"""add_withdrawal_requests_table

Revision ID: j8g2h0e6f7i5
Revises: i7f1g9d5e6h4
Create Date: 2026-05-16 07:06:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'j8g2h0e6f7i5'
down_revision: Union[str, Sequence[str], None] = 'i7f1g9d5e6h4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'withdrawal_requests',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer, sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False),
        sa.Column(
            'status',
            sa.Enum('pending', 'approved', 'rejected', 'paid', name='withdrawal_status_enum'),
            nullable=False,
            server_default='pending',
            index=True,
        ),
        sa.Column('bank_name', sa.String(100), nullable=False),
        sa.Column('bank_account', sa.String(50), nullable=False),
        sa.Column('bank_owner', sa.String(255), nullable=False),
        sa.Column('note', sa.Text, nullable=True),
        sa.Column('admin_note', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('processed_at', sa.DateTime, nullable=True),
    )
    op.create_index('ix_withdrawal_requests_user_status', 'withdrawal_requests', ['user_id', 'status'])
    op.create_index('ix_withdrawal_requests_user_created', 'withdrawal_requests', ['user_id', 'created_at'])
    op.create_index('ix_withdrawal_requests_id', 'withdrawal_requests', ['id'])


def downgrade() -> None:
    op.drop_index('ix_withdrawal_requests_user_created', table_name='withdrawal_requests')
    op.drop_index('ix_withdrawal_requests_user_status', table_name='withdrawal_requests')
    op.drop_index('ix_withdrawal_requests_id', table_name='withdrawal_requests')
    op.drop_table('withdrawal_requests')
    op.execute("DROP TYPE IF EXISTS withdrawal_status_enum")
