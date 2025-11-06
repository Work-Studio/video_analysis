"""メディアタイプ判定ユーティリティ."""

from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Optional


def detect_media_type(content_type: Optional[str], filename: str) -> str:
    """コンテンツタイプから video/image を判定する."""

    if content_type:
        if content_type.startswith("image/"):
            return "image"
        if content_type.startswith("video/"):
            return "video"

    guessed, _ = mimetypes.guess_type(filename)
    if guessed and guessed.startswith("image/"):
        return "image"
    return "video"


def guess_mime_type(path: Path) -> str:
    """ファイルの MIME タイプを推測."""

    mime, _ = mimetypes.guess_type(path.name)
    return mime or "application/octet-stream"
