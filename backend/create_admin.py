"""Create initial admin user."""

from __future__ import annotations

import sys

from backend.auth import hash_password
from backend.database import get_db


def create_admin(email: str, password: str, company_name: str = "Creative Guard Admin") -> None:
    """Create admin user."""
    password_hash = hash_password(password)

    with get_db() as conn:
        cursor = conn.cursor()

        # Check if admin already exists
        cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
        if cursor.fetchone():
            print(f"User with email {email} already exists!")
            return

        cursor.execute(
            """
            INSERT INTO users (email, company_name, password_hash, is_admin, requires_password_change)
            VALUES (?, ?, ?, 1, 0)
            """,
            (email, company_name, password_hash),
        )
        conn.commit()
        user_id = cursor.lastrowid

    print(f"Admin user created successfully!")
    print(f"  ID: {user_id}")
    print(f"  Email: {email}")
    print(f"  Company: {company_name}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python -m backend.create_admin <email> <password>")
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]

    create_admin(email, password)
