import os
import requests
import time
import logging
import threading
from typing import List
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.rate_limit import shipping_fee_rate_limiter
from app.modules.shipping.schemas import ShippingFeeRequest, WardRequest
from app.modules.product.variant_models import ProductVariant

router = APIRouter()
logger = logging.getLogger("app.shipping")

load_dotenv()

GHN_API_URL = os.getenv("GHN_API_URL", "https://dev-online-gateway.ghn.vn/shiip/public-api")
GHN_TOKEN   = os.getenv("GHN_TOKEN")
GHN_SHOP_ID = os.getenv("GHN_SHOP_ID")

if not GHN_TOKEN:
    raise RuntimeError("GHN_TOKEN must be configured in .env")
if not GHN_SHOP_ID:
    raise RuntimeError("GHN_SHOP_ID must be configured in .env")

GHN_SHOP_DISTRICT_ID = int(os.getenv("GHN_SHOP_DISTRICT_ID", "1442"))
GHN_SHOP_WARD_CODE   = os.getenv("GHN_SHOP_WARD_CODE", "20109").strip('"')


# --- Circuit Breaker Pattern ---
class CircuitBreaker:
    """
    Mẫu thiết kế Circuit Breaker bảo vệ hệ thống khỏi cascade failure
    khi GHN API liên tục gặp sự cố. Tự động chuyển về HALF-OPEN sau recovery_timeout giây.
    """
    def __init__(self, name: str, failure_threshold: int = 5, recovery_timeout: float = 30.0):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.state = "CLOSED"  # CLOSED, OPEN, HALF-OPEN
        self.failure_count = 0
        self.last_state_change = time.time()
        self.lock = threading.Lock()

    def allow_request(self) -> bool:
        with self.lock:
            now = time.time()
            if self.state == "OPEN":
                if now - self.last_state_change > self.recovery_timeout:
                    self.state = "HALF-OPEN"
                    self.last_state_change = now
                    logger.warning(f"Circuit Breaker '{self.name}' entered HALF-OPEN state. Testing connection.")
                    return True
                return False
            return True

    def record_success(self) -> None:
        with self.lock:
            if self.state in ("OPEN", "HALF-OPEN"):
                logger.info(f"Circuit Breaker '{self.name}' recovered to CLOSED state.")
            self.state = "CLOSED"
            self.failure_count = 0
            self.last_state_change = time.time()

    def record_failure(self) -> None:
        with self.lock:
            self.failure_count += 1
            now = time.time()
            logger.error(f"Circuit Breaker '{self.name}' registered failure ({self.failure_count}/{self.failure_threshold}).")
            if self.state in ("CLOSED", "HALF-OPEN") and self.failure_count >= self.failure_threshold:
                self.state = "OPEN"
                self.last_state_change = now
                logger.critical(f"Circuit Breaker '{self.name}' tripped to OPEN. Fail-fast active.")


ghn_breaker = CircuitBreaker("GHN_API", failure_threshold=5, recovery_timeout=30.0)


def call_ghn_api(method: str, path: str, headers: dict = None, json_data: dict = None, params: dict = None) -> dict:
    """Gọi GHN API có bảo vệ bởi Circuit Breaker và ghi log latency."""
    if not ghn_breaker.allow_request():
        logger.warning("GHN API blocked by Circuit Breaker (OPEN state).")
        raise HTTPException(
            status_code=503,
            detail="Kết nối đến đối tác Giao Hàng Nhanh (GHN) tạm thời bị gián đoạn do sự cố hệ thống phía đối tác. Vui lòng thử lại sau."
        )

    url = f"{GHN_API_URL}{path}"
    req_headers = {"Token": GHN_TOKEN}
    if headers:
        req_headers.update(headers)

    start_time = time.time()
    try:
        if method.upper() == "POST":
            response = requests.post(url, headers=req_headers, json=json_data, params=params, timeout=5.0)
        else:
            response = requests.get(url, headers=req_headers, params=params, timeout=5.0)

        latency = time.time() - start_time
        logger.info(f"GHN API call - {method} {path} - Status: {response.status_code} - Latency: {latency:.3f}s")

        if response.status_code == 200:
            ghn_breaker.record_success()
            return response.json()
        else:
            ghn_breaker.record_failure()
            try:
                err_msg = response.json().get("message", "Failed from GHN API")
            except Exception:
                err_msg = response.text or "Failed from GHN API"
            raise HTTPException(status_code=response.status_code, detail=f"GHN: {err_msg}")

    except requests.exceptions.Timeout as e:
        ghn_breaker.record_failure()
        logger.error(f"GHN API timeout: {method} {path} - {e}")
        raise HTTPException(status_code=504, detail="Kết nối đến đối tác GHN bị quá hạn (Timeout).")
    except requests.exceptions.RequestException as e:
        ghn_breaker.record_failure()
        logger.error(f"GHN API connection error: {method} {path} - {e}")
        raise HTTPException(status_code=502, detail="Không thể kết nối đến đối tác GHN.")


