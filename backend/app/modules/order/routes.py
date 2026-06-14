"""
Module quản lý đơn hàng: tạo đơn, tra cứu, hủy, thanh toán VNPay Mock.

Các hằng số cấu hình VNPay được load sớm (module-level) để fail-fast ngay
khi server khởi động nếu môi trường chưa được cấu hình đúng.
"""

import logging
import os
import urllib.parse
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.cache import home_products_cache, product_cards_cache
from app.core.deps import get_current_user, get_current_user_optional
from app.core.rate_limit import get_trusted_client_ip, guest_order_create_rate_limiter, guest_order_lookup_rate_limiter
from app.core.validation import clean_required_text, clean_text, normalize_public_code
from app.db.database import get_db
from app.modules.affiliate.models import AffiliateCommission, AffiliateConversion, AffiliateLink
from app.modules.affiliate.routes import _dashboard_cache_invalidate, resolve_referrer
from app.modules.coupon.models import Coupon, CouponUsage
from app.modules.coupon.service import (
    calculate_coupon_discount,
    coupon_ineligibility_reason,
    get_user_coupon_usage_count,
)
from app.modules.order.models import Order, OrderItem, PaymentMethod, PaymentTransaction, ShippingMethod
from app.modules.order.payment_service import (
    VNPAY_ENABLED,
    VNPAY_HASH_SECRET,
    VNPAY_MOCK_ENABLED,
    VNPAY_TMN_CODE,
    build_mock_payment_url,
    build_vnpay_payment_url,
    get_or_create_payment_transaction,
    process_vnpay_ipn,
    to_vnpay_amount,
    verify_vnpay_signature,
)
from app.modules.order.schemas import (
    OrderCreate,
    OrderListResponse,
    OrderResponse,
    PaymentMethodResponse,
    ShippingMethodResponse,
)
from app.modules.product.review_models import ProductReview
from app.modules.product.models import Product
from app.modules.product.variant_models import ProductVariant
from app.modules.shipping.routes import calculate_ghn_shipping_fee
from app.modules.shipping.schemas import ShippingFeeRequest
from app.modules.user.models import User

load_dotenv()

CUSTOMER_APP_URL = os.getenv("CUSTOMER_APP_URL", "http://localhost:5173").rstrip("/")

router = APIRouter()
logger = logging.getLogger(__name__)
SUPPORTED_OFFLINE_PAYMENT_CODES = {"COD"}


def payment_method_is_supported(code: str) -> bool:
    normalized = code.strip().upper()
    return normalized in SUPPORTED_OFFLINE_PAYMENT_CODES or (normalized == "VNPAY" and VNPAY_ENABLED)


def ensure_order_can_be_cancelled(order: Order) -> None:
    """Block cancellation until a paid order has been refunded through an audited process."""
    if order.payment_status == "paid":
        raise HTTPException(
            status_code=409,
            detail="Paid orders cannot be cancelled until the payment has been refunded.",
        )


def ensure_order_can_be_completed(db: Session, order: Order) -> None:
    """Require gateway confirmation for VNPay while marking COD paid on delivery."""
    payment_method = db.query(PaymentMethod).filter(PaymentMethod.id == order.payment_method_id).first()
    payment_code = payment_method.code.strip().upper() if payment_method else ""
    if payment_code == "VNPAY" and order.payment_status != "paid":
        raise HTTPException(
            status_code=409,
            detail="VNPay orders cannot be completed before a successful IPN or reconciliation.",
        )
    if payment_code == "COD" and order.payment_status == "unpaid":
        order.payment_status = "paid"
    elif payment_code != "VNPAY" and payment_code != "COD":
        raise HTTPException(status_code=409, detail="Unsupported payment method cannot be completed.")


def calculate_weighted_commission(
    line_items: list[tuple[float, int, float]],
    total_base_price: float,
) -> tuple[float, float]:
    """Return total commission and its effective weighted percentage."""
    amount = round(sum(price * quantity * rate / 100 for price, quantity, rate in line_items), 2)
    effective_rate = round(amount * 100 / total_base_price, 2) if total_base_price > 0 else 0.0
    return amount, effective_rate


# ── Hàm serialize đơn hàng (dùng chung cho nhiều endpoints) ──────────────────

