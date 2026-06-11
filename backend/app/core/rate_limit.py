"""
Module rate_limit: giới hạn tần suất request (rate limiting) theo IP cho các endpoint nhạy cảm.

Ư u tiên Redis (window counter algorithm) nếu có REDIS_URL — hoạt động đúng khi scale multi-process/multi-worker.
Nếu Redis không khả dụng, tự động fallback sang in-memory sliding window (chỉ phù hợp single-process).
"""
import logging
import os
import threading
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)
_REDIS_CLIENT = None
_REDIS_INIT_ATTEMPTED = False

try:
    import redis

    REDIS_AVAILABLE = True
except ImportError:
    redis = None
    REDIS_AVAILABLE = False


def _redis_is_required() -> bool:
    return os.getenv("REQUIRE_REDIS_RATE_LIMIT", "false").lower() in {"1", "true", "yes", "on"}


def get_trusted_client_ip(request: Request) -> str:
    """
    Lấy IP thực của client, hỗ trợ proxy header khi cấu hình TRUST_PROXY_HEADERS=true.

    Khi chạy sau reverse proxy (Nginx, Cloudflare...), IP gốc của client
    nằm trong header ``X-Forwarded-For`` hoặc ``X-Real-IP`` thay vì request.client.host.
    Chỉ tin tưởng các header này khi biến môi trường TRUST_PROXY_HEADERS=true được bật.

    Returns:
        Địa chỉ IP dạng chuỗi, hoặc "unknown" nếu không xác định được.
    """
    trust_proxy_headers = os.getenv("TRUST_PROXY_HEADERS", "false").lower() in {"1", "true", "yes", "on"}
    if trust_proxy_headers:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
    return request.client.host if request.client else "unknown"


def _get_redis_client():
    global _REDIS_CLIENT, _REDIS_INIT_ATTEMPTED
    if _REDIS_INIT_ATTEMPTED:
        if _redis_is_required() and _REDIS_CLIENT is None:
            raise RuntimeError("Redis rate limiting is required but Redis is unavailable.")
        return _REDIS_CLIENT
    _REDIS_INIT_ATTEMPTED = True

    redis_url = os.getenv("REDIS_URL")
    if REDIS_AVAILABLE and redis_url:
        try:
            _REDIS_CLIENT = redis.Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_timeout=0.5,
                socket_connect_timeout=0.5,
            )
            _REDIS_CLIENT.ping()
        except Exception as exc:
            if _redis_is_required():
                raise RuntimeError("Redis rate limiting is required but Redis is unavailable.") from exc
            logger.error("Redis rate limiter unavailable, using in-memory fallback: %s", exc)
            _REDIS_CLIENT = None
    elif _redis_is_required():
        raise RuntimeError("Redis rate limiting is required but REDIS_URL or redis package is unavailable.")
    else:
        logger.warning("Redis rate limiter is not configured. Falling back to per-process in-memory limits.")
    return _REDIS_CLIENT


def ensure_rate_limit_ready() -> None:
    """Verify Redis is reachable when production requires distributed limits."""
    if not _redis_is_required():
        return
    client = _get_redis_client()
    try:
        if client is None or not client.ping():
            raise RuntimeError("Redis rate limiting is required but Redis is unavailable.")
    except Exception as exc:
        raise RuntimeError("Redis rate limiting is required but Redis is unavailable.") from exc


class RedisRateLimiter:
    """
    Rate limiter theo thuật toán fixed-window counter, hỗ trợ Redis và in-memory fallback.

    Thuật toán Redis (fixed-window):
    - Mỗi window có một key Redis riêng: ``rate:<namespace>:<ip>:<path>:<window_id>``
    - ``window_id = int(time.time()) // window_seconds``
    - INCR atomic đảm bảo đếm chính xác khi có nhiều worker song song
    - Key tự động hết hạn sau ``window_seconds + 1`` giây

    Thuật toán fallback (sliding window in-memory):
    - Lưu danh sách timestamp các request trong cửa sổ [now - window_seconds, now]
    - Thread-safe bằng threading.Lock()
    """
    def __init__(self, requests_limit: int, window_seconds: int, *, namespace: str):
        self.requests_limit = requests_limit
        self.window_seconds = window_seconds
        self.namespace = namespace
        self.redis_url = os.getenv("REDIS_URL")
        self.client = _get_redis_client()
        self._fallback_records = defaultdict(list)
        self._fallback_lock = threading.Lock()

    def __call__(self, request: Request) -> None:
        identifier = get_trusted_client_ip(request)
        path = request.url.path
        if self.client:
            self._check_redis(identifier, path)
            return
        self._check_memory(identifier, path)

    def _key(self, identifier: str, _path: str, window_id: int) -> str:
        """Build a namespace-scoped key so changing a dynamic URL cannot bypass limits."""
        return f"rate:{self.namespace}:{identifier}:{window_id}"

    def _reject(self, retry_after: int) -> None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": str(max(1, retry_after))},
        )

    def _check_redis(self, identifier: str, path: str) -> None:
        now = int(time.time())
        window_id = now // self.window_seconds
        key = self._key(identifier, path, window_id)
        retry_after = self.window_seconds - (now % self.window_seconds)
        try:
            count = self.client.incr(key)
            if count == 1:
                self.client.expire(key, self.window_seconds + 1)
            if count > self.requests_limit:
                self._reject(retry_after)
        except HTTPException:
            raise
        except Exception as exc:
            if _redis_is_required():
                logger.error("Required Redis rate limiter unavailable: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Rate limiting service unavailable.",
                ) from exc
            logger.error("Redis rate limiter error, using in-memory fallback: %s", exc)
            self._check_memory(identifier, path)

    def _check_memory(self, identifier: str, _path: str) -> None:
        key = identifier
        now = time.time()
        with self._fallback_lock:
            self._fallback_records[key] = [
                recorded_at for recorded_at in self._fallback_records[key] if now - recorded_at < self.window_seconds
            ]
            if len(self._fallback_records[key]) >= self.requests_limit:
                retry_after = int(self.window_seconds - (now - self._fallback_records[key][0]))
                self._reject(retry_after)
            self._fallback_records[key].append(now)


login_rate_limiter = RedisRateLimiter(requests_limit=5, window_seconds=60, namespace="login")
register_rate_limiter = RedisRateLimiter(requests_limit=3, window_seconds=60, namespace="register")
guest_order_lookup_rate_limiter = RedisRateLimiter(requests_limit=10, window_seconds=60, namespace="guest_order_lookup")
guest_order_create_rate_limiter = RedisRateLimiter(requests_limit=5, window_seconds=300, namespace="guest_order_create")
newsletter_rate_limiter = RedisRateLimiter(requests_limit=5, window_seconds=300, namespace="newsletter")
affiliate_click_rate_limiter = RedisRateLimiter(requests_limit=60, window_seconds=60, namespace="affiliate_click")
shipping_fee_rate_limiter = RedisRateLimiter(requests_limit=30, window_seconds=60, namespace="shipping_fee")
chat_session_rate_limiter = RedisRateLimiter(requests_limit=10, window_seconds=300, namespace="chat_session")
chat_message_rate_limiter = RedisRateLimiter(requests_limit=30, window_seconds=60, namespace="chat_message")
chat_read_rate_limiter = RedisRateLimiter(requests_limit=60, window_seconds=60, namespace="chat_read")
chat_handoff_rate_limiter = RedisRateLimiter(requests_limit=5, window_seconds=300, namespace="chat_handoff")
