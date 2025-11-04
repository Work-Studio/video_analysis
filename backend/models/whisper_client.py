"""Whisper API へのアクセスを抽象化するクライアント."""

from __future__ import annotations

import asyncio
import mimetypes
import os
from pathlib import Path
from typing import Optional

import httpx

DEFAULT_MODEL = "whisper-1"
WHISPER_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions"


class WhisperClient:
    """Whisper API を利用して音声文字起こしを取得する."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 120.0,
    ) -> None:
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("OPENAI_WHISPER_MODEL", DEFAULT_MODEL)
        self.timeout = timeout

    async def transcribe_audio(self, video_path: Path) -> str:
        """動画ファイルから音声文字起こしを実施する."""

        if not self.api_key:
            # API キーが無い場合はスタブ文字列を返す
            return (
                f"[stub] Whisper transcription for {video_path.name}. "
                "Set OPENAI_API_KEY to enable real transcription."
            )

        file_bytes = await asyncio.to_thread(video_path.read_bytes)
        mime_type, _ = mimetypes.guess_type(video_path.name)
        content_type = mime_type or "application/octet-stream"

        headers = {"Authorization": f"Bearer {self.api_key}"}
        data = {"model": self.model}
        files = {"file": (video_path.name, file_bytes, content_type)}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                WHISPER_ENDPOINT, headers=headers, data=data, files=files
            )
            response.raise_for_status()
            payload = response.json()

        # Whisper のレスポンスは text フィールドに文字起こし結果を含む
        text = payload.get("text")
        if text:
            return text

        # 念のため delta 形式のレスポンスもフォールバックで処理
        if "results" in payload:
            return " ".join(result.get("text", "") for result in payload["results"])

        raise RuntimeError("Whisper API から有効な文字起こし結果が取得できませんでした。")