def serialize_order(order: Order, review_map: dict[int, ProductReview] | None = None) -> dict:
    """Chuyển đổi Order ORM object thành dict phản hồi chuẩn hóa.

    Tái sử dụng hàm này thay vì lặp lại logic dựng dict ở nhiều endpoints khác nhau
    (DRY principle). review_map là dict {order_item_id: ProductReview} để tra cứu O(1).
    """
    review_map = review_map or {}
    order_dict = {
        "id": order.id,
        "order_code": order.order_code,
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_method_code": order.payment_method.code if order.payment_method else None,
        "user_id": order.user_id,
        "coupon_id": order.coupon_id,
        "coupon_code": order.coupon_code,
        "receiver_name": order.receiver_name,
        "receiver_phone": order.receiver_phone,
        "receiver_email": order.receiver_email,
        "total_base_price": float(order.total_base_price),
        "shipping_fee": float(order.shipping_fee),
        "discount_amount": float(order.discount_amount),
        "total_final": float(order.total_final),
        "shipping_full_address": order.shipping_full_address,
        "to_district_id": order.to_district_id,
        "to_ward_code": order.to_ward_code,
        "note": order.note,
        "shipping_order_code": order.shipping_order_code,
        "expected_delivery_time": order.expected_delivery_time,
        "ghn_status": order.ghn_status,
        "created_at": order.created_at,
        "items": [],
    }

    for item in order.items:
        item_dict = {
            "id": item.id,
            "variant_id": item.variant_id,
            "quantity": item.quantity,
            "price": float(item.price),
            "sku": item.sku,
            "product": None,
            "review": None,
        }
        review = review_map.get(item.id)
        if review:
            item_dict["review"] = {
                "id": review.id,
                "rating": review.rating,
                "comment": review.comment,
                "images": review.images,
                "status": review.status,
            }
        if item.variant and item.variant.product:
            pv = item.variant
            prod = pv.product
            item_dict["product"] = {
                "product_id": prod.id,
                "product_name": prod.name,
                "thumbnail": pv.image_url or prod.thumbnail,
                "attributes": pv.attributes,
            }
        order_dict["items"].append(item_dict)

    return order_dict


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/payment-methods", response_model=list[PaymentMethodResponse])
def get_payment_methods(db: Session = Depends(get_db)) -> list[PaymentMethod]:
    """Trả về danh sách phương thức thanh toán đang hoạt động."""
    methods = db.query(PaymentMethod).filter(PaymentMethod.status == 1).all()
    return [method for method in methods if payment_method_is_supported(method.code)]


@router.get("/shipping-methods", response_model=list[ShippingMethodResponse])
def get_shipping_methods(db: Session = Depends(get_db)) -> list[ShippingMethod]:
    """Trả về danh sách phương thức vận chuyển đang hoạt động."""
    return db.query(ShippingMethod).filter(ShippingMethod.status == 1).all()


