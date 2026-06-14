"""add VNPay transaction audit and refunds

Revision ID: n2o3p4q5r6s7
Revises: m1n2o3p4q5r6
Create Date: 2026-06-12 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "n2o3p4q5r6s7"
down_revision: Union[str, Sequence[str], None] = "m1n2o3p4q5r6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE payment_status_enum ADD VALUE IF NOT EXISTS 'refunded'")

    op.create_table(
        "payment_transactions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("txn_ref", sa.String(length=100), nullable=False),
        sa.Column("amount", sa.DECIMAL(precision=15, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("payment_create_date", sa.String(length=14), nullable=False),
        sa.Column("payment_expire_date", sa.String(length=14), nullable=False),
        sa.Column("client_ip", sa.String(length=45), nullable=False),
        sa.Column("gateway_transaction_no", sa.String(length=32), nullable=True),
        sa.Column("response_code", sa.String(length=10), nullable=True),
        sa.Column("transaction_status", sa.String(length=10), nullable=True),
        sa.Column("bank_code", sa.String(length=32), nullable=True),
        sa.Column("card_type", sa.String(length=32), nullable=True),
        sa.Column("pay_date", sa.DateTime(), nullable=True),
        sa.Column("raw_response", sa.JSON(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("last_reconciled_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_transactions_id"), "payment_transactions", ["id"], unique=False)
    op.create_index(op.f("ix_payment_transactions_order_id"), "payment_transactions", ["order_id"], unique=False)
    op.create_index(op.f("ix_payment_transactions_provider"), "payment_transactions", ["provider"], unique=False)
    op.create_index(op.f("ix_payment_transactions_status"), "payment_transactions", ["status"], unique=False)
    op.create_index(op.f("ix_payment_transactions_created_at"), "payment_transactions", ["created_at"], unique=False)
    op.create_index(op.f("ix_payment_transactions_txn_ref"), "payment_transactions", ["txn_ref"], unique=True)
    op.create_index(
        op.f("ix_payment_transactions_gateway_transaction_no"),
        "payment_transactions",
        ["gateway_transaction_no"],
        unique=True,
    )
    op.create_index("ix_payment_transactions_order_status", "payment_transactions", ["order_id", "status"], unique=False)
    op.create_index(
        "ix_payment_transactions_provider_created",
        "payment_transactions",
        ["provider", "created_at"],
        unique=False,
    )

    op.create_table(
        "payment_refunds",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("payment_transaction_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(length=100), nullable=False),
        sa.Column("amount", sa.DECIMAL(precision=15, scale=2), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("requested_by", sa.Integer(), nullable=False),
        sa.Column("gateway_response_id", sa.String(length=100), nullable=True),
        sa.Column("gateway_transaction_no", sa.String(length=32), nullable=True),
        sa.Column("response_code", sa.String(length=10), nullable=True),
        sa.Column("transaction_status", sa.String(length=10), nullable=True),
        sa.Column("raw_response", sa.JSON(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.ForeignKeyConstraint(["payment_transaction_id"], ["payment_transactions.id"]),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_refunds_id"), "payment_refunds", ["id"], unique=False)
    op.create_index(op.f("ix_payment_refunds_order_id"), "payment_refunds", ["order_id"], unique=False)
    op.create_index(op.f("ix_payment_refunds_payment_transaction_id"), "payment_refunds", ["payment_transaction_id"], unique=False)
    op.create_index(op.f("ix_payment_refunds_request_id"), "payment_refunds", ["request_id"], unique=True)
    op.create_index(op.f("ix_payment_refunds_requested_by"), "payment_refunds", ["requested_by"], unique=False)
    op.create_index(op.f("ix_payment_refunds_status"), "payment_refunds", ["status"], unique=False)
    op.create_index(
        op.f("ix_payment_refunds_gateway_transaction_no"),
        "payment_refunds",
        ["gateway_transaction_no"],
        unique=False,
    )
    op.create_index("ix_payment_refunds_order_status", "payment_refunds", ["order_id", "status"], unique=False)

    op.create_table(
        "payment_gateway_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("payment_transaction_id", sa.Integer(), nullable=True),
        sa.Column("payment_refund_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("request_id", sa.String(length=100), nullable=True),
        sa.Column("signature_valid", sa.Boolean(), nullable=True),
        sa.Column("response_code", sa.String(length=10), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.ForeignKeyConstraint(["payment_refund_id"], ["payment_refunds.id"]),
        sa.ForeignKeyConstraint(["payment_transaction_id"], ["payment_transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_gateway_events_id"), "payment_gateway_events", ["id"], unique=False)
    op.create_index(op.f("ix_payment_gateway_events_order_id"), "payment_gateway_events", ["order_id"], unique=False)
    op.create_index(
        op.f("ix_payment_gateway_events_payment_transaction_id"),
        "payment_gateway_events",
        ["payment_transaction_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_payment_gateway_events_payment_refund_id"),
        "payment_gateway_events",
        ["payment_refund_id"],
        unique=False,
    )
    op.create_index(op.f("ix_payment_gateway_events_event_type"), "payment_gateway_events", ["event_type"], unique=False)
    op.create_index(op.f("ix_payment_gateway_events_request_id"), "payment_gateway_events", ["request_id"], unique=False)
    op.create_index(op.f("ix_payment_gateway_events_created_at"), "payment_gateway_events", ["created_at"], unique=False)
    op.create_index(
        "ix_payment_gateway_events_order_created",
        "payment_gateway_events",
        ["order_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_payment_gateway_events_order_created", table_name="payment_gateway_events")
    op.drop_index(op.f("ix_payment_gateway_events_created_at"), table_name="payment_gateway_events")
    op.drop_index(op.f("ix_payment_gateway_events_request_id"), table_name="payment_gateway_events")
    op.drop_index(op.f("ix_payment_gateway_events_event_type"), table_name="payment_gateway_events")
    op.drop_index(op.f("ix_payment_gateway_events_payment_refund_id"), table_name="payment_gateway_events")
    op.drop_index(op.f("ix_payment_gateway_events_payment_transaction_id"), table_name="payment_gateway_events")
    op.drop_index(op.f("ix_payment_gateway_events_order_id"), table_name="payment_gateway_events")
    op.drop_index(op.f("ix_payment_gateway_events_id"), table_name="payment_gateway_events")
    op.drop_table("payment_gateway_events")

    op.drop_index("ix_payment_refunds_order_status", table_name="payment_refunds")
    op.drop_index(op.f("ix_payment_refunds_gateway_transaction_no"), table_name="payment_refunds")
    op.drop_index(op.f("ix_payment_refunds_status"), table_name="payment_refunds")
    op.drop_index(op.f("ix_payment_refunds_requested_by"), table_name="payment_refunds")
    op.drop_index(op.f("ix_payment_refunds_request_id"), table_name="payment_refunds")
    op.drop_index(op.f("ix_payment_refunds_payment_transaction_id"), table_name="payment_refunds")
    op.drop_index(op.f("ix_payment_refunds_order_id"), table_name="payment_refunds")
    op.drop_index(op.f("ix_payment_refunds_id"), table_name="payment_refunds")
    op.drop_table("payment_refunds")

    op.drop_index("ix_payment_transactions_provider_created", table_name="payment_transactions")
    op.drop_index("ix_payment_transactions_order_status", table_name="payment_transactions")
    op.drop_index(op.f("ix_payment_transactions_gateway_transaction_no"), table_name="payment_transactions")
    op.drop_index(op.f("ix_payment_transactions_txn_ref"), table_name="payment_transactions")
    op.drop_index(op.f("ix_payment_transactions_created_at"), table_name="payment_transactions")
    op.drop_index(op.f("ix_payment_transactions_status"), table_name="payment_transactions")
    op.drop_index(op.f("ix_payment_transactions_provider"), table_name="payment_transactions")
    op.drop_index(op.f("ix_payment_transactions_order_id"), table_name="payment_transactions")
    op.drop_index(op.f("ix_payment_transactions_id"), table_name="payment_transactions")
    op.drop_table("payment_transactions")

    # PostgreSQL enum values cannot be removed safely in a generic downgrade.
