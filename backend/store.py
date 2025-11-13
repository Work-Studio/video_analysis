"""プロジェクトの進行状態を保持するインメモリストア."""

from __future__ import annotations

import asyncio
import copy
import json
import shutil
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_STEPS = ["音声文字起こし", "OCR字幕抽出", "映像解析", "リスク統合"]


def _default_step_status() -> Dict[str, str]:
    return {step: "pending" for step in PROJECT_STEPS}


@dataclass
class Project:
    """単一プロジェクトの状態モデル."""

    id: str
    company_name: str
    product_name: str
    title: str
    video_path: Path
    file_name: str
    workspace_dir: Path
    model: str
    media_type: str = "video"
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    status: str = "created"
    analysis_progress: float = 0.0
    logs: list[str] = field(default_factory=list)
    payloads: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    step_status: Dict[str, str] = field(default_factory=_default_step_status)
    final_report: Optional[Dict[str, Any]] = None
    analysis_started: bool = False
    last_updated: datetime = field(default_factory=lambda: datetime.now(UTC))
    analysis_started_at: Optional[datetime] = None
    analysis_completed_at: Optional[datetime] = None
    analysis_duration_seconds: Optional[float] = None
    total_iterations: int = 1
    current_iteration: int = 0


class ProjectNotFoundError(KeyError):
    """指定 ID のプロジェクトが存在しない場合のエラー."""


class PipelineAlreadyRunningError(RuntimeError):
    """同じプロジェクトでパイプラインを二重起動しようとした場合のエラー."""