@router.get("/provinces")
def get_provinces() -> dict:
    """Lấy danh sách tỉnh/thành phố từ GHN."""
    return call_ghn_api("GET", "/master-data/province")


@router.get("/districts")
def get_districts(province_id: int) -> dict:
    """Lấy danh sách quận/huyện theo tỉnh từ GHN."""
    return call_ghn_api("GET", f"/master-data/district?province_id={province_id}")


@router.post("/wards")
def get_wards(data: WardRequest) -> dict:
    """Lấy danh sách phường/xã theo quận/huyện từ GHN."""
    return call_ghn_api("POST", "/master-data/ward", json_data={"district_id": data.district_id})


@router.post("/fee")
def get_shipping_fee(
    request: ShippingFeeRequest,
    db: Session = Depends(get_db),
    _: None = Depends(shipping_fee_rate_limiter),
) -> dict:
    """
    Tính phí vận chuyển GHN dựa trên danh sách sản phẩm trong giỏ hàng.

    Tối ưu N+1 Query:
    - Cũ: Vòng lặp N items → mỗi item gọi 1 query riêng lẻ = N queries.
    - Mới: Batch load toàn bộ N variants bằng 1 query duy nhất với `.in_()`,
      lưu vào dict để tra cứu O(1) trong vòng lặp build payload = 1 query duy nhất.
    """
    # Batch load toàn bộ variants cần thiết bằng 1 query duy nhất (loại bỏ N+1)
    variant_ids: List[int] = [item.variant_id for item in request.items]
    variants_map: dict[int, ProductVariant] = {
        v.id: v
        for v in db.query(ProductVariant).filter(ProductVariant.id.in_(variant_ids)).all()
    }

    total_weight = 0
    total_length = 0
    total_width  = 0
    total_height = 0
    items_payload = []

    # Giá trị mặc định khi không có thông số thực tế của sản phẩm
    DEFAULT_WEIGHT = 200
    DEFAULT_LENGTH = 20
    DEFAULT_WIDTH  = 20
    DEFAULT_HEIGHT = 10

    for item in request.items:
        # Tra cứu O(1) từ dict thay vì query DB trong vòng lặp
        variant = variants_map.get(item.variant_id)

        weight = DEFAULT_WEIGHT
        length = DEFAULT_LENGTH
        width  = DEFAULT_WIDTH
        height = DEFAULT_HEIGHT
        name   = f"Sản phẩm {item.variant_id}"

        if variant:
            if variant.weight and variant.weight > 0: weight = variant.weight
            if variant.length and variant.length > 0: length = variant.length
            if variant.width  and variant.width  > 0: width  = variant.width
            if variant.height and variant.height > 0: height = variant.height
            if variant.product and variant.product.name:
                name = variant.product.name

        total_weight += weight * item.quantity
        total_height += height * item.quantity
        total_length  = max(total_length, length)
        total_width   = max(total_width,  width)

        items_payload.append({
            "name":     name,
            "quantity": item.quantity,
            "height":   height,
            "weight":   weight,
            "length":   length,
            "width":    width,
        })

    # Fallback về giá trị mặc định nếu không có item nào có kích thước
    if total_weight == 0: total_weight = DEFAULT_WEIGHT
    if total_length == 0: total_length = DEFAULT_LENGTH
    if total_width  == 0: total_width  = DEFAULT_WIDTH
    if total_height == 0: total_height = DEFAULT_HEIGHT

    payload = {
        "from_district_id": GHN_SHOP_DISTRICT_ID,
        "from_ward_code":   GHN_SHOP_WARD_CODE,
        "service_type_id":  request.service_type_id,
        "to_district_id":   request.to_district_id,
        "to_ward_code":     request.to_ward_code,
        "height":  total_height,
        "length":  total_length,
        "weight":  total_weight,
        "width":   total_width,
        "insurance_value": 0,
        "coupon":  None,
        "items":   items_payload,
    }

    return call_ghn_api("POST", "/v2/shipping-order/fee", headers={"ShopId": GHN_SHOP_ID}, json_data=payload)
