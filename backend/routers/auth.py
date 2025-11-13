"""Authentication router."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr

from backend.auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from backend.database import get_db

router = APIRouter(prefix="/auth", tags=["authentication"])
security = HTTPBearer()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    requires_password_change: bool
    user_id: int
    email: str
    company_name: str
    is_admin: bool


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TokenData(BaseModel):
    user_id: int
    email: str
    is_admin: bool


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenData:
    """Get current authenticated user from JWT token."""
    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return TokenData(
        user_id=payload.get("user_id"),
        email=payload.get("email"),
        is_admin=payload.get("is_admin", False),
    )


def require_admin(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """Require admin privileges."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest) -> LoginResponse:
    """Authenticate user and return access token."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, email, company_name, password_hash, is_admin, requires_password_change
            FROM users
            WHERE email = ?
            """,
            (request.email,),
        )
        user = cursor.fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(request.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token(
        data={
            "user_id": user["id"],
            "email": user["email"],
            "is_admin": bool(user["is_admin"]),
        }
    )

    return LoginResponse(
        access_token=access_token,
        requires_password_change=bool(user["requires_password_change"]),
        user_id=user["id"],
        email=user["email"],
        company_name=user["company_name"],
        is_admin=bool(user["is_admin"]),
    )


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: TokenData = Depends(get_current_user),
) -> dict:
    """Change user password."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT password_hash FROM users WHERE id = ?",
            (current_user.user_id,),
        )
        user = cursor.fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not verify_password(request.current_password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    new_password_hash = hash_password(request.new_password)

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE users
            SET password_hash = ?, requires_password_change = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (new_password_hash, current_user.user_id),
        )
        conn.commit()

    return {"message": "Password changed successfully"}


@router.get("/me", response_model=LoginResponse)
async def get_current_user_info(
    current_user: TokenData = Depends(get_current_user),
) -> LoginResponse:
    """Get current user information."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, email, company_name, is_admin, requires_password_change
            FROM users
            WHERE id = ?
            """,
            (current_user.user_id,),
        )
        user = cursor.fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Generate a new token for response
    access_token = create_access_token(
        data={
            "user_id": user["id"],
            "email": user["email"],
            "is_admin": bool(user["is_admin"]),
        }
    )

    return LoginResponse(
        access_token=access_token,
        requires_password_change=bool(user["requires_password_change"]),
        user_id=user["id"],
        email=user["email"],
        company_name=user["company_name"],
        is_admin=bool(user["is_admin"]),
    )
