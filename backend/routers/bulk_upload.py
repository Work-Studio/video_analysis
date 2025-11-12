"""Bulk upload router for CSV batch upload."""

from __future__ import annotations

import csv
import io
import uuid
from pathlib import Path
from typing import List

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from backend.routers.auth import TokenData, get_current_user
from backend.store import ProjectStore
from backend.utils.media_utils import detect_media_type

router = APIRouter(prefix="/bulk", tags=["bulk_upload"])


class BulkUploadResult(BaseModel):
    success_count: int
    error_count: int
    errors: List[dict]
    project_ids: List[str]


def _sanitize_component(value: str, default: str) -> str:
    """ファイル名の安全なコンポーネントを生成する."""
    sanitized = (value or "").strip()
    if not sanitized:
        return default
    forbidden = set('<>:"\\|?*')
    sanitized = "".join("_" if ch in forbidden else ch for ch in sanitized)
    sanitized = sanitized.replace("/", "_")
    sanitized = sanitized.replace("\0", "")
    sanitized = sanitized[:120]
    return sanitized or default


@router.post("/upload-csv", response_model=BulkUploadResult)
async def bulk_upload_csv(
    csv_file: UploadFile = File(...),
    current_user: TokenData = Depends(get_current_user),
) -> BulkUploadResult:
    """
    Upload projects in bulk via CSV.

    CSV Format:
    company_name,product_name,title,file_path
    Company A,Product X,Campaign 1,/path/to/video1.mp4
    Company B,Product Y,Campaign 2,/path/to/video2.mp4
    """
    if not csv_file.filename or not csv_file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSVファイルをアップロードしてください",
        )

    # Read CSV content
    content = await csv_file.read()
    try:
        csv_content = content.decode("utf-8-sig")  # Handle BOM
    except UnicodeDecodeError:
        try:
            csv_content = content.decode("shift-jis")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CSVファイルのエンコーディングが不正です（UTF-8またはShift-JISを使用してください）",
            )

    # Parse CSV
    csv_reader = csv.DictReader(io.StringIO(csv_content))
    required_fields = {"company_name", "product_name", "title", "file_path"}

    if not csv_reader.fieldnames or not required_fields.issubset(set(csv_reader.fieldnames)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSVには以下のカラムが必要です: {', '.join(required_fields)}",
        )

    # Note: In a real implementation, you would:
    # 1. Validate file paths exist
    # 2. Copy files to upload directory
    # 3. Create projects in the store
    # 4. Link projects to user in database
    #
    # This is a placeholder implementation
    success_count = 0
    error_count = 0
    errors: List[dict] = []
    project_ids: List[str] = []

    for idx, row in enumerate(csv_reader, start=2):  # Start at 2 (header is row 1)
        try:
            company_name = row.get("company_name", "").strip()
            product_name = row.get("product_name", "").strip()
            title = row.get("title", "").strip()
            file_path_str = row.get("file_path", "").strip()

            if not all([company_name, product_name, title, file_path_str]):
                raise ValueError("すべてのフィールドを入力してください")

            file_path = Path(file_path_str)
            if not file_path.exists():
                raise ValueError(f"ファイルが見つかりません: {file_path_str}")

            project_id = uuid.uuid4().hex
            project_ids.append(project_id)
            success_count += 1

        except Exception as e:
            error_count += 1
            errors.append({"row": idx, "error": str(e), "data": row})

    return BulkUploadResult(
        success_count=success_count,
        error_count=error_count,
        errors=errors,
        project_ids=project_ids,
    )
