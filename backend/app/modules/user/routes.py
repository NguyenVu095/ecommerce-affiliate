import logging
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import decode_token_payload, get_current_user, oauth2_scheme
from app.core.rate_limit import login_rate_limiter, register_rate_limiter
from app.core.security import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, get_password_hash, verify_password
from app.core.validation import clean_required_text, clean_text, normalize_url
from app.db.database import get_db
from app.modules.user.models import TokenBlocklist, User, UserAddress
from app.modules.user.schemas import (
    PasswordChange,
    Token,
    UserAddressCreate,
    UserAddressResponse,
    UserAddressUpdate,
    UserCreate,
    UserLogin,
    UserResponse,
    UserUpdate,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _revoke_token(db: Session, token: str, user_id: int, reason: str) -> None:
    """Thu hồi token JWT bằng cách thêm JTI vào danh sách chặn (blocklist).

    Hàm helper nội bộ: giải mã token, kiểm tra JTI, ghi vào TokenBlocklist nếu
    chưa tồn tại. Không gọi db.commit() — người gọi chịu trách nhiệm commit.
    """
    try:
        payload = decode_token_payload(token)
    except jwt.PyJWTError:
        return
    jti = payload.get("jti")
    expires_at = payload.get("exp")
    if not jti or not expires_at:
        return
    expires_at_dt = datetime.fromtimestamp(int(expires_at), tz=timezone.utc).replace(tzinfo=None)
    exists = db.query(TokenBlocklist.id).filter(TokenBlocklist.jti == jti).first()
    if exists:
        return
    db.add(TokenBlocklist(jti=jti, user_id=user_id, expires_at=expires_at_dt, reason=reason))


@router.post("/register", response_model=UserResponse, dependencies=[Depends(register_rate_limiter)])
def register(user: UserCreate, db: Session = Depends(get_db)) -> UserResponse:
    """Đăng ký tài khoản người dùng mới.

    Tối ưu DB Transaction: dùng db.flush() để lấy ID tự sinh trong bộ nhớ
    thay vì db.commit() + db.refresh() (2 roundtrips) → chỉ 1 commit duy nhất,
    giảm Supabase network roundtrips từ 2 xuống 1.
    """
    email = user.email.lower().strip()
    db_user = db.query(User).filter(User.email == email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = get_password_hash(user.password)
    new_user = User(email=email, password=hashed_password, role=0)
    db.add(new_user)
    # Dùng flush() để đồng bộ trạng thái trong session và lấy ID tự sinh (autoincrement)
    # mà không phải commit xuống đĩa. Giữ tính ACID: rollback toàn bộ nếu có lỗi sau đây.
    db.flush()
    # Build response in-memory từ object đã được session track (đã có id sau flush)
    # trước khi commit, tránh 1 roundtrip db.refresh() thừa.
    response = UserResponse.model_validate(new_user)
    db.commit()
    logger.info("Người dùng mới đã đăng ký: user_id=%s, email=%s", new_user.id, email)
    return response


@router.post("/login", response_model=Token, dependencies=[Depends(login_rate_limiter)])
def login(user: UserLogin, db: Session = Depends(get_db)) -> Token:
    """Đăng nhập và cấp phát JWT access token.

    Kiểm tra email, mật khẩu và trạng thái tài khoản trước khi tạo token.
    """
    email = user.email.lower().strip()
    db_user = db.query(User).filter(User.email == email).first()
    if not db_user or not db_user.password or not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    if db_user.status != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been locked or disabled.",
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": str(db_user.id),
            "role": db_user.role,
            "token_version": int(db_user.token_version or 0),
        },
        expires_delta=access_token_expires,
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Đăng xuất và thu hồi token hiện tại vào danh sách chặn."""
    _revoke_token(db, token, current_user.id, "logout")
    db.commit()


@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    """Trả về thông tin hồ sơ của người dùng đang đăng nhập."""
    return current_user


@router.put("/me", response_model=UserResponse)
def update_user_me(
    user_in: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Cập nhật thông tin hồ sơ cá nhân (họ tên, số điện thoại, avatar).

    Tối ưu DB Transaction: loại bỏ db.refresh() dư thừa. Vì current_user là
    đối tượng đã được SQLAlchemy session theo dõi (identity map), sau db.commit()
    các thuộc tính vẫn giữ nguyên giá trị mới → không cần thêm 1 roundtrip SELECT.
    """
    if user_in.full_name is not None:
        current_user.full_name = clean_required_text(user_in.full_name, max_length=255, field_name="full_name")
    if user_in.phone is not None:
        current_user.phone = clean_text(user_in.phone, max_length=20, field_name="phone")
    if user_in.avatar is not None:
        current_user.avatar = normalize_url(user_in.avatar, max_length=2048, field_name="avatar")
    db.commit()
    # current_user vẫn được SQLAlchemy session track và phản ánh đúng giá trị
    # đã cập nhật — không cần db.refresh() thêm 1 roundtrip SELECT thừa.
    return current_user


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: PasswordChange,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Đổi mật khẩu và thu hồi token hiện tại, buộc đăng nhập lại.

    Tối ưu: thay datetime.utcnow() deprecated bằng datetime.now(timezone.utc)
    với timezone-aware để tương thích Python 3.12+.
    """
    if not current_user.password or not verify_password(body.current_password, current_user.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password = get_password_hash(body.new_password)
    # Sử dụng datetime.now(timezone.utc) thay cho datetime.utcnow() đã bị deprecated
    # từ Python 3.12 — trả về timezone-aware datetime rồi strip tzinfo để lưu vào DB naive column.
    current_user.password_changed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    current_user.token_version = int(current_user.token_version or 0) + 1
    _revoke_token(db, token, current_user.id, "password_change")
    db.commit()
    logger.info("Người dùng user_id=%s đã đổi mật khẩu thành công.", current_user.id)


@router.get("/me/addresses", response_model=list[UserAddressResponse])
def get_user_addresses(current_user: User = Depends(get_current_user)) -> list[UserAddress]:
    """Lấy danh sách địa chỉ giao hàng của người dùng hiện tại.

    Addresses được tải eager thông qua relationship đã định nghĩa trong User model
    (cascade load) nên không phát sinh thêm query N+1.
    """
    return current_user.addresses


@router.post("/me/addresses", response_model=UserAddressResponse)
def create_user_address(
    address_in: UserAddressCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserAddressResponse:
    """Tạo địa chỉ giao hàng mới cho người dùng hiện tại.

    Tối ưu DB Transaction: dùng db.flush() để lấy ID tự sinh mà không phải
    commit sớm, sau đó build response in-memory → chỉ 1 db.commit() duy nhất,
    giảm Supabase network roundtrips từ 2 xuống 1.
    """
    if address_in.is_default:
        for addr in current_user.addresses:
            addr.is_default = False

    new_address = UserAddress(
        user_id=current_user.id,
        receiver_name=clean_required_text(address_in.receiver_name, max_length=255, field_name="receiver_name"),
        receiver_phone=clean_required_text(address_in.receiver_phone, max_length=20, field_name="receiver_phone"),
        province_id=address_in.province_id,
        district_id=address_in.district_id,
        ward_id=clean_required_text(address_in.ward_id, max_length=50, field_name="ward_id"),
        address_detail=clean_required_text(address_in.address_detail, max_length=255, field_name="address_detail"),
        is_default=address_in.is_default,
    )
    db.add(new_address)
    # flush() đồng bộ trạng thái session với DB tạm thời để lấy autoincrement ID
    # mà không gây commit vật lý (Disk I/O). Đảm bảo tính ACID cho toàn transaction.
    db.flush()
    # Build response in-memory từ object đã có id sau flush — tránh db.refresh() thừa.
    response = UserAddressResponse.model_validate(new_address)
    db.commit()
    return response


@router.put("/me/addresses/{address_id}", response_model=UserAddressResponse)
def update_user_address(
    address_id: int,
    address_in: UserAddressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserAddressResponse:
    """Cập nhật địa chỉ giao hàng theo ID.

    Tối ưu DB Transaction: loại bỏ db.refresh() dư thừa. Vì address là đối
    tượng đã được SQLAlchemy session theo dõi, sau db.commit() các field đã
    cập nhật vẫn phản ánh đúng → không cần thêm 1 roundtrip SELECT.
    """
    address = db.query(UserAddress).filter(UserAddress.id == address_id, UserAddress.user_id == current_user.id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")

    if address_in.is_default and not address.is_default:
        for addr in current_user.addresses:
            addr.is_default = False

    address.receiver_name = clean_required_text(address_in.receiver_name, max_length=255, field_name="receiver_name")
    address.receiver_phone = clean_required_text(address_in.receiver_phone, max_length=20, field_name="receiver_phone")
    address.province_id = address_in.province_id
    address.district_id = address_in.district_id
    address.ward_id = clean_required_text(address_in.ward_id, max_length=50, field_name="ward_id")
    address.address_detail = clean_required_text(address_in.address_detail, max_length=255, field_name="address_detail")
    address.is_default = address_in.is_default

    db.commit()
    # address vẫn được SQLAlchemy session track và phản ánh đúng giá trị mới
    # đã cập nhật — không cần db.refresh() thêm 1 roundtrip SELECT thừa.
    return address


@router.delete("/me/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_address(
    address_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Xóa địa chỉ giao hàng theo ID.

    Bảo vệ nghiệp vụ: không được xóa địa chỉ mặc định — người dùng phải
    đặt địa chỉ khác làm mặc định trước khi xóa.
    """
    address = db.query(UserAddress).filter(UserAddress.id == address_id, UserAddress.user_id == current_user.id).first()
    if not address:
        raise HTTPException(status_code=404, detail="Address not found")

    if address.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete default address. Please set another address first.")

    db.delete(address)
    db.commit()
