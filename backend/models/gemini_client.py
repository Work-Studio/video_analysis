"""Gemini 2.5 Pro による OCR 抽出クライアント."""

from __future__ import annotations

import asyncio
import base64
import json
import mimetypes
import os
from pathlib import Path
from typing import Optional

import httpx

DEFAULT_MODEL = "gemini-2.0-flash-exp"
GEMINI_ENDPOINT_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)


class GeminiAPIError(RuntimeError):
    """Gemini API 呼び出し時のエラー."""


class GeminiClient:
    """Gemini API を利用して字幕テキストを抽出する."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 120.0,
    ) -> None:
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.model = model or os.getenv("GEMINI_OCR_MODEL", DEFAULT_MODEL)
        self.timeout = timeout

    async def run_step(
        self,
        name: str,
        media_path: Path,
        *,
        media_type: str = "video",
    ) -> object:
        """共通インターフェースで個別ステップを実行する."""

        normalized = name.lower()
        if normalized in {"transcription", "transcribe", "audio"}:
            return await self.transcribe_audio(media_path)
        if normalized in {"ocr", "subtitle", "text"}:
            return await self.extract_ocr(media_path)
        if normalized in {"visual", "video", "image"}:
            if media_type == "image":
                return await self.analyze_image(media_path)
            return await self.analyze_video_segments(media_path)
        raise ValueError(f"Unsupported analysis step: {name}")

    async def extract_ocr(self, video_path: Path) -> str:
        """動画を解析して字幕・注釈を抽出する."""

        if not self.api_key:
            return (
                f"[stub] OCR subtitles captured from {video_path.name}. "
                "Set GEMINI_API_KEY to enable OCR extraction."
            )

        try:
            payload_json = await self._invoke_gemini(
                video_path,
                instruction=(
                    "以下の動画または画像から画面内に表示されるテキストを漏れなく抽出してください。"
                    "タイトルや大きなテロップはもちろん、画面隅に表示される小さな注釈・脚注・免責事項・括弧内の補足・注釈番号(※)なども省略せずに含めてください。"
                    "改行を使って1行ずつ箇条書きで出力し、テキストが短くてもそのまま記載してください。"
                ),
            )
        except GeminiAPIError as exc:
            raise RuntimeError(f"Gemini OCR failed: {exc}") from exc

        candidates = payload_json.get("candidates") or []
        for candidate in candidates:
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            texts = [part.get("text", "") for part in parts if part.get("text")]
            if texts:
                return "\n".join(texts).strip()

        raise RuntimeError("Gemini API から有効な OCR テキストが取得できませんでした。")

    async def transcribe_audio(self, video_path: Path) -> str:
        """音声をテキスト化する."""

        if not self.api_key:
            return (
                f"[stub] Gemini transcription for {video_path.name}. "
                "Set GEMINI_API_KEY to enable transcription."
            )

        try:
            payload_json = await self._invoke_gemini(
                video_path,
                instruction=(
                    "音声または動画の中の会話やナレーションを正確に文字起こししてください。"
                    "聞き取れない部分は推測せずに [inaudible] と明記してください。"
                ),
            )
        except GeminiAPIError as exc:
            raise RuntimeError(f"Gemini transcription failed: {exc}") from exc

        candidates = payload_json.get("candidates") or []
        for candidate in candidates:
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            texts = [part.get("text", "") for part in parts if part.get("text")]
            if texts:
                return "\n".join(texts).strip()

        raise RuntimeError("Gemini API から文字起こし結果を取得できませんでした。")

    async def analyze_video_segments(self, video_path: Path) -> dict:
        """映像シーンを分析し、表現パターンごとにグルーピングした結果を返す."""

        if not self.api_key:
            return self._stub_video_segments(video_path)

        instruction = (
            "アップロードされた映像の主要なカットやシーンを分析し、"
            "同じ表現手法・演出パターンでまとめたグループを作成してください。"
            "JSON 形式で以下の構造に従って返答してください:\n"
            "{"
            '"summary": "<全体要約>",'
            '"segments": ['
            '{"label": "<表現パターン名>", "description": "<その表現の説明>", '
            '"shots": [{"timecode": "<開始〜終了>", "description": "<具体的な内容>"}]}'
            "]"
            "}\n"
            "timecode が正確でない場合はおおよその秒数表記でも構いません。"
        )
        try:
            payload_json = await self._invoke_gemini(
                video_path,
                instruction=instruction,
                response_mime_type="application/json",
            )
        except GeminiAPIError as exc:
            raise RuntimeError(f"Gemini video analysis failed: {exc}") from exc

        candidates = payload_json.get("candidates") or []
        for candidate in candidates:
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            for part in parts:
                text = part.get("text")
                if not text:
                    continue
                text = text.strip()
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    continue

        raise RuntimeError("Gemini API から映像解析結果を JSON 形式で取得できませんでした。")

    async def analyze_image(self, image_path: Path) -> dict:
        """静止画コンテンツの構図とリスク要素を分析する."""

        if not self.api_key:
            return {
                "summary": (
                    f"[stub] {image_path.name} の静止画解析結果。Gemini API を設定すると"
                    "構図や表現リスクに関する詳細な洞察が得られます。"
                ),
                "segments": [
                    {
                        "label": "静止画全体",
                        "description": "API キー未設定のため詳細解析は行われていません。",
                        "shots": [
                            {"timecode": "静止画", "description": "画像全景"},
                        ],
                    }
                ],
                "risk_flags": ["analysis-unavailable"],
            }

        instruction = (
            "提供された画像の構図・被写体・背景要素を分析し、"
            "社会的感度や法務リスクにつながり得る表現を特定してください。"
            "JSON 形式で以下の構造に従って返答してください:\n"
            "{"
            '"summary": "<全体要約>",' 
            '"segments": ['
            '{"label": "<注目領域>", "description": "<特徴説明>", '
            '"shots": [{"timecode": "静止画", "description": "<詳細>"}]}'
            "]"
            "}\n"
            "timecode には静止画である旨を必ず明記してください。"
        )

        try:
            payload_json = await self._invoke_gemini(
                image_path,
                instruction=instruction,
                response_mime_type="application/json",
            )
        except GeminiAPIError as exc:
            raise RuntimeError(f"Gemini image analysis failed: {exc}") from exc

        candidates = payload_json.get("candidates") or []
        for candidate in candidates:
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            for part in parts:
                text = part.get("text")
                if not text:
                    continue
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    continue

        raise RuntimeError("Gemini API から静止画解析結果を JSON 形式で取得できませんでした。")

    async def generate_text(self, prompt: str) -> str:
        """テキストプロンプトに対して通常のテキスト応答を生成する."""

        if not self.api_key:
            return "[stub] API キー未設定のためダミー応答です。"

        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ]
        }

        endpoint = GEMINI_ENDPOINT_TEMPLATE.format(model=self.model)
        params = {"key": self.api_key}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(endpoint, params=params, json=payload)
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                try:
                    error_detail = exc.response.json()
                except ValueError:
                    error_detail = exc.response.text
                raise GeminiAPIError(
                    f"{exc.response.status_code} {error_detail}"
                ) from exc

        payload_json = response.json()
        candidates = payload_json.get("candidates") or []
        for candidate in candidates:
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            for part in parts:
                text = part.get("text")
                if text:
                    return text

        raise RuntimeError("Gemini API からテキスト応答を取得できませんでした。")

    async def generate_structured_judgement(self, instruction: str, content: str) -> dict:
        """テキストのみを対象に JSON 形式の回答を生成する."""

        if not self.api_key:
            return {
                "social": {
                    "grade": "C",
                    "reason": "[stub] API キー未設定のためダミー評価です。",
                },
                "legal": {
                    "grade": "抵触する可能性がある",
                    "reason": "[stub] API キー未設定のためダミー評価です。",
                    "recommendations": "API キーを設定し、再度評価を実行してください。",
                    "violations": [],
                },
                "matrix": {"x_axis": "legal", "y_axis": "social", "position": [1, 2]},
                "tags": [],
            }

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": instruction},
                        {"text": content},
                    ]
                }
            ],
            "generation_config": {"response_mime_type": "application/json"},
        }

        endpoint = GEMINI_ENDPOINT_TEMPLATE.format(model=self.model)
        params = {"key": self.api_key}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(endpoint, params=params, json=payload)
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                try:
                    error_detail = exc.response.json()
                except ValueError:
                    error_detail = exc.response.text
                raise GeminiAPIError(
                    f"{exc.response.status_code} {error_detail}"
                ) from exc

        payload_json = response.json()
        candidates = payload_json.get("candidates") or []
        for candidate in candidates:
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            for part in parts:
                text = part.get("text")
                if not text:
                    continue
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    continue

        raise RuntimeError("Gemini API から JSON 形式の応答を取得できませんでした。")

    async def _invoke_gemini(
        self,
        video_path: Path,
        instruction: str,
        response_mime_type: Optional[str] = None,
    ) -> dict:
        """Gemini API を呼び出しレスポンス JSON を返す共通ヘルパー."""

        file_bytes = await asyncio.to_thread(video_path.read_bytes)
        mime_type, _ = mimetypes.guess_type(video_path.name)
        content_type = mime_type or "application/octet-stream"
        encoded_media = base64.b64encode(file_bytes).decode("utf-8")

        endpoint = GEMINI_ENDPOINT_TEMPLATE.format(model=self.model)
        params = {"key": self.api_key}
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": instruction},
                        {
                            "inline_data": {
                                "mime_type": content_type,
                                "data": encoded_media,
                            }
                        },
                    ]
                }
            ]
        }
        if response_mime_type:
            payload["generation_config"] = {"response_mime_type": response_mime_type}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(endpoint, params=params, json=payload)
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                try:
                    error_detail = exc.response.json()
                except ValueError:
                    error_detail = exc.response.text
                raise GeminiAPIError(
                    f"{exc.response.status_code} {error_detail}"
                ) from exc
            return response.json()

    def _stub_video_segments(self, video_path: Path) -> dict:
        """Gemini 連携が無い場合のダミー映像解析."""

        base_name = video_path.name
        return {
            "summary": (
                f"[stub] {base_name} の映像解析。Gemini の API キーを設定すると"
                "実際のカット分析結果が返却されます。"
            ),
            "segments": [
                {
                    "label": "イントロ／ブランド提示",
                    "description": "冒頭数秒でロゴやキャッチコピーを提示するシーン群。",
                    "shots": [
                        {"timecode": "00:00-00:05", "description": "ロゴのモーショングラフィックス"},
                        {"timecode": "00:05-00:08", "description": "ブランドメッセージのテキスト表示"},
                    ],
                },
                {
                    "label": "利用シーン紹介",
                    "description": "ユーザーがサービスを使う具体的なショットをまとめたグループ。",
                    "shots": [
                        {"timecode": "00:08-00:15", "description": "スマートフォン操作のクローズアップ"},
                        {"timecode": "00:15-00:22", "description": "空港でアプリ画面を確認する様子"},
                    ],
                },
                {
                    "label": "クロージング／CTA",
                    "description": "最後に行動喚起を促すカットをまとめたグループ。",
                    "shots": [
                        {"timecode": "00:22-00:27", "description": "アプリ画面と『今すぐダウンロード』テキスト"},
                    ],
                },
            ],
        }

    async def analyze_annotations(
        self,
        video_path: Path,
        ocr_text: str,
        transcript: str,
        video_summary: dict
    ) -> dict:
        """注釈の分析と不足している注釈の提案を行う."""

        if not self.api_key:
            return {
                "existing_annotations": [],
                "missing_annotations": []
            }

        # OCRテキストから※を含む文を抽出
        existing_annotations = []
        for line in ocr_text.split("\n"):
            if "※" in line or "注" in line or "＊" in line:
                existing_annotations.append(line.strip())

        instruction = f"""
