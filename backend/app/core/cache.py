"""
Module cache: cung cấp lớp RedisCache với fallback in-memory cho toàn bộ backend.

Ưu tiên Redis (nếu cấu hình REDIS_URL) để chia sẻ cache giữa nhiều worker/process.
Nếu Redis không khả dụng, tự động fallback sang in-memory dict (chỉ phù hợp single-process).
"""
import os
import json
import logging
import time
from typing import Any

logger = logging.getLogger(__name__)
_REDIS_CLIENT = None
_REDIS_INIT_ATTEMPTED = False

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("Redis package not installed. Running in fallback in-memory cache mode.")

# ─── Hằng số TTL (Time-To-Live) cho từng loại cache ─────────────────────────
# Đặt thành hằng số có tên rõ ràng thay vì magic number inline comment
# để dễ điều chỉnh và tránh nhầm lẫn khi có nhiều cache instance.
_TTL_CATEGORY_TREE        = 600  # 10 phút — cây danh mục ít thay đổi
_TTL_HOME_PRODUCTS        = 600  # 10 phút — sản phẩm trang chủ
_TTL_CATEGORY_DESCENDANTS = 600  # 10 phút — danh sách con của danh mục
_TTL_PRODUCT_CARDS        = 60   # 1 phút  — thẻ sản phẩm cần tươi hơn


def _get_redis_client(redis_url: str | None):
    """
    Khởi tạo Redis client một lần duy nhất (singleton pattern với cờ _REDIS_INIT_ATTEMPTED).
    Trả về client đã kết nối hoặc None nếu Redis không khả dụng.
    """
    global _REDIS_CLIENT, _REDIS_INIT_ATTEMPTED
    if _REDIS_INIT_ATTEMPTED:
        return _REDIS_CLIENT
    _REDIS_INIT_ATTEMPTED = True

    if REDIS_AVAILABLE and redis_url:
        try:
            _REDIS_CLIENT = redis.Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_timeout=0.5,
                socket_connect_timeout=0.5,
            )
            _REDIS_CLIENT.ping()
            logger.info("Redis cache initialized using %s", redis_url)
        except Exception as e:
            # Dùng %s format (lazy evaluation) thay vì f-string:
            # tránh build chuỗi không cần thiết khi log handler lọc bỏ ERROR.
            logger.error(
                "Failed to connect to Redis at %s: %s. Falling back to in-memory cache.",
                redis_url, e,
            )
            _REDIS_CLIENT = None
    elif REDIS_AVAILABLE and not redis_url:
        logger.warning("REDIS_URL env variable not set. Fallback to in-memory cache.")
    return _REDIS_CLIENT


class RedisCache:
    """
    Cache wrapper hỗ trợ cả Redis (phân tán) và in-memory dict (fallback single-process).

    Mọi key trong Redis đều được prefix bằng `cache:<key_prefix>` để tránh xung đột
    giữa các loại cache khác nhau trong cùng một Redis instance.
    """

    def __init__(self, key_prefix: str, ttl: int = 600, redis_url: str | None = None):
        """
        Khởi tạo cache instance.

        Args:
            key_prefix: Tiền tố dùng để nhóm các key liên quan (ví dụ: "category_tree").
            ttl: Thời gian sống của cache tính bằng giây (mặc định 600s = 10 phút).
            redis_url: URL kết nối Redis. Nếu None, đọc từ env var REDIS_URL.
        """
        self.key_prefix = key_prefix
        self.ttl = ttl
        self.redis_url = redis_url or os.getenv("REDIS_URL")
        self.client = None
        self._fallback_cache: dict[str, tuple[Any, float]] = {}  # key -> (value, expire_at)

        self.client = _get_redis_client(self.redis_url)

    def _get_key(self, key: str | None = None) -> str:
        """Tạo Redis key hoàn chỉnh từ prefix và sub-key tùy chọn."""
        if key:
            return f"cache:{self.key_prefix}:{key}"
        return f"cache:{self.key_prefix}"

    def get(self, key: str | None = None) -> Any:
        """
        Lấy dữ liệu từ cache.

        Thứ tự ưu tiên: Redis → in-memory fallback.
        Trả về None nếu không có cache hoặc cache đã hết hạn.
        """
        full_key = self._get_key(key)
        if self.client:
            try:
                data = self.client.get(full_key)
                if data is not None:
                    return json.loads(data)
            except Exception as e:
                # %s format: lazy evaluation, không build chuỗi khi không cần thiết
                logger.error("Redis get error for %s: %s. Using fallback cache.", full_key, e)

        # Fallback to in-memory — kiểm tra TTL thủ công
        if full_key in self._fallback_cache:
            val, expire_at = self._fallback_cache[full_key]
            if time.time() < expire_at:
                return val
            else:
                del self._fallback_cache[full_key]
        return None

    def set(self, data: Any, key: str | None = None) -> None:
        """
        Lưu dữ liệu vào cache với TTL.

        Ưu tiên ghi vào Redis; nếu lỗi, ghi vào in-memory fallback.
        """
        full_key = self._get_key(key)
        if self.client:
            try:
                self.client.setex(full_key, self.ttl, json.dumps(data))
                return
            except Exception as e:
                logger.error("Redis set error for %s: %s. Using fallback cache.", full_key, e)

        # Fallback to in-memory
        self._fallback_cache[full_key] = (data, time.time() + self.ttl)

    def invalidate(self, key: str | None = None) -> None:
        """
        Xóa cache theo key cụ thể hoặc toàn bộ cache của prefix này.

        Args:
            key: Nếu None, xóa tất cả key khớp prefix. Nếu có giá trị, chỉ xóa key đó.
        """
        if key:
            full_key = self._get_key(key)
            if self.client:
                try:
                    self.client.delete(full_key)
                except Exception as e:
                    logger.error("Redis delete error for %s: %s", full_key, e)
            if full_key in self._fallback_cache:
                del self._fallback_cache[full_key]
        else:
            # Xóa toàn bộ keys khớp prefix trong Redis
            prefix = self._get_key()
            if self.client:
                try:
                    keys = self.client.keys(f"{prefix}*")
                    if keys:
                        self.client.delete(*keys)
                except Exception as e:
                    logger.error("Redis delete pattern error for %s*: %s", prefix, e)

            # Xóa toàn bộ keys khớp prefix trong in-memory fallback
            keys_to_del = [k for k in self._fallback_cache if k.startswith(prefix)]
            for k in keys_to_del:
                del self._fallback_cache[k]


# ─── Cache instances dùng chung toàn bộ ứng dụng ────────────────────────────
# TTL dùng hằng số có tên thay vì magic number để dễ điều chỉnh tập trung.
category_cache             = RedisCache(key_prefix="category_tree",        ttl=_TTL_CATEGORY_TREE)
home_products_cache        = RedisCache(key_prefix="home_products",         ttl=_TTL_HOME_PRODUCTS)
category_descendants_cache = RedisCache(key_prefix="category_descendants",  ttl=_TTL_CATEGORY_DESCENDANTS)
product_cards_cache        = RedisCache(key_prefix="product_cards",         ttl=_TTL_PRODUCT_CARDS)
