"""
Module security: xử lý mã hóa mật khẩu và tạo JWT access token.

Các hằng số cấu hình (SECRET_KEY, ALGORITHM, TTL, ...) được đọc từ biến môi trường
và được validate ngay khi module load để phát hiện lỗi cấu hình sớm nhất có thể.
"""
from datetime import datetime, timedelta, timezone
import os
import re
import uuid

import bcrypt
import jwt
from dotenv import load_dotenv

load_dotenv()

# ─── Cấu hình JWT ─────────────────────────────────────────────────────────────
KNOWN_WEAK_SECRETS = {
    "supersecretkey",
    "changeme",
    "change-me",
    "secret",
    "password",
    "admin@secure2026!",
    "affiliate@secure2026!",
}


def validate_secret_strength(secret: str | None, *, name: str, min_length: int = 32) -> str:
    """Validate application secrets and reject predictable or repeated values."""
    if not secret:
        raise RuntimeError(f"{name} must be configured.")
    normalized = secret.strip()
    if len(normalized) < min_length:
        raise RuntimeError(f"{name} must be at least {min_length} characters long.")
    if normalized.lower() in KNOWN_WEAK_SECRETS:
        raise RuntimeError(f"{name} must not use a known weak value.")
    if len(set(normalized)) < 10:
        raise RuntimeError(f"{name} must contain at least 10 distinct characters.")
    if re.fullmatch(r"(.{1,16})\1{2,}", normalized):
        raise RuntimeError(f"{name} must not contain a repeated pattern.")
    return normalized


SECRET_KEY = validate_secret_strength(os.getenv("SECRET_KEY"), name="SECRET_KEY")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", 60))
JWT_ISSUER   = os.getenv("JWT_ISSUER", "ecommerce-affiliate-api")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE")


def get_password_hash(password: str) -> str:
    """
    Băm mật khẩu plain-text bằng bcrypt với salt ngẫu nhiên.

    Args:
        password: Mật khẩu plain-text cần băm.

    Returns:
        Chuỗi bcrypt hash dạng UTF-8 (bắt đầu bằng $2b$).
    """
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(pwd_bytes, salt)
    return hashed_password.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    So sánh mật khẩu plain-text với bcrypt hash đã lưu.

    Args:
        plain_password: Mật khẩu người dùng nhập vào.
        hashed_password: Bcrypt hash lưu trong DB.

    Returns:
        True nếu khớp, False nếu sai mật khẩu.
    """
    pwd_bytes  = plain_password.encode("utf-8")
    hash_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(pwd_bytes, hash_bytes)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """
    Tạo JWT access token với các claim bảo mật chuẩn.

    Claims được thêm tự động:
    - ``exp``: thời điểm hết hạn
    - ``iat``: thời điểm phát hành
    - ``nbf``: không hợp lệ trước thời điểm này
    - ``jti``: ID duy nhất của token (dùng cho token revocation)
    - ``iss``: issuer
    - ``token_type``: luôn là "access" để phân biệt với refresh token

    Args:
        data: Payload bổ sung (ví dụ: ``{"sub": user_id, "token_version": 1}``).
        expires_delta: Thời gian sống của token. Mặc định dùng ACCESS_TOKEN_EXPIRE_MINUTES.

    Returns:
        JWT token dạng chuỗi đã ký bằng SECRET_KEY.
    """
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode = {
        **data,
        "exp": expire,
        "iat": now,
        "nbf": now,
        "jti": uuid.uuid4().hex,
        "iss": JWT_ISSUER,
        "token_type": "access",
    }
    if JWT_AUDIENCE:
        to_encode["aud"] = JWT_AUDIENCE
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
