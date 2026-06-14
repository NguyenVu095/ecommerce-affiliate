"""
Script seed dữ liệu ban đầu cho database dự án Ecommerce Affiliate.
Hỗ trợ làm sạch các bảng và nạp dữ liệu mẫu bao gồm:
- Phương thức thanh toán & vận chuyển
- Tài khoản Admin
- Danh mục 3 cấp (Nam, Nữ, Phụ kiện)
- Sản phẩm & Biến thể sản phẩm tương ứng
- Mã giảm giá (Coupons)
- Tài khoản Affiliate Test và các bản ghi hoa hồng mẫu phục vụ thử nghiệm.
"""

import os
import random
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Thiết lập sys.path để có thể chạy script từ mọi vị trí
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Đảm bảo hiển thị tiếng Việt chính xác trên console Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

# Cấu hình Database URL
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
if not SQLALCHEMY_DATABASE_URL:
    print("LỖI: Chưa cấu hình biến môi trường DATABASE_URL trong tệp .env")
    sys.exit(1)

# Import các models của dự án để nạp dữ liệu mẫu
from app.core.security import get_password_hash, validate_secret_strength
from app.modules.affiliate.models import AffiliateCommission
from app.modules.category.models import Category
from app.modules.coupon.models import Coupon
from app.modules.order.models import Order, OrderItem, PaymentMethod, ShippingMethod
from app.modules.product.models import Product
from app.modules.product.variant_models import ProductVariant
from app.modules.user.models import User

SEED_ADMIN_PASSWORD = validate_secret_strength(
    os.getenv("SEED_ADMIN_PASSWORD"),
    name="SEED_ADMIN_PASSWORD",
    min_length=12,
)
SEED_AFFILIATE_PASSWORD = validate_secret_strength(
    os.getenv("SEED_AFFILIATE_PASSWORD"),
    name="SEED_AFFILIATE_PASSWORD",
    min_length=12,
)

