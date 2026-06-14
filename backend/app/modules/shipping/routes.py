import logging
import os
import threading
import time
from typing import List

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.rate_limit import shipping_fee_rate_limiter
from app.db.database import get_db
from app.modules.product.models import Product
from app.modules.product.variant_models import ProductVariant
from app.modules.shipping.schemas import ShippingFeeRequest, WardRequest

router = APIRouter()
logger = logging.getLogger("app.shipping")

load_dotenv()

GHN_API_URL = os.getenv("GHN_API_URL", "https://dev-online-gateway.ghn.vn/shiip/public-api").rstrip("/")
GHN_TOKEN = os.getenv("GHN_TOKEN")
GHN_SHOP_ID = os.getenv("GHN_SHOP_ID")

if not GHN_TOKEN:
    raise RuntimeError("GHN_TOKEN must be configured in .env")
if not GHN_SHOP_ID:
    raise RuntimeError("GHN_SHOP_ID must be configured in .env")

GHN_SHOP_DISTRICT_ID = int(os.getenv("GHN_SHOP_DISTRICT_ID", "1442"))
GHN_SHOP_WARD_CODE = os.getenv("GHN_SHOP_WARD_CODE", "20109").strip('"')


class CircuitBreaker:
    def __init__(self, name: str, failure_threshold: int = 5, recovery_timeout: float = 30.0):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.state = "CLOSED"
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
                    logger.warning("Circuit breaker %s entered HALF-OPEN state", self.name)
                    return True
                return False
            return True

    def record_success(self) -> None:
        with self.lock:
            self.state = "CLOSED"
            self.failure_count = 0
            self.last_state_change = time.time()

    def record_failure(self) -> None:
        with self.lock:
            self.failure_count += 1
            if self.state in ("CLOSED", "HALF-OPEN") and self.failure_count >= self.failure_threshold:
                self.state = "OPEN"
                self.last_state_change = time.time()
                logger.critical("Circuit breaker %s opened", self.name)


ghn_breaker = CircuitBreaker("GHN_API", failure_threshold=5, recovery_timeout=30.0)


def call_ghn_api(
    method: str,
    path: str,
    headers: dict | None = None,
    json_data: dict | None = None,
    params: dict | None = None,
) -> dict:
    """Call GHN with timeout and circuit-breaker protection."""
    if not ghn_breaker.allow_request():
        raise HTTPException(status_code=503, detail="GHN is temporarily unavailable. Please try again later.")

    url = f"{GHN_API_URL}{path}"
    request_headers = {"Token": GHN_TOKEN}
    if headers:
        request_headers.update(headers)

    started_at = time.time()
    try:
        if method.upper() == "POST":
            response = requests.post(url, headers=request_headers, json=json_data, params=params, timeout=5.0)
        else:
            response = requests.get(url, headers=request_headers, params=params, timeout=5.0)

        logger.info(
            "GHN API call method=%s path=%s status=%s latency=%.3fs",
            method,
            path,
            response.status_code,
            time.time() - started_at,
        )
        if response.status_code == 200:
            ghn_breaker.record_success()
            return response.json()

        ghn_breaker.record_failure()
        try:
            error_message = response.json().get("message", "GHN request failed")
        except Exception:
            error_message = response.text or "GHN request failed"
        raise HTTPException(status_code=response.status_code, detail=f"GHN: {error_message}")
    except requests.exceptions.Timeout as exc:
        ghn_breaker.record_failure()
        raise HTTPException(status_code=504, detail="GHN request timed out.") from exc
    except requests.exceptions.RequestException as exc:
        ghn_breaker.record_failure()
        raise HTTPException(status_code=502, detail="Could not connect to GHN.") from exc


@router.get("/provinces", dependencies=[Depends(shipping_fee_rate_limiter)])
def get_provinces() -> dict:
    return call_ghn_api("GET", "/master-data/province")


@router.get("/districts", dependencies=[Depends(shipping_fee_rate_limiter)])
def get_districts(province_id: int) -> dict:
    return call_ghn_api("GET", f"/master-data/district?province_id={province_id}")


@router.post("/wards", dependencies=[Depends(shipping_fee_rate_limiter)])
def get_wards(data: WardRequest) -> dict:
    return call_ghn_api("POST", "/master-data/ward", json_data={"district_id": data.district_id})


def build_ghn_fee_payload(request: ShippingFeeRequest, db: Session) -> dict:
    """Build a GHN fee payload from active variants and trusted dimensions."""
    variant_ids: List[int] = list({item.variant_id for item in request.items})
    variants_map: dict[int, ProductVariant] = {
        variant.id: variant
        for variant in (
            db.query(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .options(joinedload(ProductVariant.product))
            .filter(
                ProductVariant.id.in_(variant_ids),
                ProductVariant.status == 1,
                Product.status == 1,
                Product.deleted_at.is_(None),
            )
            .all()
        )
    }
    missing_ids = sorted(set(variant_ids) - set(variants_map))
    if missing_ids:
        raise HTTPException(status_code=400, detail=f"Invalid or inactive product variants: {missing_ids}")

    default_weight = 200
    default_length = 20
    default_width = 20
    default_height = 10
    total_weight = 0
    total_length = 0
    total_width = 0
    total_height = 0
    items_payload = []

    for item in request.items:
        variant = variants_map[item.variant_id]
        weight = variant.weight if variant.weight and variant.weight > 0 else default_weight
        length = variant.length if variant.length and variant.length > 0 else default_length
        width = variant.width if variant.width and variant.width > 0 else default_width
        height = variant.height if variant.height and variant.height > 0 else default_height
        name = variant.product.name if variant.product else f"Product {item.variant_id}"

        total_weight += weight * item.quantity
        total_height += height * item.quantity
        total_length = max(total_length, length)
        total_width = max(total_width, width)
        items_payload.append(
            {
                "name": name,
                "quantity": item.quantity,
                "height": height,
                "weight": weight,
                "length": length,
                "width": width,
            }
        )

    return {
        "from_district_id": GHN_SHOP_DISTRICT_ID,
        "from_ward_code": GHN_SHOP_WARD_CODE,
        "service_type_id": request.service_type_id,
        "to_district_id": request.to_district_id,
        "to_ward_code": request.to_ward_code,
        "height": total_height or default_height,
        "length": total_length or default_length,
        "weight": total_weight or default_weight,
        "width": total_width or default_width,
        "insurance_value": 0,
        "coupon": None,
        "items": items_payload,
    }


def request_ghn_shipping_fee(request: ShippingFeeRequest, db: Session) -> dict:
    payload = build_ghn_fee_payload(request, db)
    return call_ghn_api("POST", "/v2/shipping-order/fee", headers={"ShopId": GHN_SHOP_ID}, json_data=payload)


def calculate_ghn_shipping_fee(request: ShippingFeeRequest, db: Session) -> float:
    response = request_ghn_shipping_fee(request, db)
    try:
        fee = float(response["data"]["total"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="GHN returned an invalid shipping fee response") from exc
    if fee < 0:
        raise HTTPException(status_code=502, detail="GHN returned an invalid shipping fee")
    return fee


@router.post("/fee")
def get_shipping_fee(
    request: ShippingFeeRequest,
    db: Session = Depends(get_db),
    _: None = Depends(shipping_fee_rate_limiter),
) -> dict:
    return request_ghn_shipping_fee(request, db)