class ProjectStore:
    """インメモリなプロジェクトストア."""

    def __init__(self) -> None:
        self._db: Dict[str, Project] = {}
        self._lock = asyncio.Lock()

    async def create_project(
        self,
        *,
        project_id: str,
        company_name: str,
        product_name: str,
        title: str,
        video_path: Path,
        file_name: str,
        workspace_dir: Path,
        model: str,
        media_type: str,
    ) -> Project:
        """新規プロジェクトを登録する."""

        project = Project(
            id=project_id,
            company_name=company_name,
            product_name=product_name,
            title=title,
            video_path=video_path,
            file_name=file_name,
            workspace_dir=workspace_dir,
            model=model,
            media_type=media_type,
        )
        project.logs.append("プロジェクト作成")

        async with self._lock:
            self._db[project_id] = project
            return copy.deepcopy(project)

    async def get_project(self, project_id: str) -> Project:
        """ID からプロジェクトを取得する."""

        async with self._lock:
            project = self._db.get(project_id)
            if project is None:
                raise ProjectNotFoundError(project_id)
            return copy.deepcopy(project)

    async def mark_pipeline_started(self, project_id: str) -> Project:
        """分析パイプライン開始時のステータス更新."""

        async with self._lock:
            project = self._db.get(project_id)
            if project is None:
                raise ProjectNotFoundError(project_id)
            if project.analysis_started and project.status == "analyzing":
                raise PipelineAlreadyRunningError(project_id)

            now = datetime.now(UTC)
            project.analysis_started = True
            project.status = "analyzing"
            project.analysis_started_at = now
            project.analysis_completed_at = None
            project.analysis_duration_seconds = None
            project.current_iteration = 0
            project.total_iterations = max(project.total_iterations, 1)
            project.logs.append("分析パイプライン開始")
            project.last_updated = now
            self._db[project_id] = project
            return copy.deepcopy(project)

    async def mark_step_running(self, project_id: str, step: str) -> Project:
        """個別ステップの処理開始を記録."""

        if step not in PROJECT_STEPS:
            raise ValueError(f"Unknown step: {step}")

        async with self._lock:
            project = self._db.get(project_id)
            if project is None:
                raise ProjectNotFoundError(project_id)
            project.step_status[step] = "running"
            project.logs.append(f"{step} 開始")
            project.last_updated = datetime.now(UTC)
            self._db[project_id] = project
            return copy.deepcopy(project)

    async def update_status(
        self,
        project_id: str,
        step: str,
        preview: str,
        data: Optional[Any] = None,
    ) -> Project:
        """ステップ完了と結果プレビューを記録."""

        if step not in PROJECT_STEPS:
            raise ValueError(f"Unknown step: {step}")

        async with self._lock:
            project = self._db.get(project_id)
            if project is None:
                raise ProjectNotFoundError(project_id)

            project.step_status[step] = "completed"
            project.logs.append(f"{step} 完了")
            project.payloads[step] = {
                "preview": preview[:300],
                "data": data,
            }
            project.analysis_progress = self._calculate_progress(project)
            project.last_updated = datetime.now(UTC)
            self._db[project_id] = project
            return copy.deepcopy(project)

    async def update_iteration_state(
        self,
        project_id: str,
        *,
        current_iteration: int,
        total_iterations: int,
    ) -> Project:
        """現在の繰り返し回数を更新する."""

        async with self._lock:
            project = self._db.get(project_id)
            if project is None:
                raise ProjectNotFoundError(project_id)
            project.current_iteration = current_iteration
            project.total_iterations = max(total_iterations, 1)
            project.last_updated = datetime.now(UTC)
            self._db[project_id] = project
            return copy.deepcopy(project)

    async def mark_pipeline_completed(
        self, project_id: str, final_report: Dict[str, Any]
    ) -> Project:
        """パイプライン完了時の状態更新."""

        async with self._lock:
            project = self._db.get(project_id)
            if project is None:
                raise ProjectNotFoundError(project_id)

            completed_at = datetime.now(UTC)
            project.status = "completed"
            project.analysis_progress = 1.0
            project.final_report = final_report
            project.logs.append("分析パイプライン完了")
            project.analysis_completed_at = completed_at
            project.current_iteration = project.total_iterations
            if project.analysis_started_at:
                duration = (completed_at - project.analysis_started_at).total_seconds()
                project.analysis_duration_seconds = max(duration, 0.0)
            else:
                project.analysis_duration_seconds = None
            project.last_updated = completed_at
            self._db[project_id] = project

            # 分析完了後、admin_archiveに自動複製
            await self._archive_project(project)

            return copy.deepcopy(project)

    async def save(self, project: Project) -> Project:
        """互換性のための save メソッド."""

        async with self._lock:
            if project.id not in self._db:
                raise ProjectNotFoundError(project.id)
            project.last_updated = datetime.now(UTC)
            self._db[project.id] = project
            return copy.deepcopy(project)

    async def mark_pipeline_failed(self, project_id: str, reason: str) -> Project:
        """パイプライン失敗時の状態更新."""

        async with self._lock:
            project = self._db.get(project_id)
            if project is None:
                raise ProjectNotFoundError(project_id)

            now = datetime.now(UTC)
            project.status = "failed"
            project.logs.append(f"分析パイプライン失敗: {reason}")
            project.analysis_completed_at = now
            if project.analysis_started_at:
                duration = (now - project.analysis_started_at).total_seconds()
                project.analysis_duration_seconds = max(duration, 0.0)
            project.last_updated = now
            self._db[project_id] = project
            return copy.deepcopy(project)

    async def list_projects(self) -> List[Project]:
        """全プロジェクトを最新更新日時順に取得."""

        async with self._lock:
            projects = list(self._db.values())
        projects.sort(key=lambda proj: proj.last_updated, reverse=True)
        return [copy.deepcopy(project) for project in projects]

    def _sanitize_component(self, value: str, default: str) -> str:
        """ファイル名の安全なコンポーネントを生成する（日本語保持）."""
        sanitized = (value or "").strip()
        if not sanitized:
            return default
        forbidden = set('<>:"\\|?*')
        sanitized = "".join("_" if ch in forbidden else ch for ch in sanitized)
        sanitized = sanitized.replace("/", "_")
        sanitized = sanitized.replace("\0", "")
        sanitized = sanitized[:120]
        return sanitized or default

    async def _archive_project(self, project: Project) -> None:
        """分析完了プロジェクトをarchiveに複製する."""
        try:
            # アーカイブディレクトリの基底パス（backend/admin_archive）
            base_dir = Path(__file__).resolve().parent
            archive_base = base_dir / "admin_archive"
            archive_base.mkdir(parents=True, exist_ok=True)

            # 会社名と商品名でフォルダー構造を作成
            safe_company = self._sanitize_component(project.company_name, "unknown_company")
            safe_product = self._sanitize_component(project.product_name, "unknown_product")
            company_dir = archive_base / safe_company
            product_dir = company_dir / safe_product
            product_dir.mkdir(parents=True, exist_ok=True)

            # タイトルと完了日時でフォルダー名を作成
            completed_at = project.analysis_completed_at or datetime.now(UTC)
            timestamp = completed_at.strftime("%Y%m%d_%H%M%S")
            safe_title = self._sanitize_component(project.title, "untitled")
            archive_dir = product_dir / f"{safe_title}_{timestamp}"

            # プロジェクトディレクトリ全体をコピー
            project_dir = project.video_path.parent
            if project_dir.exists():
                shutil.copytree(project_dir, archive_dir, dirs_exist_ok=False)

            # メタデータを保存
            metadata = {
                "project_id": project.id,
                "company_name": project.company_name,
                "product_name": project.product_name,
                "title": project.title,
                "status": project.status,
                "media_type": project.media_type,
                "created_at": project.created_at.isoformat() if project.created_at else None,
                "analysis_completed_at": completed_at.isoformat(),
                "archived_at": datetime.now(UTC).isoformat(),
                "final_report": project.final_report,
            }

            with open(archive_dir / "metadata.json", "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)

            # 分析レポートを専用ファイルとして保存
            if project.final_report:
                with open(archive_dir / "analysis_report.json", "w", encoding="utf-8") as f:
                    json.dump(project.final_report, f, ensure_ascii=False, indent=2)

                # 人間が読みやすいテキスト形式のサマリーも作成
                try:
                    summary_lines = [
                        f"=== 分析レポート ===",
                        f"プロジェクトID: {project.id}",
                        f"会社名: {project.company_name}",
                        f"商品名: {project.product_name}",
                        f"タイトル: {project.title}",
                        f"分析完了日時: {completed_at.strftime('%Y-%m-%d %H:%M:%S')}",
                        f"",
                        f"=== 総合リスクスコア ===",
                    ]

                    if "total_risk_score" in project.final_report:
                        summary_lines.append(f"スコア: {project.final_report['total_risk_score']}")

                    if "risk_grade" in project.final_report:
                        summary_lines.append(f"グレード: {project.final_report['risk_grade']}")

                    # 各カテゴリーのリスク
                    if "social_risk" in project.final_report:
                        summary_lines.extend([
                            f"",
                            f"=== 社会的リスク ===",
                            f"{project.final_report['social_risk']}",
                        ])

                    if "legal_risk" in project.final_report:
                        summary_lines.extend([
                            f"",
                            f"=== 法的リスク ===",
                            f"{project.final_report['legal_risk']}",
                        ])

                    with open(archive_dir / "analysis_summary.txt", "w", encoding="utf-8") as f:
                        f.write("\n".join(summary_lines))

                except Exception as summary_error:
                    print(f"Warning: Failed to create summary file: {summary_error}")

            print(f"Project {project.id} archived successfully to {archive_dir}")

        except Exception as e:
            # アーカイブ失敗してもエラーを投げない（ログのみ）
            print(f"Warning: Failed to archive project {project.id}: {e}")

    async def delete_project(self, project_id: str) -> None:
        """プロジェクトをストアから削除する."""

        async with self._lock:
            if project_id not in self._db:
                raise ProjectNotFoundError(project_id)
            del self._db[project_id]

    def _calculate_progress(self, project: Project) -> float:
        completed = sum(1 for status in project.step_status.values() if status == "completed")
        return completed / len(PROJECT_STEPS)

    async def reset(self) -> None:
        """テスト用に全プロジェクトを削除."""

        async with self._lock:
            self._db.clear()
