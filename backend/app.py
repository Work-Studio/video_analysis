"""FastAPI エントリポイント."""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import aiofiles
from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware

from backend.models.apollo_client import ApolloClient
from backend.models.gemini_client import GeminiClient
from backend.models.risk_assessor import RiskAssessor
from backend.models.whisper_client import WhisperClient
from backend.pipeline import AnalysisPipeline
from backend.schemas.project_schema import (
    ProjectCreatedResponse,
    ProjectReportResponse,
    ProjectStatusResponse,
    build_created_response,
    build_report_response,
    build_status_response,
)
from backend.store import (
    PipelineAlreadyRunningError,
    ProjectNotFoundError,
    ProjectStore,
)


app = FastAPI(title="Video Analysis Pipeline")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
REFERENCE_ROOT = BASE_DIR.parent / "reference"
SOCIAL_CASE_PATH = REFERENCE_ROOT / "炎上" / "viral list" / "炎上事例.xlsx"
SOCIAL_TAG_PATH = REFERENCE_ROOT / "炎上" / "tag_list" / "タグリスト.xlsx"
LEGAL_REFERENCE_PATH = REFERENCE_ROOT / "law" / "JAL　法律リスト.xlsx"

store = ProjectStore()
whisper_client = WhisperClient()
gemini_client = GeminiClient()
apollo_client = None
risk_assessor = RiskAssessor(
    gemini_client,
    social_case_path=SOCIAL_CASE_PATH,
    social_tag_path=SOCIAL_TAG_PATH,
    legal_reference_path=LEGAL_REFERENCE_PATH,
)
analysis_pipeline = AnalysisPipeline(
    store=store,
    whisper_client=whisper_client,
    gemini_client=gemini_client,
    apollo_client=apollo_client,
    risk_assessor=risk_assessor,
)


@app.post("/projects", response_model=ProjectCreatedResponse)
async def create_project(
    company_name: str = Form(...),
    product_name: str = Form(...),
    title: str = Form(...),
    model: str = Form("default"),
    video_file: UploadFile = File(...),
) -> ProjectCreatedResponse:
    """動画ファイルを受け取りプロジェクトを新規作成する."""

    if not video_file.filename:
        raise HTTPException(status_code=400, detail="動画ファイルが指定されていません。")

    project_id = uuid.uuid4().hex
    safe_company = re.sub(r"[^A-Za-z0-9._-]+", "_", company_name.strip()) or "company"
    safe_product = re.sub(r"[^A-Za-z0-9._-]+", "_", product_name.strip()) or "product"
    safe_title = re.sub(r"[^A-Za-z0-9._-]+", "_", title.strip()) or "project"
    project_dir = UPLOAD_DIR / f"{project_id}_{safe_company}_{safe_product}_{safe_title}"
    project_dir.mkdir(parents=True, exist_ok=True)
    sanitized_name = video_file.filename.replace("/", "_")
    output_path = project_dir / sanitized_name

    # 動画ファイルを非同期で保存
    async with aiofiles.open(output_path, "wb") as out_file:
        while chunk := await video_file.read(1024 * 1024):
            await out_file.write(chunk)

    project = await store.create_project(
        project_id=project_id,
        company_name=company_name,
        product_name=product_name,
        title=title,
        video_path=output_path,
        file_name=sanitized_name,
        workspace_dir=project_dir,
        model=model,
    )

    return build_created_response(project)


@app.post("/projects/{project_id}/analyze")
async def start_analysis(
    project_id: str,
    background_tasks: BackgroundTasks,
) -> dict:
    """分析パイプラインをバックグラウンドで起動する."""

    try:
        await store.get_project(project_id)
        await store.mark_pipeline_started(project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail="プロジェクトが存在しません。") from exc
    except PipelineAlreadyRunningError as exc:
        raise HTTPException(status_code=409, detail="分析は既に進行中です。") from exc

    background_tasks.add_task(analysis_pipeline.run, project_id)

    return {"message": "分析を開始しました。", "project_id": project_id}


@app.get(
    "/projects/{project_id}/analysis-status",
    response_model=ProjectStatusResponse,
)
async def get_analysis_status(project_id: str) -> ProjectStatusResponse:
    """進行状況と中間結果を返却する."""

    try:
        project = await store.get_project(project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail="プロジェクトが存在しません。") from exc

    return build_status_response(project)


@app.get("/projects/{project_id}/report", response_model=ProjectReportResponse)
async def get_final_report(project_id: str) -> ProjectReportResponse:
    """最終レポートを取得する."""

    try:
        project = await store.get_project(project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail="プロジェクトが存在しません。") from exc

    if project.final_report is None:
        raise HTTPException(status_code=404, detail="レポートはまだ利用できません。")

    return build_report_response(project)


@app.get("/health")
async def healthcheck() -> dict:
    """簡易ヘルスチェック."""

    return {"status": "ok"}