@router.get("/lookup", response_model=OrderResponse)
def lookup_guest_order(
    order_code: str,
    contact: str,
    db: Session = Depends(get_db),
    _: None = Depends(guest_order_lookup_rate_limiter),
) -> dict:
    """Tra cứu đơn hàng cho khách vãng lai bằng mã đơn + số điện thoại/email.

    Áp dụng joinedload để tải sẵn Order.items → OrderItem.variant trong 1 query
    bổ sung, tránh N+1 khi serialize_order truy cập item.variant trong vòng lặp.
    """
    normalized_code = order_code.strip()
    normalized_contact = contact.strip().lower()
    if not normalized_code or not normalized_contact:
        raise HTTPException(status_code=400, detail="Mã đơn hàng và thông tin liên hệ là bắt buộc")

    order = (
        db.query(Order)
        .filter(Order.order_code == normalized_code)
        .filter(
            or_(
                Order.receiver_phone == contact.strip(),
                func.lower(Order.receiver_email) == normalized_contact,
            )
        )
        .options(
            joinedload(Order.items).joinedload(OrderItem.variant)
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng phù hợp")

    item_ids = [item.id for item in order.items]
    review_map: dict[int, ProductReview] = {}
    if item_ids:
        reviews = db.query(ProductReview).filter(ProductReview.order_item_id.in_(item_ids)).all()
        review_map = {review.order_item_id: review for review in reviews}

    return serialize_order(order, review_map)


@router.get("/me", response_model=OrderListResponse)
def get_my_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Lấy danh sách đơn hàng của người dùng hiện tại, có phân trang.

    Tái sử dụng serialize_order() thay vì lặp lại logic dựng dict giống hệt —
    giảm ~50 dòng code trùng lặp (DRY principle).
    joinedload đa cấp tải sẵn items → variant → product trong 1 query bổ sung.
    """
    total = db.query(func.count(Order.id)).filter(Order.user_id == current_user.id).scalar() or 0
    orders = (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .options(
            joinedload(Order.items).joinedload(OrderItem.variant).joinedload(ProductVariant.product)
        )
        .order_by(Order.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Batch load toàn bộ reviews cho tất cả items trong 1 query (tránh N+1)
    item_ids = [item.id for order in orders for item in order.items]
    review_map: dict[int, ProductReview] = {}
    if item_ids:
        reviews = db.query(ProductReview).filter(ProductReview.order_item_id.in_(item_ids)).all()
        review_map = {review.order_item_id: review for review in reviews}

    # Tái sử dụng serialize_order() — tránh lặp lại ~50 dòng logic dựng dict trùng lặp
    result = [serialize_order(order, review_map) for order in orders]

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "has_more": skip + len(result) < total,
        "data": result,
    }


@router.post("/", response_model=OrderResponse, status_code=201)
def create_order(
    order_data: OrderCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> dict:
    """Tạo đơn hàng mới với xác thực và tính toán giá 100% ở Backend.

    Luồng xử lý:
    1. Lock variants theo thứ tự ID tăng dần (triệt tiêu deadlock chéo).
    2. Kiểm tra và tính phí vận chuyển từ DB (không tin frontend).
    3. Kiểm tra và tính giảm giá coupon từ DB (không tin frontend).
    4. Tạo Order + flush() để lấy ID tự sinh.
    5. Atomic UPDATE tồn kho (WHERE stock >= qty, rowcount=0 → rollback).
    6. Atomic UPDATE lượt dùng coupon + ghi CouponUsage.
    7. Xử lý affiliate commission nếu có referral code.
    8. Commit duy nhất 1 lần → đảm bảo tính ACID toàn luồng.

    Tối ưu DB Transaction: loại bỏ db.refresh(new_order) sau commit. Dùng
    serialize_order() trực tiếp trên object đã được session track sau flush()
    — giảm 1 roundtrip SELECT thừa.
    """
    affiliate_dashboard_user_id: int | None = None
    try:
        if not current_user:
            guest_order_create_rate_limiter(request)

        receiver_name = clean_text(order_data.receiver_name, max_length=255, field_name="receiver_name")
        receiver_phone = clean_text(order_data.receiver_phone, max_length=20, field_name="receiver_phone")
        receiver_email = str(order_data.receiver_email) if order_data.receiver_email else None
        if not current_user and (not receiver_name or not (receiver_phone or receiver_email)):
            raise HTTPException(
                status_code=400,
                detail="Khách vãng lai phải cung cấp tên người nhận và số điện thoại hoặc email",
            )

        coupon_code = normalize_public_code(order_data.coupon_code, max_length=50, field_name="coupon_code")
        affiliate_referral_code = normalize_public_code(
            order_data.affiliate_referral_code,
            max_length=64,
            field_name="affiliate_referral_code",
        )

        # ── 1. Tính tổng tiền sản phẩm + Khóa dòng variants ───────────────────
        total_base_price = 0.0
        variant_prices: dict[int, float] = {}  # Lưu giá thực tế để tạo OrderItem
        variant_skus: dict[int, str | None] = {}
        variant_product_ids: dict[int, int] = {}

        # Gom số lượng các item có cùng variant_id (nếu client gửi trùng lặp)
        qty_map: dict[int, int] = defaultdict(int)
        for item in order_data.items:
            qty_map[item.variant_id] += item.quantity

        # Sắp xếp variant_id theo thứ tự tăng dần để triệt tiêu hoàn toàn deadlock chéo
        sorted_variant_ids = sorted(qty_map.keys())

        for vid in sorted_variant_ids:
            qty = qty_map[vid]
            # Truy vấn và khóa dòng để đảm bảo không bị cập nhật bất đồng bộ
            variant = (
                db.query(ProductVariant)
                .join(Product, Product.id == ProductVariant.product_id)
                .filter(
                    ProductVariant.id == vid,
                    ProductVariant.status == 1,
                    Product.status == 1,
                    Product.deleted_at.is_(None),
                )
                .with_for_update()
                .first()
            )
            if not variant:
                raise HTTPException(
                    status_code=400,
                    detail=f"Biến thể ID {vid} không tồn tại",
                )
            if variant.stock < qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Biến thể ID {vid} không đủ tồn kho",
                )
            actual_price = float(variant.sale_price) if variant.sale_price else float(variant.price)
            total_base_price += actual_price * qty
            variant_prices[variant.id] = actual_price
            variant_skus[variant.id] = variant.sku if hasattr(variant, "sku") else None
            variant_product_ids[variant.id] = variant.product_id

        # ── 2. Phí vận chuyển (Tính từ DB, KHÔNG TIN TỪ FRONTEND) ─────────────
        shipping_fee = 0.0
        if order_data.shipping_method_id:
            sm = db.query(ShippingMethod).filter(
                ShippingMethod.id == order_data.shipping_method_id,
                ShippingMethod.status == 1,
            ).first()
            if sm:
                if sm.service_type_id:
                    if not order_data.to_district_id or not order_data.to_ward_code:
                        raise HTTPException(status_code=400, detail="GHN shipping requires district and ward")
                    shipping_fee = calculate_ghn_shipping_fee(
                        ShippingFeeRequest(
                            to_district_id=order_data.to_district_id,
                            to_ward_code=order_data.to_ward_code,
                            service_type_id=sm.service_type_id,
                            items=[
                                {"variant_id": variant_id, "quantity": quantity}
                                for variant_id, quantity in qty_map.items()
                            ],
                        ),
                        db,
                    )
                else:
                    shipping_fee = float(sm.cost)
            else:
                raise HTTPException(status_code=400, detail="Phương thức vận chuyển không hợp lệ")
        else:
            raise HTTPException(status_code=400, detail="Vui lòng chọn phương thức vận chuyển")

        payment_method = db.query(PaymentMethod).filter(
            PaymentMethod.id == order_data.payment_method_id,
            PaymentMethod.status == 1,
        ).first()
        if not payment_method:
            raise HTTPException(status_code=400, detail="Phương thức thanh toán không hợp lệ")
        if not payment_method_is_supported(payment_method.code):
            raise HTTPException(status_code=400, detail="Payment method is not supported")

        # ── 3. Xử lý coupon (Tính toán 100% ở Backend, KHÔNG TIN TỪ FRONTEND) ──
        discount_amount = 0.0
        resolved_coupon_id = None
        resolved_coupon_code = None

        coupon_to_use: Coupon | None = None
        if coupon_code:
            coupon_to_use = db.query(Coupon).filter(Coupon.code == coupon_code).with_for_update().first()
        elif order_data.coupon_id:
            coupon_to_use = db.query(Coupon).filter(Coupon.id == order_data.coupon_id).with_for_update().first()

        coupon_requested = bool(coupon_code or order_data.coupon_id)
        if coupon_requested and not coupon_to_use:
            raise HTTPException(status_code=400, detail="Mã giảm giá không tồn tại")

        if coupon_to_use:
            user_usage_count = 0
            if current_user:
                user_usage_count = get_user_coupon_usage_count(db, coupon_to_use.id, current_user.id)
            reason = coupon_ineligibility_reason(
                coupon_to_use,
                total_base_price,
                user_usage_count=user_usage_count,
            )
            if reason:
                raise HTTPException(status_code=400, detail=reason)

            discount_amount = calculate_coupon_discount(coupon_to_use, total_base_price)
            resolved_coupon_id = coupon_to_use.id
            resolved_coupon_code = coupon_to_use.code

        total_final = total_base_price + shipping_fee - discount_amount

        # ── 4. Tạo đơn hàng ────────────────────────────────────────────────────
        order_code = f"ORDER_{uuid.uuid4().hex[:8].upper()}"

        new_order = Order(
            order_code=order_code,
            user_id=current_user.id if current_user else None,
            shipping_method_id=order_data.shipping_method_id,
            payment_method_id=order_data.payment_method_id,
            coupon_id=resolved_coupon_id,
            coupon_code=resolved_coupon_code,
            receiver_name=receiver_name,
            receiver_phone=receiver_phone,
            receiver_email=receiver_email,
            status="pending",
            payment_status="unpaid",
            total_base_price=total_base_price,
            shipping_fee=shipping_fee,
            discount_amount=discount_amount,
            total_final=total_final,
            shipping_full_address=clean_required_text(
                order_data.shipping_full_address,
                max_length=1000,
                field_name="shipping_full_address",
            ),
            to_district_id=order_data.to_district_id,
            to_ward_code=clean_text(order_data.to_ward_code, max_length=20, field_name="to_ward_code"),
            note=clean_text(order_data.note, max_length=1000, field_name="note"),
            ghn_status="ready_to_pick",
        )
        db.add(new_order)
        db.flush()  # Lấy new_order.id tự sinh mà CHƯA COMMIT — đảm bảo ACID

        # ── 5. Lưu order items + Trừ tồn kho nguyên tử ───────────────────────
        for item in order_data.items:
            # Atomic UPDATE: WHERE stock >= qty, rowcount=0 → conflict → rollback
            stmt = (
                update(ProductVariant)
                .where(ProductVariant.id == item.variant_id)
                .where(ProductVariant.stock >= item.quantity)
                .values(stock=ProductVariant.stock - item.quantity)
            )
            result = db.execute(stmt)
            if result.rowcount == 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"Biến thể ID {item.variant_id} không đủ tồn kho",
                )

            order_item = OrderItem(
                order_id=new_order.id,
                variant_id=item.variant_id,
                quantity=item.quantity,
                price=variant_prices[item.variant_id],
                sku=variant_skus[item.variant_id],
            )
            db.add(order_item)

        # ── 6. Trừ lượt dùng coupon nguyên tử + ghi coupon usage ─────────────
        if resolved_coupon_id:
            stmt = (
                update(Coupon)
                .where(Coupon.id == resolved_coupon_id)
                .where(Coupon.quantity >= 1)
                .values(quantity=Coupon.quantity - 1)
            )
            result = db.execute(stmt)
            if result.rowcount == 0:
                raise HTTPException(status_code=409, detail="Mã giảm giá đã hết lượt sử dụng")

            if current_user:
                db.add(CouponUsage(
                    coupon_id=resolved_coupon_id,
                    user_id=current_user.id,
                    order_id=new_order.id,
                ))

        # ── 7. Xử lý affiliate referral ────────────────────────────────────────
        if affiliate_referral_code:
            referrer = resolve_referrer(db, affiliate_referral_code)
            buyer_id = current_user.id if current_user else None
            if referrer and referrer.id != buyer_id:
                affiliate_link_id = None
                if order_data.affiliate_link_id:
                    link = (
                        db.query(AffiliateLink)
                        .filter(
                            AffiliateLink.id == order_data.affiliate_link_id,
                            AffiliateLink.user_id == referrer.id,
                            AffiliateLink.status == "active",
                        )
                        .first()
                    )
                    if link:
                        affiliate_link_id = link.id

                product_rates = {
                    product_id: float(rate)
                    for product_id, rate in (
                        db.query(Product.id, Product.commission_rate)
                        .filter(Product.id.in_(set(variant_product_ids.values())))
                        .all()
                    )
                }
                commission_amount, commission_rate = calculate_weighted_commission(
                    [
                        (
                            variant_prices[variant_id],
                            quantity,
                            product_rates.get(variant_product_ids[variant_id], 0.0),
                        )
                        for variant_id, quantity in qty_map.items()
                    ],
                    total_base_price,
                )
                commission = AffiliateCommission(
                    order_id=new_order.id,
                    user_id=referrer.id,
                    affiliate_link_id=affiliate_link_id,
                    order_total=total_base_price,
                    commission_rate=commission_rate,
                    amount=commission_amount,
                    status="pending",
                    note=f"Auto-created from referral {affiliate_referral_code}",
                )
                affiliate_dashboard_user_id = referrer.id
                db.add(commission)
                db.flush()
                db.add(AffiliateConversion(
                    order_id=new_order.id,
                    referrer_user_id=referrer.id,
                    referred_user_id=buyer_id,
                    commission_id=commission.id,
                    attribution_type="code",
                ))

        # ── 8. Commit duy nhất 1 lần — đảm bảo ACID toàn luồng ───────────────
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Bạn đã sử dụng mã giảm giá này rồi hoặc đơn hàng bị xung đột dữ liệu. Vui lòng thử lại.",
            )

        # Tối ưu: dùng serialize_order() trực tiếp từ object đã flush — không cần
        # db.refresh() thêm 1 roundtrip SELECT. new_order.items có thể chưa được
        # load nên trả về dict cơ bản (items=[]) là đủ cho response tạo đơn.
        logger.info(
            "Đơn hàng mới được tạo: order_id=%s, order_code=%s, user_id=%s, total=%.0f",
            new_order.id, new_order.order_code,
            current_user.id if current_user else None,
            total_final,
        )

        # Invalidate cache vì tồn kho đã đổi
        home_products_cache.invalidate()
        product_cards_cache.invalidate()
        if affiliate_dashboard_user_id:
            _dashboard_cache_invalidate(affiliate_dashboard_user_id)

        return new_order

    except HTTPException as he:
        db.rollback()
        raise he
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Bạn đã sử dụng mã giảm giá này rồi hoặc đơn hàng bị xung đột dữ liệu. Vui lòng thử lại.",
        )
    except Exception as e:
        db.rollback()
        raise e


@router.patch("/{order_id}/cancel")
def cancel_my_order(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Người mua hủy đơn — chỉ cho phép khi status là pending hoặc confirmed.

    Tối ưu N+1 trong luồng hoàn trả stock: thay vì query ProductVariant riêng cho
    từng item trong vòng lặp (N queries), batch load tất cả variants cần hoàn trả
    bằng 1 query .in_() + with_for_update() vào dict, tra cứu O(1) trong vòng lặp
    — giảm từ N queries xuống 1 query.
    """
    try:
        # Khóa dòng đơn hàng bằng with_for_update() để tránh race condition
        order = (
            db.query(Order)
            .filter(Order.id == order_id, Order.user_id == current_user.id)
            .with_for_update(of=Order)
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")

        CANCELLABLE = {"pending", "confirmed"}
        if order.status not in CANCELLABLE:
            raise HTTPException(
                status_code=400,
                detail=f"Không thể hủy đơn hàng đang ở trạng thái '{order.status}'",
            )

        payment_method = db.query(PaymentMethod).filter(PaymentMethod.id == order.payment_method_id).first()
        payment_code = payment_method.code.strip().upper() if payment_method else ""

        refund_status = None
        if order.payment_status == "paid":
            if payment_code == "VNPAY":
                from app.modules.order.payment_service import initiate_full_refund
                from app.core.rate_limit import get_trusted_client_ip

                refund = initiate_full_refund(
                    db=db,
                    order_id=order.id,
                    admin_id=current_user.id,
                    reason="Khách hàng tự hủy đơn",
                    client_ip=get_trusted_client_ip(request),
                )
                refund_status = refund.status
                db.refresh(order)
            else:
                ensure_order_can_be_cancelled(order)

        # Hoàn lại stock: batch load tất cả variants cần hoàn trả bằng 1 query
        # với with_for_update() thay vì N queries riêng lẻ trong vòng lặp — giảm từ N xuống 1 query.
        items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
        variant_ids = [item.variant_id for item in items]
        if variant_ids:
            variants = (
                db.query(ProductVariant)
                .filter(ProductVariant.id.in_(variant_ids))
                .with_for_update()
                .all()
            )
            variant_map: dict[int, ProductVariant] = {v.id: v for v in variants}
            for item in items:
                variant = variant_map.get(item.variant_id)
                if variant:
                    variant.stock += item.quantity

        # Hoàn lại lượt dùng coupon (nếu có) — lock với with_for_update()
        if order.coupon_id:
            coupon = db.query(Coupon).filter(Coupon.id == order.coupon_id).with_for_update().first()
            if coupon:
                coupon.quantity += 1
            # Xóa coupon usage record
            db.query(CouponUsage).filter(
                CouponUsage.coupon_id == order.coupon_id,
                CouponUsage.order_id == order.id,
            ).delete()

        order.status = "cancelled"
        commission = db.query(AffiliateCommission).filter(AffiliateCommission.order_id == order.id).first()
        if commission:
            commission.status = "cancelled"

        db.commit()
        logger.info("Đơn hàng order_id=%s đã bị hủy bởi user_id=%s.", order.id, current_user.id)

        # Invalidate cache vì tồn kho đã hoàn lại
        home_products_cache.invalidate()
        product_cards_cache.invalidate()
        if commission:
            _dashboard_cache_invalidate(commission.user_id)

        return {
            "message": (
                "Đơn hàng đã được hủy; VNPay đang xử lý hoàn tiền."
                if refund_status == "pending"
                else "Đơn hàng đã được hủy thành công"
            ),
            "order_id": order.id,
            "status": "cancelled",
            "refund_status": refund_status,
        }

    except Exception as e:
        db.rollback()
        raise e


@router.get("/{order_id}/vnpay-url")
def get_vnpay_payment_url(
    order_id: int,
    request: Request,
    order_code: str | None = Query(None),
    contact: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
    _: None = Depends(guest_order_lookup_rate_limiter),
) -> dict:
    """Tạo URL thanh toán VNPay (Mock hoặc Sandbox/Thật) cho đơn hàng.

    Hỗ trợ cả người dùng đã đăng nhập (xác thực qua JWT) lẫn khách vãng lai
    (xác thực qua order_code + số điện thoại/email).
    """
    if not VNPAY_ENABLED:
        raise HTTPException(status_code=503, detail="VNPAY payment is disabled.")

    order = db.query(Order).filter(Order.id == order_id).with_for_update(of=Order).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    payment_method = db.query(PaymentMethod).filter(PaymentMethod.id == order.payment_method_id).first()
    if not payment_method or payment_method.code.strip().upper() != "VNPAY":
        raise HTTPException(status_code=400, detail="Order does not use VNPAY payment")

    if current_user:
        if order.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="You do not have permission to pay this order")
    else:
        normalized_code = (order_code or "").strip()
        normalized_contact = (contact or "").strip()
        normalized_contact_lower = normalized_contact.lower()
        contact_matches = (
            order.receiver_phone == normalized_contact
            or (order.receiver_email or "").lower() == normalized_contact_lower
        )
        if order.order_code != normalized_code or not contact_matches:
            raise HTTPException(status_code=403, detail="Order verification failed")

    if order.payment_status != "unpaid" or order.status in {"success", "cancelled"}:
        raise HTTPException(status_code=400, detail="Order is not payable")

    transaction = get_or_create_payment_transaction(db, order, get_trusted_client_ip(request))
    payment_url = (
        build_mock_payment_url(transaction, CUSTOMER_APP_URL)
        if VNPAY_MOCK_ENABLED
        else build_vnpay_payment_url(transaction, order)
    )
    db.commit()
    return {"payment_url": payment_url}


@router.get("/vnpay-return")
def vnpay_return(request: Request, db: Session = Depends(get_db)) -> Any:
    """Validate the browser callback and redirect without confirming payment."""
    from fastapi.responses import RedirectResponse
    from app.modules.order.payment_service import process_vnpay_return

    if not VNPAY_ENABLED:
        raise HTTPException(status_code=503, detail="VNPAY payment is disabled.")

    query_params = dict(request.query_params)
    _, order = process_vnpay_return(db, query_params)

    gateway_result = (
        "accepted"
        if query_params.get("vnp_ResponseCode") == "00" and query_params.get("vnp_TransactionStatus") == "00"
        else "failed"
    )
    contact_info = order.receiver_phone or order.receiver_email or ""
    return RedirectResponse(
        url=(
            f"{CUSTOMER_APP_URL}/order-lookup"
            f"?order_code={urllib.parse.quote(order.order_code)}"
            f"&contact={urllib.parse.quote(contact_info)}"
            f"&payment_result={gateway_result}"
        )
    )


@router.get("/vnpay-ipn")
def vnpay_ipn(request: Request, db: Session = Depends(get_db)) -> dict[str, str]:
    """Server-to-server VNPay notification. This is the payment source of truth."""
    if not VNPAY_ENABLED:
        return {"RspCode": "99", "Message": "Payment disabled"}
    return process_vnpay_ipn(db, dict(request.query_params))
