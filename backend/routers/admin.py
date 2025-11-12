"""Admin router for user management."""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from backend.auth import generate_random_password, hash_password
from backend.database import get_db
from backend.routers.auth import TokenData, require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


class CreateUserRequest(BaseModel):
    email: EmailStr
    company_name: str


class CreateUserResponse(BaseModel):
    user_id: int
    email: str
    company_name: str
    initial_password: str


class UserInfo(BaseModel):
    id: int
    email: str
    company_name: str
    is_admin: bool
    requires_password_change: bool
    created_at: str


@router.post("/users", response_model=CreateUserResponse)
async def create_user(
    request: CreateUserRequest,
    admin_user: TokenData = Depends(require_admin),
) -> CreateUserResponse:
    """Create a new user (admin only)."""
    # Check if user already exists
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE email = ?", (request.email,))
        existing_user = cursor.fetchone()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )

    # Generate random password
    initial_password = generate_random_password()
    password_hash = hash_password(initial_password)

    # Create user
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO users (email, company_name, password_hash, is_admin, requires_password_change)
            VALUES (?, ?, ?, 0, 1)
            """,
            (request.email, request.company_name, password_hash),
        )
        conn.commit()
        user_id = cursor.lastrowid

    return CreateUserResponse(
        user_id=user_id,
        email=request.email,
        company_name=request.company_name,
        initial_password=initial_password,
    )


@router.get("/users", response_model=List[UserInfo])
async def list_users(
    admin_user: TokenData = Depends(require_admin),
) -> List[UserInfo]:
    """List all users (admin only)."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, email, company_name, is_admin, requires_password_change, created_at
            FROM users
            ORDER BY created_at DESC
            """
        )
        users = cursor.fetchall()

    return [
        UserInfo(
            id=user["id"],
            email=user["email"],
            company_name=user["company_name"],
            is_admin=bool(user["is_admin"]),
            requires_password_change=bool(user["requires_password_change"]),
            created_at=user["created_at"],
        )
        for user in users
    ]


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin_user: TokenData = Depends(require_admin),
) -> dict:
    """Delete a user (admin only)."""
    # Prevent deleting yourself
    if user_id == admin_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself",
        )

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()

    return {"message": "User deleted successfully"}


class ArchiveItem(BaseModel):
    company_name: str
    product_name: str
    title: str
    project_id: str
    archived_at: str
    path: str


@router.get("/archives", response_model=List[ArchiveItem])
async def list_archives(
    admin_user: TokenData = Depends(require_admin),
) -> List[ArchiveItem]:
    """List all archived projects (admin only)."""
    base_dir = Path(__file__).resolve().parent.parent
    archive_base = base_dir / "admin_archive"

    if not archive_base.exists():
        return []

    archives: List[ArchiveItem] = []

    # admin_archive/{会社名}/{商品名}/{タイトル}_{timestamp}/
    for company_dir in archive_base.iterdir():
        if not company_dir.is_dir():
            continue
        company_name = company_dir.name

        for product_dir in company_dir.iterdir():
            if not product_dir.is_dir():
                continue
            product_name = product_dir.name

            for project_dir in product_dir.iterdir():
                if not project_dir.is_dir():
                    continue

                metadata_file = project_dir / "metadata.json"
                if metadata_file.exists():
                    try:
                        import json
                        with open(metadata_file, "r", encoding="utf-8") as f:
                            metadata = json.load(f)

                        archives.append(
                            ArchiveItem(
                                company_name=company_name,
                                product_name=product_name,
                                title=metadata.get("title", project_dir.name),
                                project_id=metadata.get("project_id", "unknown"),
                                archived_at=metadata.get("archived_at", "unknown"),
                                path=str(project_dir.relative_to(archive_base)),
                            )
                        )
                    except Exception as e:
                        print(f"Failed to read metadata from {metadata_file}: {e}")

    # Sort by archived_at descending
    archives.sort(key=lambda x: x.archived_at, reverse=True)
    return archives
