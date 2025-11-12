"""FastAPI レスポンス向けのスキーマ定義."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from backend.store import PROJECT_STEPS, Project


class Finding(BaseModel):
    timecode: str
    detail: str


class ProjectCreatedResponse(BaseModel):
    """POST /projects のレスポンス."""

    id: str
    company_name: str
    product_name: str
    title: str
    model: str
    file_name: str
    media_type: str
    media_url: str
    status: str
    analysis_progress: float
    created_at: datetime = Field(..., description="プロジェクト作成日時")


class AnalysisStepPayload(BaseModel):
    preview: Optional[str] = None


class AnalysisStep(BaseModel):
    name: str
    status: str
    payload: Optional[AnalysisStepPayload] = None


class ProcessFlowEdge(BaseModel):
    source: str
    target: str


class ProcessFlowNode(BaseModel):
    key: str
    label: str
    status: str
    dependencies: List[str] = Field(default_factory=list)
    step_name: Optional[str] = None


class ProcessFlowState(BaseModel):
    nodes: List[ProcessFlowNode]
    edges: List[ProcessFlowEdge]
    current_iteration: int
    total_iterations: int


class ProjectStatusResponse(BaseModel):
    id: str
    company_name: str
    product_name: str
    title: str
    model: str
    media_type: str
    media_url: str
    status: str
    analysis_progress: float
    analysis_started_at: Optional[datetime] = None
    analysis_completed_at: Optional[datetime] = None
    analysis_duration_seconds: Optional[float] = None
    current_iteration: Optional[int] = None
    total_iterations: Optional[int] = None
    steps: List[AnalysisStep]
    logs: List[str]
    process_flow: Optional[ProcessFlowState] = None


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
    findings: List[Finding] = Field(default_factory=list)


class LegalViolation(BaseModel):
    reference: Optional[str] = None
    expression: str
    severity: Optional[str] = None


class LegalEvaluation(BaseModel):
    grade: str
    reason: str
    recommendations: Optional[str] = None
    violations: List[LegalViolation] = Field(default_factory=list)
    findings: List[Finding] = Field(default_factory=list)


class RiskMatrix(BaseModel):
    x_axis: str
    y_axis: str
    position: List[int]


class RelatedSubTag(BaseModel):
    name: str
    grade: Optional[str] = None
    reason: Optional[str] = None
    detected_text: Optional[str] = None
    detected_timecode: Optional[str] = None


class RiskTag(BaseModel):
    name: str
    grade: str
    reason: str
    detected_text: Optional[str] = None
    detected_timecode: Optional[str] = None
    related_sub_tags: List[RelatedSubTag] = Field(default_factory=list)


class RiskReport(BaseModel):
    social: SocialEvaluation
    legal: LegalEvaluation
    matrix: RiskMatrix
    note: Optional[str] = None
    tags: List[RiskTag] = Field(default_factory=list)
    burn_risk: Optional[Dict[str, Any]] = None


class FinalReport(BaseModel):
    summary: str
    sections: FinalReportSections
    files: FinalReportFiles
    metadata: Optional[Dict[str, Any]] = None
    risk: RiskReport
    iterations: Optional[List[Dict[str, Any]]] = None


class ProjectReportResponse(BaseModel):
    id: str
    company_name: str
    product_name: str
    title: str
    model: str
    media_type: str
    media_url: str
    final_report: FinalReport


class ProjectSummary(BaseModel):
    id: str
    company_name: str
    product_name: str
    title: str
    model: str
    media_type: str
    media_url: str
    status: str
    analysis_progress: float
    created_at: datetime
    updated_at: datetime


PROCESS_FLOW_TEMPLATE = [
    {"key": "upload", "label": "アップロード", "step": None, "dependencies": []},
    {
        "key": "audio",
        "label": "音声解析",
        "step": "音声文字起こし",
        "dependencies": ["upload"],
    },
    {
        "key": "subtitle",
        "label": "字幕摘出",
        "step": "OCR字幕抽出",
        "dependencies": ["audio"],
    },
    {
        "key": "visual",
        "label": "映像表現",
        "step": "映像解析",
        "dependencies": ["subtitle"],
    },
    {
        "key": "risk-a",
        "label": "リスク分析1",
        "step": "リスク統合",
        "dependencies": ["visual"],
    },
    {
        "key": "risk-b",
        "label": "リスク分析2",
        "step": "リスク統合",
        "dependencies": ["visual"],
    },
    {
        "key": "risk-c",
        "label": "リスク分析3",
        "step": "リスク統合",
        "dependencies": ["visual"],
    },
    {
        "key": "risk-merge",
        "label": "リスク集約",
        "step": "リスク統合",
        "dependencies": ["risk-a", "risk-b", "risk-c"],
    },
    {"key": "report", "label": "レポート生成", "step": None, "dependencies": ["risk-merge"]},
]

PROCESS_FLOW_EDGES = [
    {"source": "upload", "target": "audio"},
    {"source": "audio", "target": "subtitle"},
    {"source": "subtitle", "target": "visual"},
    {"source": "visual", "target": "risk-a"},
    {"source": "visual", "target": "risk-b"},
    {"source": "visual", "target": "risk-c"},
    {"source": "risk-a", "target": "risk-merge"},
    {"source": "risk-b", "target": "risk-merge"},
    {"source": "risk-c", "target": "risk-merge"},
    {"source": "risk-merge", "target": "report"},
]


def build_created_response(project: Project) -> ProjectCreatedResponse:
    """Project モデルから作成レスポンスを生成."""

    return ProjectCreatedResponse(
        id=project.id,
        company_name=project.company_name,
        product_name=project.product_name,
        title=project.title,
        model=project.model,
        file_name=project.file_name,
        media_type=project.media_type,
        media_url=f"/projects/{project.id}/media",
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
        media_type=project.media_type,
        media_url=f"/projects/{project.id}/media",
        status=project.status,
        analysis_progress=project.analysis_progress,
        analysis_started_at=project.analysis_started_at,
        analysis_completed_at=project.analysis_completed_at,
        analysis_duration_seconds=project.analysis_duration_seconds,
        current_iteration=project.current_iteration,
        total_iterations=project.total_iterations,
        steps=steps,
        logs=project.logs,
        process_flow=_build_process_flow(project),
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
        media_type=project.media_type,
        media_url=f"/projects/{project.id}/media",
        final_report=FinalReport(**project.final_report),
    )


def build_project_summaries(projects: List[Project]) -> List[ProjectSummary]:
    summaries: List[ProjectSummary] = []
    for project in projects:
        summaries.append(
            ProjectSummary(
                id=project.id,
                company_name=project.company_name,
                product_name=project.product_name,
                title=project.title,
                model=project.model,
                media_type=project.media_type,
                media_url=f"/projects/{project.id}/media",
                status=project.status,
                analysis_progress=project.analysis_progress,
                created_at=project.created_at,
                updated_at=project.last_updated,
            )
        )
    return summaries


def _build_process_flow(project: Project) -> ProcessFlowState:
    step_status_map = project.step_status.copy()
    current_iter = project.current_iteration or 0
    total_iters = max(project.total_iterations or 0, 1)

    def _status_from_step(step_name: str) -> str:
        if project.status == "failed":
            return "failed"
        state = step_status_map.get(step_name, "pending")
        if state == "running":
            return "running"
        if state == "completed":
            return "completed"
        return "pending"

    def _iteration_status(target: int) -> str:
        if project.status == "failed":
            return "failed"
        if current_iter < target:
            return "pending"
        if current_iter == target and project.status == "analyzing":
            return "running"
        if current_iter >= target:
            return "completed"
        return "pending"

    def _visual_status() -> str:
        base_state = _status_from_step("映像解析")
        if project.status == "failed":
            return "failed"
        if project.status == "completed":
            return base_state
        if current_iter < total_iters:
            return "running"
        return base_state

    def _risk_merge_status() -> str:
        if project.status == "failed":
            return "failed"
        if current_iter == 0:
            return "pending"
        step_state = step_status_map.get("リスク統合")
        if current_iter < total_iters:
            return "running"
        if step_state == "completed":
            return "completed"
        if project.status == "completed":
            return "completed"
        return "running"

    iteration_targets = {"risk-a": 1, "risk-b": 2, "risk-c": 3}

    nodes: List[ProcessFlowNode] = []
    for template in PROCESS_FLOW_TEMPLATE:
        key = template["key"]
        step_name = template.get("step")
        dependencies = template.get("dependencies", [])
        if key == "upload":
            node_status = "completed" if project.analysis_started else "pending"
        elif key == "visual":
            node_status = _visual_status()
        elif key in iteration_targets:
            node_status = _iteration_status(iteration_targets[key])
        elif key == "risk-merge":
            node_status = _risk_merge_status()
        elif key == "report":
            if project.status == "completed":
                node_status = "completed"
            elif project.status == "failed":
                node_status = "failed"
            elif project.status == "analyzing" and current_iter >= total_iters:
                node_status = "running"
            else:
                node_status = "pending"
        elif step_name:
            node_status = _status_from_step(step_name)
        else:
            node_status = "pending"
        nodes.append(
            ProcessFlowNode(
                key=key,
                label=template["label"],
                status=node_status,
                dependencies=dependencies,
                step_name=step_name,
            )
        )
    edges = [ProcessFlowEdge(**edge) for edge in PROCESS_FLOW_EDGES]
    return ProcessFlowState(
        nodes=nodes,
        edges=edges,
        current_iteration=current_iter,
        total_iterations=total_iters,
    )
