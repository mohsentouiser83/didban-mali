from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=12, max_length=128)
    workspace_name: str | None = Field(default=None, min_length=2, max_length=160)

    @field_validator("full_name", "workspace_name")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class LoginRequest(BaseModel):
    email: EmailStr | Literal["admin"]
    password: str = Field(min_length=1, max_length=128)
    otp_code: str | None = Field(default=None, max_length=10)


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str
    mfa_enabled: bool = False


class AuthResponse(BaseModel):
    user: UserResponse
    csrf_token: str


class MessageResponse(BaseModel):
    message: str


class MfaSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class MfaEnableRequest(BaseModel):
    secret: str
    code: str = Field(min_length=6, max_length=6)


class MfaDisableRequest(BaseModel):
    password: str = Field(min_length=1)
    code: str = Field(min_length=6, max_length=6)


class MfaStatusResponse(BaseModel):
    enabled: bool
