"""分析パイプラインの調停ロジック."""

import json
from pathlib import Path
from typing import Optional

import aiofiles

from backend.models.gemini_client import GeminiClient
from backend.models.risk_assessor import RiskAssessor
from backend.store import (
    PROJECT_STEPS,
    PipelineAlreadyRunningError,
    ProjectNotFoundError,
    ProjectStore,
)
from backend.utils.logging_utils import setup_logger


class AnalysisPipeline:
    """動画分析の各ステップを順次実行する."""

    def __init__(
        self,
        *,
        store: ProjectStore,
        gemini_client: GeminiClient,
        risk_assessor: RiskAssessor,
        logger_name: str = "analysis_pipeline",
    ) -> None:
        self.store = store
        self.gemini_client = gemini_client
        self.risk_assessor = risk_assessor
        self.logger = setup_logger(logger_name)

    async def run(self, project_id: str) -> None:
        """パイプラインを実行するエントリポイント."""

        try:
            await self.store.mark_pipeline_started(project_id)
        except PipelineAlreadyRunningError:
            # 既にステータス更新済みであればそのまま継続
            self.logger.info("Pipeline already running for project %s", project_id)
        except ProjectNotFoundError:
            self.logger.warning("Project %s not found. Abort pipeline.", project_id)
            return

        try:
            project = await self.store.get_project(project_id)
            video_path = Path(project.video_path)

            workspace_dir = Path(project.workspace_dir)

            media_type = project.media_type

            (
                transcript,
                transcript_path,
                transcript_source,
                transcript_note,
            ) = await self._run_transcription(
                project_id, video_path, workspace_dir, media_type
            )
            ocr_text, ocr_path, ocr_note = await self._run_ocr(project_id, video_path, workspace_dir)
            video_result, video_path_json, video_note = await self._run_visual_analysis(
                project_id, video_path, workspace_dir, media_type
            )
            risk_result, risk_path = await self._run_risk(
                project_id,
                transcript,
                ocr_text,
                video_result,
                workspace_dir,
            )
            final_report = self._build_final_report(
                transcript,
                ocr_text,
                video_result,
                transcript_path,
                ocr_path,
                video_path_json,
                risk_path,
                risk_result,
                transcript_source,
                transcript_note,
                ocr_note,
                video_note,
            )

            await self.store.mark_pipeline_completed(project_id, final_report)
            self.logger.info("Pipeline completed for project %s", project_id)
        except Exception as exc:  # pylint: disable=broad-except
            # エラー時はステータスを failed にしてログを残す
            self.logger.exception("Pipeline execution failed for %s", project_id)
            await self.store.mark_pipeline_failed(project_id, str(exc))
            raise

    async def _run_transcription(
        self, project_id: str, media_path: Path, workspace_dir: Path, media_type: str
    ) -> tuple[str, Path, str, Optional[str]]:
        """音声文字起こしステップ."""

        step = PROJECT_STEPS[0]
        await self.store.mark_step_running(project_id, step)
        transcript_source = "gemini"
        transcript_note: Optional[str] = None
        if media_type == "image":
            self.logger.info("Skipping transcription for %s (image asset).", project_id)
            transcript = ""
            transcript_source = "skipped"
            transcript_note = "静止画コンテンツのため音声文字起こしをスキップしました。"
            formatted = "🗣️ 音声文字起こし\n静止画コンテンツのため音声文字起こしは実施しません。"
            transcript_path = await self._save_text_file(
                workspace_dir,
                "transcription.txt",
                "静止画コンテンツのため音声文字起こしは実施しません。",
            )
        else:
            try:
                transcript = await self.gemini_client.transcribe_audio(media_path)
            except Exception as gemini_error:
                self.logger.warning(
                    "Gemini transcription failed for %s: %s",
                    project_id,
                    gemini_error,
                )
                transcript = (
                    "文字起こしを実行できませんでした。音声が確認できないため、"
                    "再度アップロードや別モデルでの解析を検討してください。"
                )
                transcript_source = "fallback"
                transcript_note = (
                    "Gemini での文字起こしに失敗したため、プレースホルダー文章を返却しました。"
                )
            formatted = self._format_transcript(transcript)
            transcript_path = await self._save_text_file(
                workspace_dir, "transcription.txt", transcript or formatted
            )
        await self.store.update_status(
            project_id,
            step,
            formatted,
            data={
                "transcript": transcript,
                "formatted": formatted,
                "file_path": str(transcript_path),
                "source": transcript_source,
                "note": transcript_note,
            },
        )
        return transcript, transcript_path, transcript_source, transcript_note

    async def _run_ocr(
        self, project_id: str, video_path: Path, workspace_dir: Path
    ) -> tuple[str, Path, Optional[str]]:
        """OCR ステップ."""

        step = PROJECT_STEPS[1]
        await self.store.mark_step_running(project_id, step)
        ocr_note: Optional[str] = None
        try:
            ocr_text = await self.gemini_client.extract_ocr(video_path)
        except Exception as exc:
            self.logger.warning(
                "Gemini OCR failed for %s: %s", project_id, exc
            )
            ocr_text = (
                "OCR 抽出を実行できませんでした。該当フレームの文字が取得できなかった可能性があります。"
            )
            ocr_note = "Gemini OCR に失敗したため、プレースホルダー文章を返却しました。"
        annotations = [
            line.strip()
            for line in ocr_text.splitlines()
            if "※" in line
        ]
        formatted = self._format_ocr_text(ocr_text)
        ocr_path = await self._save_text_file(workspace_dir, "ocr.txt", ocr_text)
        await self.store.update_status(
            project_id,
            step,
            formatted,
            data={
                "ocr_text": ocr_text,
                "formatted": formatted,
                "file_path": str(ocr_path),
                "note": ocr_note,
                "annotations": annotations,
            },
        )
        return ocr_text, ocr_path, ocr_note

    async def _run_visual_analysis(
        self, project_id: str, media_path: Path, workspace_dir: Path, media_type: str
    ) -> tuple[dict, Path, Optional[str]]:
        """映像解析ステップ."""

        step = PROJECT_STEPS[2]
        await self.store.mark_step_running(project_id, step)
        video_note: Optional[str] = None
        try:
            if media_type == "image":
                video_result = await self.gemini_client.analyze_image(media_path)
                video_note = "Gemini による静止画解析を実施しました。"
            else:
                video_result = await self.gemini_client.analyze_video_segments(media_path)
        except Exception as visual_error:
            self.logger.warning(
                "Gemini visual analysis failed for %s: %s",
                project_id,
                visual_error,
            )
            video_result = {
                "summary": (
                    "映像解析を実行できませんでした。Gemini API キーの設定を確認し再度実行してください。"
                ),
                "segments": [],
                "risk_flags": ["analysis-unavailable"],
            }
            video_note = (
                "Gemini の映像解析に失敗したため、プレースホルダー結果を返却しました。"
            )
        formatted = self._format_video_analysis(video_result)
        if self._is_stub_video_result(video_result):
            if video_note is None:
                video_note = "Gemini API キー未設定のためスタブ解析結果を返却しました。"
            self.logger.info("Visual analysis returned stub result for %s.", project_id)
        video_path = await self._save_json_file(workspace_dir, "video_analysis.json", video_result)
        await self.store.update_status(
            project_id,
            step,
            formatted,
            data={
                "raw": video_result,
                "formatted": formatted,
                "file_path": str(video_path),
                "note": video_note,
            },
        )
        return video_result, video_path, video_note

    async def _run_risk(
        self,
        project_id: str,
        transcript: str,
        ocr_text: str,
        video_result: dict,
        workspace_dir: Path,
    ) -> tuple[dict, Path]:
        """Gemini を用いた統合リスク評価."""

        step = PROJECT_STEPS[3]
        await self.store.mark_step_running(project_id, step)
        try:
            risk_result = await self.risk_assessor.assess(
                transcript=transcript,
                ocr_text=ocr_text,
                video_summary=video_result,
            )
            risk_result.setdefault("tags", [])
            burn_risk = self.risk_assessor.calculate_burn_risk(risk_result.get("tags") or [])
            risk_result["burn_risk"] = burn_risk
        except Exception as exc:  # pragma: no cover
            self.logger.exception("Risk assessment failed for %s", project_id)
            risk_result = {
                "social": {
                    "grade": "C",
                    "reason": "リスク評価に失敗したため暫定評価を返却しています。",
                    "findings": [],
                },
                "legal": {
                    "grade": "抵触する可能性がある",
                    "reason": "リスク評価に失敗したため暫定評価を返却しています。",
                    "recommendations": "Gemini の設定を確認し、再度実行してください。",
                    "violations": [],
                    "findings": [],
                },
                "matrix": {"x_axis": "法務評価", "y_axis": "社会的感度", "position": [1, 2]},
                "note": str(exc),
                "tags": [],
                "burn_risk": {"count": 0, "details": []},
            }
        formatted = self._format_risk(risk_result)
        risk_path = await self._save_json_file(workspace_dir, "risk_assessment.json", risk_result)
        await self.store.update_status(
            project_id,
            step,
            formatted,
            data={
                "risk": risk_result,
                "formatted": formatted,
                "file_path": str(risk_path),
            },
        )
        return risk_result, risk_path

    def _build_final_report(
        self,
        transcript: str,
        ocr_text: str,
        video_result: dict,
        transcript_path: Path,
        ocr_path: Path,
        video_path: Path,
        risk_path: Path,
        risk_result: dict,
        transcription_source: str,
        transcription_note: Optional[str],
        ocr_note: Optional[str],
        video_note: Optional[str],
    ) -> dict:
        """各モジュールの結果を人が読みやすい形式でまとめる."""

        transcript_section = self._format_transcript(transcript)
        ocr_section = self._format_ocr_text(ocr_text)
        video_section = self._format_video_analysis(video_result)

        ocr_annotations = [
            line.strip()
            for line in ocr_text.splitlines()
            if "※" in line
        ]

        burn_risk = risk_result.get("burn_risk") if isinstance(risk_result, dict) else None

        social_grade = risk_result.get("social", {}).get("grade", "N/A")
        legal_grade = risk_result.get("legal", {}).get("grade", "N/A")

        disclaimer = (
            "*本分析結果は参考用途のみを目的としており、社会的・法的リスクの不存在を保証するものではありません。"
        )

        metadata: dict[str, object] = {
            "transcription_source": transcription_source,
        }
        if transcription_note:
            metadata["transcription_note"] = transcription_note
        if ocr_note:
            metadata["ocr_note"] = ocr_note
        if video_note:
            metadata["video_note"] = video_note
        if ocr_annotations:
            metadata["ocr_annotations"] = ocr_annotations
        if burn_risk:
            metadata["burn_risk"] = burn_risk

        return {
            "summary": disclaimer,
            "sections": {
                "transcription": transcript_section,
                "ocr": ocr_section,
                "video_analysis": video_section,
            },
            "files": {
                "transcription": str(transcript_path),
                "ocr": str(ocr_path),
                "video_analysis": str(video_path),
                "risk_assessment": str(risk_path),
            },
            "metadata": metadata,
            "risk": risk_result,
        }

    def _format_transcript(self, transcript: str) -> str:
        excerpt = transcript.strip() or "音声から有効なテキストは取得できませんでした。"
        return f"🗣️ 音声文字起こし\n{excerpt}"

    def _format_ocr_text(self, ocr_text: str) -> str:
        excerpt = ocr_text.strip() or "字幕情報は検出されませんでした。"
        return f"📝 OCR字幕抜粋\n{excerpt}"

    def _format_video_analysis(self, video_result: dict) -> str:
        summary = video_result.get("summary") or "映像に関する特記事項はありません。"
        segments = video_result.get("segments") or []
        lines = [f"🎬 映像解析レポート\n{summary}"]
        if segments:
            lines.append("\n📋 表現パターングループ")
            for segment in segments:
                label = segment.get("label", "未分類の表現")
                description = segment.get("description", "")
                lines.append(f"- {label}")
                if description:
                    lines.append(f"  ・{description}")
                shots = segment.get("shots") or []
                for shot in shots:
                    timecode = shot.get("timecode", "timecode不明")
                    detail = shot.get("description", "")
                    lines.append(f"    - {timecode}: {detail}")
        risk_flags = video_result.get("risk_flags") or []
        if risk_flags:
            lines.append("\n⚠️ 注目ポイント")
            for flag in risk_flags:
                lines.append(f"- {flag}")
        return "\n".join(lines)

    def _format_risk(self, risk_result: dict) -> str:
        social = risk_result.get("social", {})
        legal = risk_result.get("legal", {})
        matrix = risk_result.get("matrix", {})
        lines = [
            "⚖️ 統合リスク評価",
            f"社会的感度: {social.get('grade', 'N/A')} - {social.get('reason', '')}",
            f"法務評価: {legal.get('grade', 'N/A')} - {legal.get('reason', '')}",
        ]
        social_findings = social.get("findings") or []
        if social_findings:
            lines.append("  ・社会的感度指摘:")
            for finding in social_findings[:5]:
                lines.append(
                    f"    - {finding.get('timecode', 'N/A')}: {finding.get('detail', '')}"
                )
        recommendations = legal.get("recommendations")
        if recommendations:
            lines.append(f"改善提案: {recommendations}")
        legal_findings = legal.get("findings") or []
        if legal_findings:
            lines.append("  ・法務指摘:")
            for finding in legal_findings[:5]:
                lines.append(
                    f"    - {finding.get('timecode', 'N/A')}: {finding.get('detail', '')}"
                )
        violations = legal.get("violations") or []
        if violations:
            lines.append("  ・想定される抵触表現:")
            for violation in violations[:5]:
                reference = violation.get("reference")
                expression = violation.get("expression", "")
                severity = violation.get("severity")
                detail = expression
                if severity:
                    detail = f"[{severity}] {detail}"
                if reference:
                    detail = f"{reference}: {detail}"
                lines.append(f"    - {detail}")
        burn_risk = risk_result.get("burn_risk") or {}
        if burn_risk.get("count"):
            lines.append(
                f"炎上補正: {burn_risk.get('grade', 'N/A')} ({burn_risk.get('label', '')}) 平均リスク {burn_risk.get('average', 'N/A')}"
            )
        position = matrix.get("position")
        if position:
            lines.append(f"ポジション: X={position[0]} / Y={position[1]}")
        tags = risk_result.get("tags") or []
        if tags:
            lines.append("\n🧩 タグ別評価")
            for tag in tags[:5]:
                lines.append(
                    f"- {tag.get('name', '不明')}: {tag.get('grade', 'N/A')} / {tag.get('reason', '')}"
                )
        return "\n".join(lines)

    @staticmethod
    def _is_stub_video_result(result: dict) -> bool:
        summary = result.get("summary", "")
        risk_flags = result.get("risk_flags") or []
        if isinstance(summary, str) and summary.startswith("[stub]"):
            return True
        return any(
            flag in {"insight-unavailable", "analysis-unavailable"} for flag in risk_flags
        )

    async def _save_text_file(self, workspace_dir: Path, filename: str, content: str) -> Path:
        """テキスト結果を uploads ディレクトリに保存."""

        output_path = workspace_dir / filename
        async with aiofiles.open(output_path, "w", encoding="utf-8") as file_obj:
            await file_obj.write(content)
        return output_path

    async def _save_json_file(self, workspace_dir: Path, filename: str, payload: dict) -> Path:
        """JSON 結果を uploads ディレクトリに保存."""

        output_path = workspace_dir / filename
        async with aiofiles.open(output_path, "w", encoding="utf-8") as file_obj:
            json_payload = json.dumps(payload, ensure_ascii=False, indent=2)
            await file_obj.write(json_payload)
        return output_path
