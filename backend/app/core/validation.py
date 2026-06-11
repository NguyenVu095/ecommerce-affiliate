"""
Module validation: cung cấp các hàm tiện ích để làm sạch và xác thực dữ liệu đầu vào.

Tất cả hàm trong module này ném ``HTTPException 400`` ngay khi phát hiện dữ liệu không hợp lệ,
nên có thể gọi trực tiếp trong FastAPI route handler mà không cần try/except bổ sung.
"""
from __future__ import annotations

import base64
import binascii
import html
import re
from urllib.parse import urlparse

from fastapi import HTTPException

CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_IMAGE_DATA_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def clean_text(value: str | None, *, max_length: int, field_name: str = "value") -> str | None:
    """
    Làm sạch văn bản tùy chọn: xóa control chars, strip khoảng trắng, HTML-escape, kiểm tra độ dài.

    Args:
        value: Chuỗi đầu vào, có thể là None.
        max_length: Độ dài tối đa cho phép sau khi strip.
        field_name: Tên trường dùng trong thông báo lỗi.

    Returns:
        Chuỗi đã làm sạch và HTML-escaped, hoặc None nếu giá trị rỗng/None.

    Raises:
        HTTPException 400: Nếu độ dài vượt quá max_length.
    """
    if value is None:
        return None
    cleaned = CONTROL_CHARS_RE.sub("", value).strip()
    if not cleaned:
        return None
    if len(cleaned) > max_length:
        raise HTTPException(status_code=400, detail=f"{field_name} is too long")
    return html.escape(cleaned, quote=True)


def clean_required_text(value: str, *, max_length: int, field_name: str = "value") -> str:
    """
    Làm sạch văn bản bắt buộc: tương tự clean_text nhưng ném lỗi nếu giá trị rỗng.

    Args:
        value: Chuỗi đầu vào (không được None theo type hint).
        max_length: Độ dài tối đa cho phép.
        field_name: Tên trường dùng trong thông báo lỗi.

    Returns:
        Chuỗi đã làm sạch và HTML-escaped, đảm bảo không rỗng.

    Raises:
        HTTPException 400: Nếu giá trị rỗng sau khi strip, hoặc vượt max_length.
    """
    cleaned = clean_text(value, max_length=max_length, field_name=field_name)
    if cleaned is None:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    return cleaned


def normalize_public_code(value: str | None, *, max_length: int = 64, field_name: str = "code") -> str | None:
    """
    Chuẩn hóa mã công khai (coupon code, affiliate slug...): chỉ cho phép ký tự an toàn URL.

    Ký tự hợp lệ: ``[A-Za-z0-9_.:-]+`` — không cho phép khoảng trắng hoặc ký tự đặc biệt
    dễ gây nhầm lẫn khi truyền qua URL/query string.

    Args:
        value: Mã đầu vào, có thể là None.
        max_length: Độ dài tối đa (mặc định 64).
        field_name: Tên trường dùng trong thông báo lỗi.

    Returns:
        Mã đã được strip, hoặc None nếu giá trị rỗng/None.

    Raises:
        HTTPException 400: Nếu quá dài hoặc chứa ký tự không hợp lệ.
    """
    if value is None:
        return None
    cleaned = CONTROL_CHARS_RE.sub("", value).strip()
    if not cleaned:
        return None
    if len(cleaned) > max_length:
        raise HTTPException(status_code=400, detail=f"{field_name} is too long")
    if not re.fullmatch(r"[A-Za-z0-9_.:-]+", cleaned):
        raise HTTPException(status_code=400, detail=f"{field_name} contains invalid characters")
    return cleaned


def normalize_url(value: str | None, *, max_length: int = 2048, field_name: str = "url") -> str | None:
    """
    Xác thực và chuẩn hóa URL: chỉ chấp nhận scheme http hoặc https có netloc hợp lệ.

    Args:
        value: URL đầu vào, có thể là None.
        max_length: Độ dài tối đa URL (mặc định 2048).
        field_name: Tên trường dùng trong thông báo lỗi.

    Returns:
        URL đã làm sạch, hoặc None nếu giá trị rỗng/None.

    Raises:
        HTTPException 400: Nếu URL không hợp lệ, thiếu scheme, hoặc quá dài.
    """
    if value is None:
        return None
    cleaned = CONTROL_CHARS_RE.sub("", value).strip()
    if not cleaned:
        return None
    if len(cleaned) > max_length:
        raise HTTPException(status_code=400, detail=f"{field_name} is too long")
    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be an http(s) URL")
    return cleaned


def normalize_image_url_or_data(
    value: str,
    *,
    max_url_length: int = 2048,
    max_data_bytes: int = 1_000_000,
    field_name: str = "image",
) -> str:
    """
    Xác thực ảnh đầu vào: chấp nhận cả URL http(s) lẫn Data URI base64.

    Với Data URI:
    - Phải có dạng ``data:<mime>;base64,<encoded>``
    - MIME type phải thuộc ALLOWED_IMAGE_DATA_MIME_TYPES (jpeg, png, webp, gif)
    - Kích thước sau decode không được vượt max_data_bytes (mặc định 1MB)

    Với URL:
    - Phải là http(s) URL hợp lệ (dùng normalize_url)
    - Extension phải thuộc ALLOWED_IMAGE_EXTENSIONS nếu URL có path với dấu chấm

    Args:
        value: Chuỗi URL hoặc Data URI.
        max_url_length: Độ dài tối đa URL (mặc định 2048).
        max_data_bytes: Kích thước tối đa dữ liệu base64 sau decode (mặc định 1MB).
        field_name: Tên trường dùng trong thông báo lỗi.

    Returns:
        Chuỗi đầu vào đã được xác thực (URL hoặc Data URI).

    Raises:
        HTTPException 400: Nếu ảnh không hợp lệ, quá lớn hoặc sai định dạng.
    """
    cleaned = CONTROL_CHARS_RE.sub("", value).strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")

    if cleaned.startswith("data:"):
        header, sep, encoded = cleaned.partition(",")
        if sep != "," or ";base64" not in header:
            raise HTTPException(status_code=400, detail=f"{field_name} data URL must be base64 encoded")
        mime_type = header[5:].split(";", 1)[0].lower()
        if mime_type not in ALLOWED_IMAGE_DATA_MIME_TYPES:
            raise HTTPException(status_code=400, detail=f"{field_name} type is not allowed")
        try:
            decoded = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status_code=400, detail=f"{field_name} data is invalid")
        if len(decoded) > max_data_bytes:
            raise HTTPException(status_code=400, detail=f"{field_name} is too large")
        return cleaned

    normalized_url = normalize_url(cleaned, max_length=max_url_length, field_name=field_name)
    parsed = urlparse(normalized_url)
    path = parsed.path.lower()
    if "." in path and not any(path.endswith(ext) for ext in ALLOWED_IMAGE_EXTENSIONS):
        raise HTTPException(status_code=400, detail=f"{field_name} file type is not allowed")
    return normalized_url
