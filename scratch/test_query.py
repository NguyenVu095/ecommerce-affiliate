import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "backend"))

from dotenv import load_dotenv
load_dotenv()

# Import all models to configure registries
from app.modules.user.models import TokenBlocklist, User, UserAddress
from app.modules.product.models import Product
from app.modules.product.variant_models import ProductVariant
from app.modules.product.review_models import ProductReview
from app.modules.category.models import Category
from app.modules.coupon.models import Coupon, CouponUsage
from app.modules.order.models import (
    Order,
    OrderItem,
    OrderStatusHistory,
    PaymentGatewayEvent,
    PaymentMethod,
    PaymentRefund,
    PaymentTransaction,
    ShippingMethod,
)

from app.db.database import SessionLocal

db = SessionLocal()
try:
    print("Testing with_for_update(of=Order)...")
    order = db.query(Order).filter(Order.id == 8).with_for_update(of=Order).first()
    if order:
        print("Success! Order found:", order.order_code)
    else:
        print("Success! No order with id=8, but query ran successfully.")
except Exception as e:
    print("Failed with exception:")
    import traceback
    traceback.print_exc()
finally:
    db.close()
