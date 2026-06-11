"""
Module deps: cung cấp FastAPI dependency functions để xác thực và phân quyền người dùng.

Tất cả endpoints cần xác thực đều inject một trong các dependency sau:
- ``get_current_user``: người dùng đã đăng nhập (bất kỳ role nào)
- ``get_current_user_optional``: người dùng tùy chọn (None nếu chưa đăng nhập)
- ``get_current_admin``: bắt buộc role=1 (admin)
- ``get_current_shipper``: bắt buộc role=1 (admin) hoặc role=2 (shipper)
"""
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, SECRET_KEY
from app.db.database import get_db
from app.modules.user.models import TokenBlocklist, User

oauth2_scheme          = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def _credentials_exception() -> HTTPException:
    """Tạo HTTPException 401 chuẩn khi không xác thực được token."""
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def decode_token_payload(token: str) -> dict[str, Any]:
    """
    Giải mã và xác thực JWT token, trả về payload dict.

    Kiểm tra các claim bắt buộc: exp, iat, nbf, jti, sub.
    Kiểm tra audience nếu JWT_AUDIENCE được cấu hình.

    Args:
        token: JWT token dạng chuỗi.

    Returns:
        Payload dict đã giải mã.

    Raises:
        jwt.PyJWTError: Nếu token không hợp lệ, hết hạn hoặc bị giả mạo.
    """
    options = {"require": ["exp", "iat", "nbf", "jti", "sub"], "verify_aud": bool(JWT_AUDIENCE)}
    kwargs: dict[str, Any] = {
        "algorithms": [ALGORITHM],
        "issuer": JWT_ISSUER,
        "options": options,
        "leeway": 30,
    }
    if JWT_AUDIENCE:
        kwargs["audience"] = JWT_AUDIENCE
    return jwt.decode(token, SECRET_KEY, **kwargs)


def _load_user_from_payload(payload: dict[str, Any], db: Session) -> User:
    """
    Load User từ DB dựa vào JWT payload đã giải mã.

    Kiểm tra theo thứ tự:
    1. token_type phải là "access"
    2. sub và jti không được None
    3. jti không được nằm trong TokenBlocklist (token bị revoke)
    4. User phải tồn tại trong DB
    5. User phải có status=1 (không bị khóa)
    6. token_version phải khớp với user.token_version trong DB

    Args:
        payload: JWT payload dict đã được decode_token_payload() xác thực.
        db: SQLAlchemy Session.

    Returns:
        User object hợp lệ.

    Raises:
        HTTPException 401: Nếu bất kỳ bước kiểm tra nào thất bại.
        HTTPException 403: Nếu tài khoản bị khóa (status != 1).
    """
    if payload.get("token_type") != "access":
        raise _credentials_exception()

    user_id = payload.get("sub")
    jti     = payload.get("jti")
    if user_id is None or jti is None:
        raise _credentials_exception()

    revoked = db.query(TokenBlocklist.id).filter(TokenBlocklist.jti == jti).first()
    if revoked:
        raise _credentials_exception()

    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        raise _credentials_exception()

    user = db.query(User).filter(User.id == user_id_int).first()
    if user is None:
        raise _credentials_exception()
    if user.status != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been locked or disabled.",
        )

    token_version = int(payload.get("token_version", 0))
    if token_version != int(user.token_version or 0):
        raise _credentials_exception()

    return user


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency: trả về User đang đăng nhập, yêu cầu Bearer token hợp lệ.

    Raises:
        HTTPException 401: Nếu token không hợp lệ hoặc hết hạn.
        HTTPException 403: Nếu tài khoản bị khóa.
    """
    try:
        payload = decode_token_payload(token)
        return _load_user_from_payload(payload, db)
    except jwt.PyJWTError:
        raise _credentials_exception()


def get_current_user_optional(
    token: Annotated[str | None, Depends(optional_oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User | None:
    """
    FastAPI dependency: trả về User nếu có token hợp lệ, hoặc None nếu không có token.

    Dùng cho các endpoint hỗ trợ cả người dùng đã đăng nhập và khách (guest).
    Không raise exception — mọi lỗi xác thực đều trả về None.
    """
    if not token:
        return None
    try:
        payload = decode_token_payload(token)
        return _load_user_from_payload(payload, db)
    except (jwt.PyJWTError, HTTPException):
        return None


def get_current_admin(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency: trả về User với role=1 (Admin).

    Raises:
        HTTPException 401: Nếu token không hợp lệ.
        HTTPException 403: Nếu tài khoản bị khóa hoặc không phải Admin.
    """
    user = get_current_user(token, db)
    if user.role != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access the admin area.",
        )
    return user


def get_current_shipper(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency: trả về User với role=1 (Admin) hoặc role=2 (Shipper).

    Raises:
        HTTPException 401: Nếu token không hợp lệ.
        HTTPException 403: Nếu tài khoản bị khóa hoặc không có quyền shipper.
    """
    user = get_current_user(token, db)
    if user.role not in (1, 2):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access the shipper area.",
        )
    return user
