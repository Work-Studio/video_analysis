"""Apollo API を介した映像解析クライアント."""

from __future__ import annotations

import asyncio
import mimetypes
import os
from pathlib import Path
from typing import Dict, Optional

import httpx

DEFAULT_ENDPOINT = "https://api.apollo.example.com/v1/video/analyse"


class ApolloClient:
    """Apollo API を利用した映像解析クライアント."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint: Optional[str] = None,
        timeout: float = 120.0,
    ) -> None:
        self.api_key = api_key or os.getenv("APOLLO_API_KEY")
        self.endpoint = endpoint or os.getenv("APOLLO_API_URL", DEFAULT_ENDPOINT)
        self.timeout = timeout

    async def analyse_video(self, video_path: Path) -> Dict[str, str]:
        """映像の社会的感度や特徴量を分析する."""

        if not self.api_key or not self.endpoint:
            return {
                "summary": (
                    f"[stub] Social sensitivity analysis for {video_path.name}. "
                    "Provide APOLLO_API_KEY/APOLLO_API_URL for real analysis."
                ),
                "risk_flags": ["insight-unavailable"],
            }

        file_bytes = await asyncio.to_thread(video_path.read_bytes)
        mime_type, _ = mimetypes.guess_type(video_path.name)
        content_type = mime_type or "application/octet-stream"

        headers = {"Authorization": f"Bearer {self.api_key}"}
        files = {"file": (video_path.name, file_bytes, content_type)}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(self.endpoint, headers=headers, files=files)
            response.raise_for_status()
            payload = response.json()

        if isinstance(payload, dict):
            return payload

        raise RuntimeError("Apollo API から有効な映像解析結果が取得できませんでした。")
