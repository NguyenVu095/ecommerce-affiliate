from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not any(c.isupper() for c in value):
            raise ValueError("Password must contain at least 1 uppercase letter.")
        if not any(c.islower() for c in value):
            raise ValueError("Password must contain at least 1 lowercase letter.")
        if not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least 1 digit.")
        return value


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class GoogleLogin(BaseModel):
    credential: str = Field(min_length=1, max_length=4096)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return UserCreate.validate_password(value)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=20)
    avatar: Optional[str] = Field(default=None, max_length=2048)


class UserAddressBase(BaseModel):
    receiver_name: str = Field(min_length=1, max_length=255)
    receiver_phone: str = Field(min_length=1, max_length=20)
    province_id: int = Field(gt=0)
    district_id: int = Field(gt=0)
    ward_id: str = Field(min_length=1, max_length=50)
    address_detail: str = Field(min_length=1, max_length=255)
    is_default: bool = False


class UserAddressCreate(UserAddressBase):
    pass


class UserAddressUpdate(UserAddressBase):
    pass


class UserAddressResponse(UserAddressBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    phone: Optional[str] = None
    avatar: Optional[str] = None
    role: int
    google_id: Optional[str] = None
    auth_provider: str
    referral_code: Optional[str] = None
    referred_by_id: Optional[int] = None
    addresses: list[UserAddressResponse] = []

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
