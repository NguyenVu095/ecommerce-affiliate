"""
Module middleware: cung cấp Starlette middleware bảo mật HTTP headers.

SecurityHeadersMiddleware tự động thêm các header bảo mật phổ biến vào mọi response
để giảm thiểu các vector tấn công phổ biến (clickjacking, MIME sniffing, v.v.).
"""
import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
_DOCS_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware tự động thêm HTTP security headers vào mọi response.

    Headers được thêm (chỉ khi chưa có trong response gốc):
    - ``X-Content-Type-Options: nosniff`` — ngăn MIME type sniffing
    - ``X-Frame-Options: DENY`` — ngăn clickjacking qua iframe
    - ``Referrer-Policy: strict-origin-when-cross-origin`` — kiểm soát thông tin Referer
    - ``Permissions-Policy`` — từ chối quyền truy cập geolocation, microphone, camera
    - ``Content-Security-Policy`` — policy tối giản cho API (không serve HTML)
    - ``Cross-Origin-Resource-Policy: same-site`` — ngăn tải tài nguyên cross-origin
    - ``Strict-Transport-Security`` (tùy chọn) — chỉ thêm khi ENABLE_HSTS=true và request qua HTTPS

    Cấu hình:
        Đặt biến môi trường ``ENABLE_HSTS=true`` để bật HSTS header trên môi trường production HTTPS.
    """

    def __init__(self, app, *, enable_hsts: bool | None = None):
        """
        Args:
            app: ASGI application.
            enable_hsts: Bật/tắt HSTS header. Nếu None, đọc từ env var ENABLE_HSTS.
        """
        super().__init__(app)
        if enable_hsts is None:
            enable_hsts = os.getenv("ENABLE_HSTS", "false").lower() in {"1", "true", "yes", "on"}
        self.enable_hsts = enable_hsts

    async def dispatch(self, request: Request, call_next) -> Response:
        """Xử lý request và thêm security headers vào response."""
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        csp = _DOCS_CSP if request.url.path in {"/docs", "/redoc"} else _API_CSP
        response.headers.setdefault(
            "Content-Security-Policy",
            csp,
        )
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
        if self.enable_hsts and request.url.scheme == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response
