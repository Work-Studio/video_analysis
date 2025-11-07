"""FastAPI エントリポイント."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import List

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
from fastapi.responses import FileResponse

from dotenv import load_dotenv

from backend.models.gemini_client import GeminiClient
from backend.models.risk_assessor import RiskAssessor
from backend.pipeline import AnalysisPipeline
from backend.schemas.project_schema import (
    ProjectCreatedResponse,
    ProjectReportResponse,
    ProjectSummary,
    ProjectStatusResponse,
    build_created_response,
    build_project_summaries,
    build_report_response,
    build_status_response,
)
from backend.utils.media_utils import detect_media_type, guess_mime_type
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

load_dotenv(BASE_DIR / ".env", override=True)
load_dotenv(BASE_DIR.parent / ".env", override=True)

store = ProjectStore()
gemini_client = GeminiClient()
risk_assessor = RiskAssessor(
    gemini_client,
    social_case_path=SOCIAL_CASE_PATH,
    social_tag_path=SOCIAL_TAG_PATH,
    legal_reference_path=LEGAL_REFERENCE_PATH,
    tag_list_path=SOCIAL_TAG_PATH,
)
analysis_pipeline = AnalysisPipeline(
    store=store,
    gemini_client=gemini_client,
    risk_assessor=risk_assessor,
)


def _sanitize_component(value: str, default: str) -> str:
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
    safe_company = _sanitize_component(company_name, "company")
    safe_product = _sanitize_component(product_name, "product")
    safe_title = _sanitize_component(title, "project")
    base_folder_name = "_".join(
        filter(None, [safe_company, safe_product, safe_title])
    ) or project_id
    project_dir = UPLOAD_DIR / base_folder_name
    suffix = 1
    while project_dir.exists():
        candidate_name = f"{base_folder_name}_{suffix:02d}"
        project_dir = UPLOAD_DIR / candidate_name
        suffix += 1
    project_dir.mkdir(parents=True, exist_ok=True)
    sanitized_name = video_file.filename.replace("/", "_")
    output_path = project_dir / sanitized_name
    media_type = detect_media_type(video_file.content_type, sanitized_name)

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
        media_type=media_type,
    )

    return build_created_response(project)


@app.get("/projects", response_model=List[ProjectSummary])
async def list_projects() -> List[ProjectSummary]:
    """分析済みプロジェクトの一覧を取得."""

    projects = await store.list_projects()
    return build_project_summaries(projects)


@app.get("/projects/{project_id}/media")
async def get_project_media(project_id: str) -> FileResponse:
    """プロジェクトの元メディアを返却."""

    try:
        project = await store.get_project(project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail="プロジェクトが存在しません。") from exc

    media_path = project.video_path
    if not media_path.exists():
        raise HTTPException(status_code=404, detail="メディアファイルが存在しません。")

    return FileResponse(
        media_path,
        media_type=guess_mime_type(media_path),
        filename=media_path.name,
    )


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
