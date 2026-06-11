"""fix coupon usage limits

Revision ID: m1n2o3p4q5r6
Revises: l0i1j2k3m4n5
Create Date: 2026-06-11 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "m1n2o3p4q5r6"
down_revision: Union[str, Sequence[str], None] = "l0i1j2k3m4n5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE coupons SET applicable_type = 'all' "
        "WHERE applicable_type IS NULL OR applicable_type <> 'all'"
    )
    op.execute(
        "UPDATE coupons SET max_uses_per_user = 1 "
        "WHERE max_uses_per_user IS NULL OR max_uses_per_user < 1"
    )
    op.drop_constraint("uq_coupon_usages_coupon_user", "coupon_usages", type_="unique")
    op.create_index(
        "ix_coupon_usages_coupon_user",
        "coupon_usages",
        ["coupon_id", "user_id"],
        unique=False,
    )
    op.create_check_constraint(
        "ck_coupons_applicable_type_all",
        "coupons",
        "applicable_type = 'all'",
    )
    op.create_check_constraint(
        "ck_coupons_max_uses_per_user_positive",
        "coupons",
        "max_uses_per_user >= 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_coupons_max_uses_per_user_positive", "coupons", type_="check")
    op.drop_constraint("ck_coupons_applicable_type_all", "coupons", type_="check")
    op.drop_index("ix_coupon_usages_coupon_user", table_name="coupon_usages")
    op.execute(
        "DELETE FROM coupon_usages duplicate "
        "USING coupon_usages original "
        "WHERE duplicate.coupon_id = original.coupon_id "
        "AND duplicate.user_id = original.user_id "
        "AND duplicate.id > original.id"
    )
    op.create_unique_constraint(
        "uq_coupon_usages_coupon_user",
        "coupon_usages",
        ["coupon_id", "user_id"],
    )
