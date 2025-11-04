"""FastAPI レスポンス向けのスキーマ定義."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from backend.store import PROJECT_STEPS, Project


class ProjectCreatedResponse(BaseModel):
    """POST /projects のレスポンス."""

    id: str
    company_name: str
    product_name: str
    title: str
    model: str
    file_name: str
    status: str
    analysis_progress: float
    created_at: datetime = Field(..., description="プロジェクト作成日時")


class AnalysisStepPayload(BaseModel):
    preview: Optional[str] = None


class AnalysisStep(BaseModel):
    name: str
    status: str
    payload: Optional[AnalysisStepPayload] = None


class ProjectStatusResponse(BaseModel):
    id: str
    company_name: str
    product_name: str
    title: str
    model: str
    status: str
    analysis_progress: float
    steps: List[AnalysisStep]
    logs: List[str]


class FinalReportSections(BaseModel):
    transcription: str
    ocr: str
    video_analysis: str


class FinalReportFiles(BaseModel):
    transcription: str
    ocr: str
    video_analysis: str
    risk_assessment: str


class SocialEvaluation(BaseModel):
    grade: str
    reason: str


class LegalEvaluation(BaseModel):
    grade: str
    reason: str
    recommendations: Optional[str] = None


class RiskMatrix(BaseModel):
    x_axis: str
    y_axis: str
    position: List[int]


class RiskReport(BaseModel):
    social: SocialEvaluation
    legal: LegalEvaluation
    matrix: RiskMatrix
    note: Optional[str] = None


class FinalReport(BaseModel):
    summary: str
    sections: FinalReportSections
    files: FinalReportFiles
    metadata: Optional[Dict[str, Any]] = None
    risk: RiskReport


class ProjectReportResponse(BaseModel):
    id: str
    company_name: str
    product_name: str
    title: str
    model: str
    final_report: FinalReport


def build_created_response(project: Project) -> ProjectCreatedResponse:
    """Project モデルから作成レスポンスを生成."""

    return ProjectCreatedResponse(
        id=project.id,
        company_name=project.company_name,
        product_name=project.product_name,
        title=project.title,
        model=project.model,
        file_name=project.file_name,
        status=project.status,
        analysis_progress=project.analysis_progress,
        created_at=project.created_at,
    )


def build_status_response(project: Project) -> ProjectStatusResponse:
    """分析状況レスポンスを生成."""

    steps = []
    for step in PROJECT_STEPS:
        payload_data = project.payloads.get(step)
        payload = (
            AnalysisStepPayload(preview=payload_data.get("preview"))
            if payload_data
            else None
        )
        steps.append(
            AnalysisStep(
                name=step,
                status=project.step_status.get(step, "pending"),
                payload=payload,
            )
        )

    return ProjectStatusResponse(
        id=project.id,
        company_name=project.company_name,
        product_name=project.product_name,
        title=project.title,
        model=project.model,
        status=project.status,
        analysis_progress=project.analysis_progress,
        steps=steps,
        logs=project.logs,
    )


def build_report_response(project: Project) -> ProjectReportResponse:
    """最終レポートレスポンスを生成."""

    if project.final_report is None:
        raise ValueError("Final report is not ready.")

    return ProjectReportResponse(
        id=project.id,
        company_name=project.company_name,
        product_name=project.product_name,
        title=project.title,
        model=project.model,
        final_report=FinalReport(**project.final_report),
    )
