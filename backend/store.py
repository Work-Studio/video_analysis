"""プロジェクトの進行状態を保持するインメモリストア."""

from __future__ import annotations

import asyncio
import copy
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
            if project.analysis_started_at:
                duration = (completed_at - project.analysis_started_at).total_seconds()
                project.analysis_duration_seconds = max(duration, 0.0)
            else:
                project.analysis_duration_seconds = None
            project.last_updated = completed_at
            self._db[project_id] = project
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

    def _calculate_progress(self, project: Project) -> float:
        completed = sum(1 for status in project.step_status.values() if status == "completed")
        return completed / len(PROJECT_STEPS)

    async def reset(self) -> None:
        """テスト用に全プロジェクトを削除."""

        async with self._lock:
            self._db.clear()