以下の動画コンテンツを分析し、法的に必要な注釈や免責事項が不足していないかチェックしてください。

## 既に表示されている注釈
{chr(10).join(existing_annotations) if existing_annotations else "（なし）"}

## 音声文字起こし
{transcript[:2000]}

## OCR字幕抽出
{ocr_text[:2000]}

## 映像解析
{str(video_summary)[:1000]}

以下のJSON形式で回答してください：
{{
  "existing_annotations": [
    {{
      "text": "検出された注釈文",
      "purpose": "この注釈の目的・役割",
      "adequacy": "適切|不十分|不明確"
    }}
  ],
  "missing_annotations": [
    {{
      "suggested_text": "追加すべき注釈の文言",
      "reason": "なぜこの注釈が必要か",
      "severity": "必須|推奨|任意",
      "suggested_timecode": "表示すべきタイムコード（mm:ss形式）",
      "legal_basis": "根拠となる法律・規制（該当する場合）"
    }}
  ]
}}

注釈が必要となる可能性があるケース：
- 効果・効能の表示（個人の感想である旨）
- 価格表示（税込/税抜、期間限定など）
- 画像はイメージであること
- 撮影協力・許諾
- 使用条件・制約事項
- 景品・特典の条件
- サービス提供地域・対象の制限
"""

        try:
            response_text = await self.generate_text(instruction)
            # JSONをパース
            import json
            import re
            # コードブロックを除去
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                return result
            return {
                "existing_annotations": [],
                "missing_annotations": []
            }
        except Exception as e:
            print(f"注釈分析エラー: {e}")
            return {
                "existing_annotations": [],
                "missing_annotations": []
            }