# Khởi tạo engine và session kết nối Database
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def seed_data() -> None:
    """
    Thực hiện xóa toàn bộ dữ liệu cũ và nạp lại dữ liệu mẫu vào database.
    """
    db = SessionLocal()
    try:
        # 1. Làm sạch database (Cascade Truncate các bảng chính)
        print("--- Đang làm sạch database ---")
        db.execute(text("""
            TRUNCATE TABLE 
            order_status_history, order_items, orders, 
            shipping_methods, payment_methods,
            product_variants, products, categories, 
            coupons, user_addresses, users 
            RESTART IDENTITY CASCADE;
        """))
        db.commit()

        # 2. Tạo Phương thức Thanh toán & Vận chuyển mẫu
        print("--- Tạo phương thức thanh toán & vận chuyển ---")
        p_methods = [
            PaymentMethod(name="Thanh toán khi nhận hàng (COD)", code="COD", description="Thanh toán trực tiếp khi nhận hàng", status=1),
            PaymentMethod(name="Cổng thanh toán VNPay", code="VNPAY", description="Thanh toán trực tuyến qua cổng VNPay", status=1),
            PaymentMethod(name="Ví điện tử MoMo", code="MOMO", description="Thanh toán qua ứng dụng MoMo", status=1),
        ]
        db.add_all(p_methods)
        
        s_methods = [
            ShippingMethod(name="Giao Hàng Nhanh (GHN)", cost=30000, estimated_delivery="2-4 ngày", status=1, service_id=53320, service_type_id=2),
            ShippingMethod(name="Giao Hàng Tiết Kiệm (GHTK)", cost=25000, estimated_delivery="3-5 ngày", status=1),
            ShippingMethod(name="Hỏa tốc (Grab/Ahamove)", cost=50000, estimated_delivery="Trong ngày", status=1),
        ]
        db.add_all(s_methods)
        db.commit()

        # 3. Tạo User Admin mặc định
        print("--- Tạo tài khoản Admin ---")
        admin_pw = SEED_ADMIN_PASSWORD
        admin = User(
            full_name="Quản trị viên",
            email="admin@gmail.com",
            password=get_password_hash(admin_pw),
            role=1,
            status=1,
            referral_code="ADMIN123"
        )
        db.add(admin)
        db.commit()

        # 4. Tạo Cây Danh Mục (3 Cấp)
        cats: dict[str, int] = {}

        def add_c(name: str, slug: str, parent_id: int | None = None) -> Category:
            """
            Hàm phụ trợ tạo mới danh mục và lưu lại ánh xạ ID trong bộ nhớ.
            """
            c = Category(name=name, slug=slug, parent_id=parent_id, status=1)
            db.add(c)
            db.commit()
            db.refresh(c)
            cats[slug] = c.id
            return c

        # Danh mục cấp gốc (Root)
        c_nam = add_c("Nam", "nam")
        c_nu = add_c("Nữ", "nu")
        c_pk = add_c("Phụ kiện", "phu-kien")

        # Nam -> Cấp 1
        a_nam = add_c("Áo Nam", "ao-nam", c_nam.id)
        q_nam = add_c("Quần Nam", "quan-nam", c_nam.id)
        g_nam = add_c("Giày Nam", "giay-nam", c_nam.id)

        # Áo Nam -> Cấp 2
        add_c("Áo thun Nam", "ao-thun-nam", a_nam.id)
        add_c("Áo sơ mi Nam", "ao-so-mi-nam", a_nam.id)
        add_c("Áo khoác Nam", "ao-khoac-nam", a_nam.id)
        add_c("Áo len & Hoodie", "ao-len-hoodie-nam", a_nam.id)

        # Quần Nam -> Cấp 2
        add_c("Quần Jean Nam", "jean-nam", q_nam.id)
        add_c("Quần Kaki Nam", "kaki-nam", q_nam.id)
        add_c("Quần Short Nam", "short-nam", q_nam.id)
        add_c("Quần Tây Nam", "quan-tay-nam", q_nam.id)

        # Giày Nam -> Cấp 2
        add_c("Sneaker Nam", "sneaker-nam", g_nam.id)
        add_c("Giày Tây Nam", "giay-tay-nam", g_nam.id)

        # Nữ -> Cấp 1
        a_nu = add_c("Áo Nữ", "ao-nu", c_nu.id)
        q_nu = add_c("Quần & Váy Nữ", "quan-vay-nu", c_nu.id)
        g_nu = add_c("Giày Nữ", "giay-nu", c_nu.id)

        # Áo Nữ -> Cấp 2
        add_c("Áo thun Nữ", "ao-thun-nu", a_nu.id)
        add_c("Áo sơ mi Nữ", "ao-so-mi-nu", a_nu.id)
        add_c("Áo khoác / Blazer", "blazer-nu", a_nu.id)
        add_c("Váy / Đầm", "vay-dam-nu", a_nu.id)

        # Quần Nữ -> Cấp 2
        add_c("Quần Jean Nữ", "jean-nu", q_nu.id)
        add_c("Chân váy", "chan-vay", q_nu.id)

        # Phụ kiện -> Cấp 1
        add_c("Mũ / Nón", "mu-non", c_pk.id)
        add_c("Kính mắt", "kinh-mat", c_pk.id)
        add_c("Thắt lưng", "that-lung", c_pk.id)
        add_c("Túi xách & Balo", "tui-balo", c_pk.id)
        add_c("Trang sức", "trang-suc", c_pk.id)

        print(f"--- Đã tạo {len(cats)} danh mục ---")

        # 5. Danh sách Sản Phẩm Mẫu
        p_data = [
            {
                "name": "Áo Thun Cotton Basic",
                "slug": "ao-thun-cotton-basic",
                "cat": "ao-thun-nam",
                "gender": 0,
                "price": 190000,
                "img": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab",
                "variants": [("M", "Trắng"), ("L", "Trắng"), ("M", "Đen"), ("L", "Đen")]
            },
            {
                "name": "Áo Polo Pique Pro",
                "slug": "ao-polo-pique-pro",
                "cat": "ao-thun-nam",
                "gender": 0,
                "price": 290000,
                "img": "https://images.unsplash.com/photo-1581655353564-df123a1eb820",
                "variants": [("M", "Xanh Navy"), ("L", "Xanh Navy"), ("XL", "Xanh Navy"), ("M", "Trắng")]
            },
            {
                "name": "Áo Thun In Graphic Streetwear",
                "slug": "ao-thun-graphic-street",
                "cat": "ao-thun-nam",
                "gender": 2,
                "price": 350000,
                "img": "https://images.unsplash.com/photo-1576566588028-4147f3842f27",
                "variants": [("Freesize", "Đen"), ("Freesize", "Trắng")]
            },
            {
                "name": "Sơ Mi Oxford Trắng Công Sở",
                "slug": "so-mi-oxford-white",
                "cat": "ao-so-mi-nam",
                "gender": 0,
                "price": 450000,
                "img": "https://images.unsplash.com/photo-1596755094514-f87e34085b2c",
                "variants": [("M", "Trắng"), ("L", "Trắng"), ("XL", "Trắng")]
            },
            {
                "name": "Áo Khoác Bomber Maverick",
                "slug": "bomber-maverick",
                "cat": "ao-khoac-nam",
                "gender": 0,
                "price": 650000,
                "img": "https://images.unsplash.com/photo-1591047139829-d91aecb6caea",
                "variants": [("L", "Đen"), ("XL", "Đen"), ("L", "Xanh Rêu")]
            },
            {
                "name": "Quần Jean Slim Fit 501",
                "slug": "jean-slim-fit-501",
                "cat": "jean-nam",
                "gender": 0,
                "price": 550000,
                "img": "https://images.unsplash.com/photo-1542272604-787c3835535d",
                "variants": [("30", "Xanh"), ("31", "Xanh"), ("32", "Xanh")]
            },
            {
                "name": "Sneaker Air Max Style",
                "slug": "sneaker-air-max",
                "cat": "sneaker-nam",
                "gender": 2,
                "price": 950000,
                "img": "https://images.unsplash.com/photo-1542291026-7eec264c27ff",
                "variants": [("40", "Đỏ"), ("41", "Đỏ"), ("42", "Đỏ")]
            },
            {
                "name": "Váy Maxi Đi Biển",
                "slug": "vay-maxi-beach",
                "cat": "vay-dam-nu",
                "gender": 1,
                "price": 450000,
                "img": "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1",
                "variants": [("S", "Hoa Vàng"), ("M", "Hoa Vàng")]
            },
            {
                "name": "Mũ Lưỡi Trai NY",
                "slug": "cap-ny-style",
                "cat": "mu-non",
                "gender": 2,
                "price": 150000,
                "img": "https://images.unsplash.com/photo-1588850561407-ed78c282e89b",
                "variants": [("Freesize", "Đen"), ("Freesize", "Trắng")]
            },
            {
                "name": "Thắt Lưng Da Bò Ý",
                "slug": "leather-belt-italy",
                "cat": "that-lung",
                "gender": 0,
                "price": 550000,
                "img": "https://images.unsplash.com/photo-1624222247344-550fb8ec5021",
                "variants": [("110cm", "Nâu"), ("120cm", "Đen")]
            },
        ]

        # 6. Lưu sản phẩm & các biến thể vào DB
        print("--- Lưu sản phẩm & biến thể (kèm thông số GHN) ---")
        for p in p_data:
            cat_id = cats.get(p["cat"])
            if not cat_id:
                continue

            thumb = p["img"] + "?q=80&w=800&auto=format&fit=crop"

            product = Product(
                name=p["name"],
                slug=p["slug"],
                category_id=cat_id,
                gender=p["gender"],
                description=f"Đây là mô tả chi tiết cho sản phẩm {p['name']}. Chất liệu cao cấp, thiết kế hiện đại, phù hợp nhiều hoàn cảnh.",
                base_price=p["price"],
                thumbnail=thumb,
                status=1
            )
            db.add(product)
            db.commit()
            db.refresh(product)

            for attr_val in p["variants"]:
                v_size, v_color = attr_val
                s_price = int(p["price"] * 0.85) if random.random() > 0.7 else None
                
                variant = ProductVariant(
                    product_id=product.id,
                    sku=f"{p['slug'].upper()}-{v_color.upper()}-{v_size.upper()}-{random.randint(100,999)}",
                    attributes={"size": v_size, "color": v_color},
                    price=p["price"],
                    sale_price=s_price,
                    stock=random.randint(10, 100),
                    image_url=thumb,
                    weight=random.randint(200, 1000),   # gam
                    length=random.randint(10, 30),     # cm
                    width=random.randint(10, 20),      # cm
                    height=random.randint(5, 15),      # cm
                    status=1
                )
                db.add(variant)
            db.commit()

        # 7. Coupons mẫu
        print("--- Tạo mã giảm giá ---")
        coupons = [
            Coupon(
                code="LUXURY2024",
                type="percent",
                value=15,
                min_order=500000,
                quantity=50,
                expired_at=datetime.now(timezone.utc) + timedelta(days=90)
            ),
            Coupon(
                code="FREESHIPMAX",
                type="fixed",
                value=40000,
                min_order=200000,
                quantity=500,
                expired_at=datetime.now(timezone.utc) + timedelta(days=180)
            ),
        ]
        db.add_all(coupons)
        db.commit()

        # 8. Tạo User Affiliate Test mẫu và hoa hồng mẫu phục vụ phát triển
        print("--- Tạo user Affiliate Test và số dư mẫu ---")
        affiliate_pw = SEED_AFFILIATE_PASSWORD
        affiliate_user = User(
            full_name="Affiliate Test User",
            email="affiliate_test@gmail.com",
            password=get_password_hash(affiliate_pw),
            role=0,
            status=1,
            referral_code="AFFILIATE_TEST_CODE"
        )
        db.add(affiliate_user)
        db.commit()
        db.refresh(affiliate_user)

        # Tạo một đơn hàng thành công mẫu để liên kết với hoa hồng
        test_order = Order(
            order_code="TEST_ORDER_FOR_COMMISSION",
            shipping_method_id=1,
            payment_method_id=1,
            receiver_name="Khách Hàng Mẫu",
            receiver_phone="0912345678",
            receiver_email="customer_test@gmail.com",
            status="success",
            payment_status="paid",
            total_base_price=5000000,
            shipping_fee=30000,
            discount_amount=0,
            total_final=5030000,
            shipping_full_address="Hà Nội"
        )
        db.add(test_order)
        db.commit()
        db.refresh(test_order)

        # Tạo commission trạng thái approved trị giá 1,000,000đ cho affiliate test
        commission = AffiliateCommission(
            order_id=test_order.id,
            user_id=affiliate_user.id,
            order_total=5000000,
            commission_rate=20.00,
            amount=1000000,
            status="approved"
        )
        db.add(commission)
        db.commit()

        print("\n>>> SEED DỮ LIỆU HOÀN TẤT <<<")

    except Exception as e:
        db.rollback()
        print(f"Lỗi khi thực hiện seed dữ liệu: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_data()
