"""Gemini を用いたリスクアセスメント."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Optional

import pandas as pd

from backend.models.gemini_client import GeminiClient


class RiskAssessor:
    """社会的感度と法務リスクを Gemini で評価する."""

    def __init__(
        self,
        gemini_client: GeminiClient,
        *,
        social_case_path: Path,
        social_tag_path: Path,
        legal_reference_path: Path,
    ) -> None:
        self.gemini_client = gemini_client
        self.social_case_digest = self._load_excel_digest(social_case_path, "炎上事例")
        self.social_tag_digest = self._load_excel_digest(social_tag_path, "タグリスト")
        self.legal_digest = self._load_excel_digest(legal_reference_path, "法務リスト")

    async def assess(
        self,
        *,
        transcript: str,
        ocr_text: str,
        video_summary: Dict[str, object],
    ) -> Dict[str, object]:
        """Gemini にコンテキストを渡してリスク判定を取得."""

        video_segments_text = json.dumps(video_summary, ensure_ascii=False, indent=2)

        instruction = (
            "You are a compliance analyst for Japanese media content. "
            "Given the supplied transcript, OCR subtitles, and structured video summary, "
            "and the reference knowledge bases for social sentiment and legal guidelines, "
            "evaluate the risk from two perspectives: Social Sensitivity and Legal Compliance. "
            "Do not cite specific past case titles; instead, explain the core issue (themes or risk factors) "
            "that relate the current content to the historical examples. "
            "Return JSON using the schema:\n"
            "{\n"
            '  "social": {\n'
            '    "grade": "A|B|C|D|E",\n'
            '    "reason": "<Japanese explanation referencing the reference datasets and content>"\n'
            "  },\n"
            '  "legal": {\n'
            '    "grade": "適正|修正検討|要修正",\n'
            '    "reason": "<Japanese explanation referencing the legal list>",\n'
            '    "recommendations": "<Specific improvement proposals in Japanese>"\n'
            "  },\n"
            '  "matrix": {\n'
            '    "x_axis": "法務評価",\n'
            '    "y_axis": "社会的感度",\n'
            '    "position": [<xIndex 0-2>, <yIndex 0-4>]\n'
            "  }\n"
            "}\n"
            "Grades must strictly follow the enumerated values. "
            "Ensure `position` indexes correspond to the grade levels (0 best)."
        )

        content_blocks = (
            "## Transcript\n"
            f"{transcript[:5000]}\n\n"
            "## OCR\n"
            f"{ocr_text[:5000]}\n\n"
            "## Video Segments\n"
            f"{video_segments_text}\n\n"
            "## Social Sensitivity Cases Digest\n"
            f"{self.social_case_digest}\n\n"
            "## Social Tag List Digest\n"
            f"{self.social_tag_digest}\n\n"
            "## Legal Reference Digest\n"
            f"{self.legal_digest}\n"
        )

        response = await self.gemini_client.generate_structured_judgement(
            instruction, content_blocks
        )
        return response

    def _load_excel_digest(self, path: Path, label: str) -> str:
        """Excel の内容を簡潔なテキストに変換する."""

        if not path.exists():
            return f"{label}: 参照ファイルが見つかりません ({path})."

        df = pd.read_excel(path)
        preview_rows = df.head(20)
        return f"{label}:\n{preview_rows.to_csv(index=False)}"
