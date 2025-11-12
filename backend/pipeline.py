"""分析パイプラインの調停ロジック."""

import json
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional

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

        total_iterations = 3

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

            await self.store.update_iteration_state(
                project_id,
                current_iteration=0,
                total_iterations=total_iterations,
            )

            # 情報摘出フェーズを2回実行し、適切な方を選択
            self.logger.info("Starting information extraction (run 1/2) for project %s", project_id)
            transcript_1, transcript_path_1, transcript_source_1, transcript_note_1 = await self._run_transcription(
                project_id, video_path, workspace_dir, media_type
            )
            ocr_text_1, ocr_path_1, ocr_note_1 = await self._run_ocr(project_id, video_path, workspace_dir, media_type)
            video_result_1, video_path_result_1, video_note_1 = await self._run_visual_analysis(
                project_id, video_path, workspace_dir, media_type
            )
            self.logger.info("Information extraction run 1/2 completed for project %s", project_id)

            self.logger.info("Starting information extraction (run 2/2) for project %s", project_id)
            transcript_2, transcript_path_2, transcript_source_2, transcript_note_2 = await self._run_transcription(
                project_id, video_path, workspace_dir, media_type
            )
            ocr_text_2, ocr_path_2, ocr_note_2 = await self._run_ocr(project_id, video_path, workspace_dir, media_type)
            video_result_2, video_path_result_2, video_note_2 = await self._run_visual_analysis(
                project_id, video_path, workspace_dir, media_type
            )
            self.logger.info("Information extraction run 2/2 completed for project %s", project_id)

            # 2つの結果を比較し、より適切な方を選択
            self.logger.info("Selecting best extraction results for project %s", project_id)
            transcript, transcript_path, transcript_source, transcript_note = await self._select_best_transcription(
                (transcript_1, transcript_path_1, transcript_source_1, transcript_note_1),
                (transcript_2, transcript_path_2, transcript_source_2, transcript_note_2)
            )
            ocr_text, ocr_path, ocr_note = await self._select_best_ocr(
                (ocr_text_1, ocr_path_1, ocr_note_1),
                (ocr_text_2, ocr_path_2, ocr_note_2)
            )
            video_result, video_path_result, video_note = await self._select_best_video(
                (video_result_1, video_path_result_1, video_note_1),
                (video_result_2, video_path_result_2, video_note_2)
            )
            self.logger.info("Information extraction completed for project %s", project_id)

            # リスク分析を3回実行
            risk_results: List[Dict[str, Any]] = []
            for iteration in range(1, total_iterations + 1):
                await self.store.update_iteration_state(
                    project_id,
                    current_iteration=iteration,
                    total_iterations=total_iterations,
                )
                self.logger.info(
                    "Starting risk analysis iteration %d/%d for project %s",
                    iteration,
                    total_iterations,
                    project_id,
                )
                risk_result, risk_path = await self._run_risk(
                    project_id,
                    transcript,
                    ocr_text,
                    video_result,
                    workspace_dir,
                )
                risk_results.append(risk_result)
                self.logger.info(
                    "Risk analysis iteration %d/%d completed for project %s",
                    iteration,
                    total_iterations,
                    project_id,
                )

            # リスク分析結果を統合（ハイブリッド戦略）
            aggregated_risk = self._aggregate_risk_results(risk_results)

            aggregation = await self._finalize_with_single_extraction(
                project_id,
                workspace_dir,
                media_type,
                transcript,
                transcript_source,
                transcript_note,
                transcript_path,
                ocr_text,
                ocr_note,
                ocr_path,
                video_result,
                video_note,
                video_path_result,
                aggregated_risk,
                risk_results,
            )
            await self._apply_step_overrides(project_id, aggregation["step_payloads"])
            await self.store.mark_pipeline_completed(project_id, aggregation["final_report"])
            self.logger.info(
                "Pipeline completed for project %s after %d iterations",
                project_id,
                total_iterations,
            )
        except Exception as exc:  # pylint: disable=broad-except
            # エラー時はステータスを failed にしてログを残す
            self.logger.exception("Pipeline execution failed for %s", project_id)
            await self.store.mark_pipeline_failed(project_id, str(exc))
            raise

    async def _execute_iteration(
        self,
        project_id: str,
        media_path: Path,
        workspace_dir: Path,
        media_type: str,
        iteration: int,
        total_iterations: int,
    ) -> Dict[str, Any]:
        """単一イテレーション分の解析を実行し、中間結果を返す."""

        transcript, _, transcript_source, transcript_note = await self._run_transcription(
            project_id, media_path, workspace_dir, media_type
        )
        ocr_text, _, ocr_note = await self._run_ocr(project_id, media_path, workspace_dir, media_type)
        video_result, _, video_note = await self._run_visual_analysis(
            project_id, media_path, workspace_dir, media_type
        )
        risk_result, _ = await self._run_risk(
            project_id,
            transcript,
            ocr_text,
            video_result,
            workspace_dir,
        )
        self.logger.info(
            "Iteration %d/%d finished for %s",
            iteration,
            total_iterations,
            project_id,
        )
        return {
            "iteration": iteration,
            "transcription": {
                "text": transcript,
                "source": transcript_source,
                "note": transcript_note,
            },
            "ocr": {
                "text": ocr_text,
                "note": ocr_note,
            },
            "video": {
                "result": video_result,
                "note": video_note,
            },
            "risk": {
                "result": risk_result,
            },
        }

    def _aggregate_risk_results(self, risk_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """3回のリスク分析結果をハイブリッド戦略で統合."""

        # 1. 社会的リスク・法的リスク: 最も厳しい評価を採用
        social_grades = [result.get("social", {}).get("grade") for result in risk_results if result.get("social")]
        legal_grades = [result.get("legal", {}).get("grade") for result in risk_results if result.get("legal")]

        # グレードの優先度（厳しい順）
        social_priority = {"S": 0, "A": 1, "B": 2, "C": 3}
        legal_priority = {"抵触する": 0, "抵触する可能性がある": 1, "抵触しない": 2}

        most_severe_social = min(social_grades, key=lambda g: social_priority.get(g, 99), default="C") if social_grades else "C"
        most_severe_legal = min(legal_grades, key=lambda g: legal_priority.get(g, 99), default="抵触する可能性がある") if legal_grades else "抵触する可能性がある"

        # 最も厳しい評価を持つ結果を選択
        selected_result = None
        for result in risk_results:
            if (result.get("social", {}).get("grade") == most_severe_social or
                result.get("legal", {}).get("grade") == most_severe_legal):
                selected_result = result
                break

        if not selected_result:
            selected_result = risk_results[0] if risk_results else {}

        # 2. タグ: 2回以上出現したタグのみ採用（多数決）
        all_tags = []
        for result in risk_results:
            tags = result.get("tags") or []
            all_tags.extend(tags)

        tag_counter: Dict[str, List[Dict[str, Any]]] = {}
        for tag in all_tags:
            tag_name = tag.get("name")
            if tag_name:
                if tag_name not in tag_counter:
                    tag_counter[tag_name] = []
                tag_counter[tag_name].append(tag)

        consensus_tags = []
        for tag_name, tag_list in tag_counter.items():
            if len(tag_list) >= 2:  # 2回以上出現
                # 最も厳しいグレードを選択
                grade_priority = {"S": 0, "A": 1, "B": 2, "C": 3}
                best_tag = min(tag_list, key=lambda t: grade_priority.get(t.get("grade", "C"), 99))
                consensus_tags.append(best_tag)

        # 3. 検出文言: 全ての分析から収集し、重複除外
        detected_phrases_set = set()
        for result in risk_results:
            social_findings = result.get("social", {}).get("findings") or []
            legal_findings = result.get("legal", {}).get("findings") or []
            for finding in social_findings + legal_findings:
                detail = finding.get("detail")
                if detail:
                    detected_phrases_set.add(detail)

        # 統合結果を構築
        aggregated_risk = {
            "social": selected_result.get("social", {}),
            "legal": selected_result.get("legal", {}),
            "matrix": selected_result.get("matrix", {"x_axis": "", "y_axis": "", "position": [0, 0]}),
            "tags": consensus_tags,
        }

        # burn_riskを再計算
        burn_risk = self.risk_assessor.calculate_burn_risk(consensus_tags)
        aggregated_risk["burn_risk"] = burn_risk

        return aggregated_risk

    async def _finalize_with_single_extraction(
        self,
        project_id: str,
        workspace_dir: Path,
        media_type: str,
        transcript: str,
        transcript_source: str,
        transcript_note: Optional[str],
        transcript_path: Path,
        ocr_text: str,
        ocr_note: Optional[str],
        ocr_path: Path,
        video_result: Dict[str, Any],
        video_note: Optional[str],
        video_path: Path,
        aggregated_risk: Dict[str, Any],
        risk_results: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """情報摘出1回+リスク分析3回の結果から最終レポートとステップデータを生成."""

        transcript_formatted = self._format_transcript(transcript)
        ocr_formatted = self._format_ocr_text(ocr_text)
        video_formatted = self._format_video_analysis(video_result)
        risk_formatted = self._format_risk(aggregated_risk)

        # リスク評価結果を保存
        risk_path = await self._save_json_file(
            workspace_dir,
            "risk_assessment.json",
            aggregated_risk,
        )

        # イテレーション情報をシリアライズ
        iterations_serialized = [
            {
                "index": i + 1,
                "transcription": transcript,
                "ocr": ocr_text,
                "video_analysis": video_result,
                "risk": risk_result,
            }
            for i, risk_result in enumerate(risk_results)
        ]

        final_report = self._build_final_report(
            transcript,
            ocr_text,
            video_result,
            transcript_path,
            ocr_path,
            video_path,
            risk_path,
            aggregated_risk,
            transcript_source,
            transcript_note,
            ocr_note,
            video_note,
            iterations=iterations_serialized,
        )

        step_payloads: Dict[str, Dict[str, Any]] = {
            PROJECT_STEPS[0]: {
                "preview": transcript_formatted,
                "data": {
                    "transcript": transcript,
                    "formatted": transcript_formatted,
                    "file_path": str(transcript_path),
                    "source": transcript_source,
                    "note": transcript_note,
                },
            },
            PROJECT_STEPS[1]: {
                "preview": ocr_formatted,
                "data": {
                    "ocr_text": ocr_text,
                    "formatted": ocr_formatted,
                    "file_path": str(ocr_path),
                    "note": ocr_note,
                },
            },
            PROJECT_STEPS[2]: {
                "preview": video_formatted,
                "data": {
                    "raw": video_result,
                    "formatted": video_formatted,
                    "file_path": str(video_path),
                    "note": video_note,
                },
            },
            PROJECT_STEPS[3]: {
                "preview": risk_formatted,
                "data": {
                    "risk": aggregated_risk,
                    "formatted": risk_formatted,
                    "file_path": str(risk_path),
                    "runs": [
                        {
                            "iteration": i + 1,
                            "result": risk_result,
                        }
                        for i, risk_result in enumerate(risk_results)
                    ],
                },
            },
        }

        return {
            "final_report": final_report,
            "step_payloads": step_payloads,
        }

    async def _apply_step_overrides(
        self,
        project_id: str,
        step_payloads: Dict[str, Dict[str, Any]],
    ) -> None:
        """集約後のステップデータでストアを更新する."""

        project = await self.store.get_project(project_id)
        for step, payload in step_payloads.items():
            preview = str(payload.get("preview") or "")
            project.payloads[step] = {
                "preview": preview[:300],
                "data": payload.get("data"),
            }
            project.step_status[step] = "completed"
        await self.store.save(project)

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
                transcript = await self.gemini_client.run_step(
                    "transcription",
                    media_path,
                    media_type=media_type,
                )
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
        self, project_id: str, video_path: Path, workspace_dir: Path, media_type: str
    ) -> tuple[str, Path, Optional[str]]:
        """OCR ステップ."""

        step = PROJECT_STEPS[1]
        await self.store.mark_step_running(project_id, step)
        ocr_note: Optional[str] = None
        try:
            ocr_text = await self.gemini_client.run_step(
                "ocr",
                video_path,
                media_type=media_type,
            )
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
            video_result = await self.gemini_client.run_step(
                "visual",
                media_path,
                media_type=media_type,
            )
            if not isinstance(video_result, dict):
                raise ValueError("Visual analysis returned non-dict payload")
            if media_type == "image":
                video_note = "Gemini による静止画解析を実施しました。"
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
            risk_result = await self.risk_assessor.assess_with_enrichment(
                transcript=transcript,
                ocr_text=ocr_text,
                video_summary=video_result,
            )
            risk_result.setdefault("tags", [])
            burn_risk = self.risk_assessor.calculate_burn_risk(risk_result.get("tags") or [])
            risk_result["burn_risk"] = burn_risk
            self.logger.info(
                "Risk assessment finished for %s: social=%s legal=%s tags=%d burn_entries=%d",
                project_id,
                risk_result.get("social", {}).get("grade"),
                risk_result.get("legal", {}).get("grade"),
                len(risk_result.get("tags") or []),
                burn_risk.get("count") if isinstance(burn_risk, dict) else 0,
            )
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
        iterations: Optional[List[Dict[str, Any]]] = None,
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
            "iterations": iterations,
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
    def _serialize_iterations(iteration_runs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        serialized: List[Dict[str, Any]] = []
        for run in iteration_runs:
            serialized.append(
                {
                    "index": run.get("iteration"),
                    "transcription": run.get("transcription", {}).get("text"),
                    "ocr": run.get("ocr", {}).get("text"),
                    "video_analysis": run.get("video", {}).get("result"),
                    "risk": run.get("risk", {}).get("result"),
                }
            )
        return serialized

    @staticmethod
    def _select_consensus_text(candidates: List[str]) -> str:
        cleaned = [text.strip() for text in candidates if text and text.strip()]
        if not cleaned:
            return candidates[-1] if candidates else ""
        counts = Counter(cleaned)
        top_text, top_count = counts.most_common(1)[0]
        if top_count == 1:
            return max(cleaned, key=len, default="")
        return top_text

    @staticmethod
    def _select_most_common_value(values: List[Optional[str]], default: str) -> str:
        filtered = [value for value in values if value]
        if not filtered:
            return default
        counts = Counter(filtered)
        return counts.most_common(1)[0][0]

    @staticmethod
    def _first_non_empty(values: List[Optional[str]]) -> Optional[str]:
        for value in values:
            if value:
                stripped = value.strip()
                if stripped:
                    return stripped
        return None

    @staticmethod
    def _select_video_payload(
        video_runs: List[Dict[str, Any]]
    ) -> tuple[Dict[str, Any], Optional[str]]:
        if not video_runs:
            return {}, None
        best_result: Dict[str, Any] = {}
        best_note: Optional[str] = None
        best_score = -1
        for run in video_runs:
            result = run.get("result") or {}
            segments = result.get("segments") or []
            score = len(segments)
            if score > best_score:
                best_score = score
                best_result = result
                best_note = run.get("note")
        return best_result, best_note

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

    async def _select_best_transcription(
        self,
        run1: tuple[str, Path, str, Optional[str]],
        run2: tuple[str, Path, str, Optional[str]]
    ) -> tuple[str, Path, str, Optional[str]]:
        """2つの文字起こし結果を比較し、より適切な方を選択."""
        transcript_1, path_1, source_1, note_1 = run1
        transcript_2, path_2, source_2, note_2 = run2

        # 長さの比較（より詳細な方を優先）
        len1 = len(transcript_1.strip())
        len2 = len(transcript_2.strip())

        # 差異が5%未満なら1つ目を採用（安定性重視）
        if abs(len1 - len2) / max(len1, len2, 1) < 0.05:
            self.logger.info(f"Transcriptions are similar (diff < 5%), selecting run 1")
            return run1

        # Geminiに判定を依頼
        from textwrap import dedent
        prompt = dedent(f"""
        以下の2つの文字起こし結果を比較し、より文脈的に適切で完全な方を選択してください。

        ## 文字起こし結果1 (長さ: {len1}文字)
        {transcript_1[:3000]}

        ## 文字起こし結果2 (長さ: {len2}文字)
        {transcript_2[:3000]}

        どちらがより適切か、"1" または "2" のみで回答してください。
        理由を簡潔に説明した後、最後の行に数字のみを記載してください。
        """)

        try:
            response = await self.gemini_client.generate_text(prompt)
            choice_text = response.strip().split("\n")[-1].strip()
            choice = int(choice_text)
            self.logger.info(f"Gemini selected transcription {choice}")
            return run1 if choice == 1 else run2
        except Exception as e:
            self.logger.warning(f"Failed to get Gemini selection: {e}, defaulting to longer transcription")
            return run1 if len1 >= len2 else run2

    async def _select_best_ocr(
        self,
        run1: tuple[str, Path, Optional[str]],
        run2: tuple[str, Path, Optional[str]]
    ) -> tuple[str, Path, Optional[str]]:
        """2つのOCR結果を比較し、より適切な方を選択."""
        ocr_1, path_1, note_1 = run1
        ocr_2, path_2, note_2 = run2

        len1 = len(ocr_1.strip())
        len2 = len(ocr_2.strip())

        if abs(len1 - len2) / max(len1, len2, 1) < 0.05:
            self.logger.info(f"OCR results are similar (diff < 5%), selecting run 1")
            return run1

        from textwrap import dedent
        prompt = dedent(f"""
        以下の2つのOCR字幕抽出結果を比較し、より文脈的に適切で完全な方を選択してください。

        ## OCR結果1 (長さ: {len1}文字)
        {ocr_1[:3000]}

        ## OCR結果2 (長さ: {len2}文字)
        {ocr_2[:3000]}

        どちらがより適切か、"1" または "2" のみで回答してください。
        理由を簡潔に説明した後、最後の行に数字のみを記載してください。
        """)

        try:
            response = await self.gemini_client.generate_text(prompt)
            choice_text = response.strip().split("\n")[-1].strip()
            choice = int(choice_text)
            self.logger.info(f"Gemini selected OCR {choice}")
            return run1 if choice == 1 else run2
        except Exception as e:
            self.logger.warning(f"Failed to get Gemini selection: {e}, defaulting to longer OCR")
            return run1 if len1 >= len2 else run2

    async def _select_best_video(
        self,
        run1: tuple[Dict[str, Any], Path, Optional[str]],
        run2: tuple[Dict[str, Any], Path, Optional[str]]
    ) -> tuple[Dict[str, Any], Path, Optional[str]]:
        """2つの映像解析結果を比較し、より適切な方を選択."""
        video_1, path_1, note_1 = run1
        video_2, path_2, note_2 = run2

        # セグメント数とテキスト量で比較
        segments_1 = video_1.get("segments", [])
        segments_2 = video_2.get("segments", [])

        text_1 = " ".join([seg.get("description", "") for seg in segments_1])
        text_2 = " ".join([seg.get("description", "") for seg in segments_2])

        len1 = len(text_1.strip())
        len2 = len(text_2.strip())

        if abs(len1 - len2) / max(len1, len2, 1) < 0.05:
            self.logger.info(f"Video analysis results are similar (diff < 5%), selecting run 1")
            return run1

        from textwrap import dedent
        prompt = dedent(f"""
        以下の2つの映像解析結果を比較し、より文脈的に適切で詳細な方を選択してください。

        ## 映像解析1 (セグメント数: {len(segments_1)}, 説明文字数: {len1})
        {json.dumps(video_1, ensure_ascii=False, indent=2)[:3000]}

        ## 映像解析2 (セグメント数: {len(segments_2)}, 説明文字数: {len2})
        {json.dumps(video_2, ensure_ascii=False, indent=2)[:3000]}

        どちらがより適切か、"1" または "2" のみで回答してください。
        理由を簡潔に説明した後、最後の行に数字のみを記載してください。
        """)

        try:
            response = await self.gemini_client.generate_text(prompt)
            choice_text = response.strip().split("\n")[-1].strip()
            choice = int(choice_text)
            self.logger.info(f"Gemini selected video analysis {choice}")
            return run1 if choice == 1 else run2
        except Exception as e:
            self.logger.warning(f"Failed to get Gemini selection: {e}, defaulting to more detailed video analysis")
            return run1 if len1 >= len2 else run2
