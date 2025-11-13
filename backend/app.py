"""FastAPI エントリポイント."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import List

import aiofiles
from fastapi import (
    BackgroundTasks,
    Depends,
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
from backend.routers import auth, admin, bulk_upload
from backend.routers.auth import get_current_user, TokenData
from backend.database import get_db


app = FastAPI(title="Video Analysis Pipeline")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(bulk_upload.router)

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


@app.on_event("startup")
async def load_existing_projects():
    """起動時に既存のプロジェクトをストアに読み込む."""
    print("Loading existing projects from uploads directory...")

    if not UPLOAD_DIR.exists():
        print("No uploads directory found.")
        return

    loaded_count = 0
    for project_dir in UPLOAD_DIR.iterdir():
        if not project_dir.is_dir():
            continue

        # プロジェクトIDはディレクトリ名
        project_id = project_dir.name

        # 動画/画像ファイルを探す
        video_files = list(project_dir.glob("*.mp4")) + list(project_dir.glob("*.mov")) + \
                      list(project_dir.glob("*.avi")) + list(project_dir.glob("*.jpg")) + \
                      list(project_dir.glob("*.jpeg")) + list(project_dir.glob("*.png"))

        if not video_files:
            continue

        video_path = video_files[0]

        # final_report.json を読み込む
        final_report_path = project_dir / "final_report.json"
        final_report = None
        if final_report_path.exists():
            try:
                async with aiofiles.open(final_report_path, "r", encoding="utf-8") as f:
                    content = await f.read()
                    final_report = json.loads(content)
            except Exception as e:
                print(f"Failed to load final_report.json for {project_id}: {e}")

        # プロジェクト情報を推測
        # タイトルからcompany_name, product_name, titleを抽出
        parts = project_id.split("_")
        company_name = parts[0] if len(parts) > 0 else "Unknown"
        product_name = parts[1] if len(parts) > 1 else "Unknown"
        title = "_".join(parts[2:]) if len(parts) > 2 else project_id

        # メディアタイプを検出
        media_type = detect_media_type(None, video_path.name)

        # プロジェクトを作成
        try:
            project = await store.create_project(
                project_id=project_id,
                company_name=company_name,
                product_name=product_name,
                title=title,
                video_path=video_path,
                file_name=video_path.name,
                workspace_dir=project_dir,
                model="gemini-2.0-flash-exp",  # デフォルトモデル
                media_type=media_type,
            )

            # 完了状態にマーク
            if final_report:
                await store.mark_pipeline_completed(project_id, final_report)

            loaded_count += 1
            print(f"Loaded project: {project_id}")
        except Exception as e:
            print(f"Failed to load project {project_id}: {e}")

    print(f"Loaded {loaded_count} existing projects.")


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


@app.get("/projects/{project_id}/frame")
async def get_video_frame(project_id: str, timecode: str) -> FileResponse:
    """指定されたタイムコードの最も鮮明なフレーム画像を返却（テロップ検出＆アノテーション付き）."""
    import subprocess
    import tempfile
    import cv2
    import numpy as np
    import easyocr

    try:
        project = await store.get_project(project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail="プロジェクトが存在しません。") from exc

    if project.media_type != "video":
        raise HTTPException(status_code=400, detail="動画ファイルではありません。")

    video_path = project.video_path
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="動画ファイルが存在しません。")

    # タイムコードの検証とフォーマット変換（MM:SS or HH:MM:SS -> seconds）
    try:
        # "MM:SS" or "HH:MM:SS" or "HH:MM:SS.mmm" 形式をサポート
        time_parts = timecode.split(":")
        if len(time_parts) == 2:  # MM:SS
            minutes, seconds = time_parts
            total_seconds = int(minutes) * 60 + float(seconds)
        elif len(time_parts) == 3:  # HH:MM:SS
            hours, minutes, seconds = time_parts
            total_seconds = int(hours) * 3600 + int(minutes) * 60 + float(seconds)
        else:
            raise ValueError("Invalid timecode format")
    except Exception:
        raise HTTPException(status_code=400, detail="タイムコードの形式が不正です。（例: 01:30 or 00:01:30）")

    # 前後0.5秒間（0.1秒間隔）でフレームを抽出
    temp_frames = []
    temp_dir = Path(tempfile.mkdtemp())

    try:
        # 指定時刻の前後0.5秒、0.1秒間隔で11フレーム抽出
        time_offsets = [total_seconds + (i * 0.1) for i in range(-5, 6)]  # -0.5秒 ~ +0.5秒

        for idx, t in enumerate(time_offsets):
            if t < 0:  # 負の時刻はスキップ
                continue

            frame_path = temp_dir / f"frame_{idx:02d}.jpg"
            cmd = [
                "ffmpeg",
                "-ss", str(t),
                "-i", str(video_path),
                "-vframes", "1",
                "-q:v", "2",  # 高品質
                "-y",
                str(frame_path)
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            if result.returncode == 0 and frame_path.exists():
                temp_frames.append(frame_path)

        if not temp_frames:
            raise HTTPException(status_code=500, detail="フレーム抽出に失敗しました。")

        # EasyOCRの初期化（日本語と英語）
        print("Initializing EasyOCR reader...")
        reader = easyocr.Reader(['ja', 'en'], gpu=False)

        # ステップ1: テロップを含むフレームを検出
        frames_with_text = []

        for frame_path in temp_frames:
            try:
                img = cv2.imread(str(frame_path))
                if img is None:
                    continue

                # OCRでテキスト検出
                results = reader.readtext(str(frame_path))

                if results:  # テキストが検出された場合
                    # 鮮明度も計算
                    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
                    sharpness = laplacian.var()

                    frames_with_text.append({
                        'path': frame_path,
                        'sharpness': sharpness,
                        'text_results': results,
                        'text_count': len(results)
                    })
                    print(f"Frame {frame_path.name}: {len(results)} text regions, sharpness: {sharpness:.2f}")

            except Exception as e:
                print(f"Error processing frame {frame_path}: {e}")
                continue

        # ステップ2: テロップ付きフレームの中から最も鮮明なものを選択
        # テロップが検出されなかった場合は全フレームから選択
        if frames_with_text:
            best_frame_info = max(frames_with_text, key=lambda x: x['sharpness'])
            print(f"Selected frame with text: {best_frame_info['text_count']} regions, sharpness: {best_frame_info['sharpness']:.2f}")
        else:
            # テロップなしの場合は鮮明度のみで選択
            print("No text detected, selecting by sharpness only")
            best_sharpness = -1
            best_frame_path = None

            for frame_path in temp_frames:
                try:
                    img = cv2.imread(str(frame_path))
                    if img is None:
                        continue

                    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
                    sharpness = laplacian.var()

                    if sharpness > best_sharpness:
                        best_sharpness = sharpness
                        best_frame_path = frame_path

                except Exception as e:
                    print(f"Error processing frame {frame_path}: {e}")
                    continue

            if best_frame_path is None:
                raise HTTPException(status_code=500, detail="鮮明なフレームが見つかりませんでした。")

            best_frame_info = {
                'path': best_frame_path,
                'sharpness': best_sharpness,
                'text_results': [],
                'text_count': 0
            }

        # ステップ3: 選択されたフレームにテロップ領域をアノテーション
        best_frame = cv2.imread(str(best_frame_info['path']))

        for detection in best_frame_info['text_results']:
            bbox, text, confidence = detection

            # バウンディングボックスの座標を取得
            # bboxは[[x1,y1], [x2,y2], [x3,y3], [x4,y4]]の形式
            points = np.array(bbox, dtype=np.int32)

            # テロップ領域を赤い枠線でハイライト
            cv2.polylines(best_frame, [points], True, (0, 0, 255), 3)

            # テキストラベルを追加（背景付き）
            label = f"{text[:20]}" if len(text) > 20 else text
            label_pos = (int(bbox[0][0]), max(int(bbox[0][1]) - 10, 20))

            # ラベル背景
            (label_w, label_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(best_frame,
                         (label_pos[0], label_pos[1] - label_h - 5),
                         (label_pos[0] + label_w, label_pos[1] + 5),
                         (0, 0, 255), -1)

            # ラベルテキスト（白色）
            cv2.putText(best_frame, label, label_pos,
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

            print(f"Annotated text: {text} (confidence: {confidence:.2f})")

        # ステップ4: アノテーション付き画像を保存
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp_file:
            output_path = Path(tmp_file.name)

        cv2.imwrite(str(output_path), best_frame)

        print(f"Final output: {best_frame_info['text_count']} text regions annotated, sharpness: {best_frame_info['sharpness']:.2f}")

        return FileResponse(
            output_path,
            media_type="image/jpeg",
            filename=f"frame_{timecode.replace(':', '-')}_annotated.jpg",
            background=BackgroundTasks()  # 自動削除
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="フレーム抽出がタイムアウトしました。")
    except Exception as e:
        import traceback
        print(f"Error in frame extraction: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"フレーム抽出中にエラーが発生しました: {str(e)}")
    finally:
        # 一時ファイルをクリーンアップ
        try:
            import shutil as shutil_module
            if temp_dir.exists():
                shutil_module.rmtree(temp_dir)
        except Exception as cleanup_error:
            print(f"Cleanup error: {cleanup_error}")


@app.get("/projects/{project_id}/annotations")
async def get_annotation_analysis(project_id: str) -> dict:
    """注釈分析結果を取得する."""
    try:
        project = await store.get_project(project_id)
        annotation_file = project.workspace_dir / "annotation_analysis.json"

        if annotation_file.exists():
            async with aiofiles.open(annotation_file, "r", encoding="utf-8") as f:
                content = await f.read()
                return json.loads(content)

        return {
            "existing_annotations": [],
            "missing_annotations": []
        }

    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail="プロジェクトが存在しません。")
    except Exception as e:
        print(f"Error loading annotation analysis: {e}")
        raise HTTPException(status_code=500, detail=f"注釈分析結果の取得中にエラーが発生しました: {str(e)}")


@app.get("/projects/{project_id}/tag-frames/{filename}")
async def get_tag_frame(project_id: str, filename: str):
    """タグに関連するフレーム画像を取得する."""
    try:
        project = await store.get_project(project_id)
        frame_path = project.workspace_dir / "tag_frames" / filename

        if not frame_path.exists():
            raise HTTPException(status_code=404, detail="フレーム画像が見つかりません。")

        return FileResponse(frame_path, media_type="image/jpeg")

    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="プロジェクトが存在しません。")
    except Exception as e:
        print(f"Error loading tag frame: {e}")
        raise HTTPException(status_code=500, detail=f"フレーム画像の取得中にエラーが発生しました: {str(e)}")


@app.get("/projects/{project_id}/tag-frames-info")
async def get_tag_frames_info(project_id: str) -> dict:
    """タグフレームの情報を取得する."""
    try:
        project = await store.get_project(project_id)
        frames_info_path = project.workspace_dir / "tag_frames_info.json"

        if frames_info_path.exists():
            async with aiofiles.open(frames_info_path, "r", encoding="utf-8") as f:
                content = await f.read()
                return json.loads(content)

        return {"frames": []}

    except ProjectNotFoundError:
        raise HTTPException(status_code=404, detail="プロジェクトが存在しません。")
    except Exception as e:
        print(f"Error loading tag frames info: {e}")
        raise HTTPException(status_code=500, detail=f"タグフレーム情報の取得中にエラーが発生しました: {str(e)}")


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


@app.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    current_user: TokenData = Depends(get_current_user),
) -> dict:
    """プロジェクトを削除する（認証が必要）."""
    import shutil
    import json
    from datetime import datetime

    try:
        project = await store.get_project(project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail="プロジェクトが存在しません。") from exc

    # 認証済みユーザーであれば誰でも削除可能（削除時のバックアップなし）

    try:
        # プロジェクトファイルの削除
        if project.video_path.exists():
            project.video_path.unlink()

        # プロジェクトディレクトリの削除
        project_dir = project.video_path.parent
        if project_dir.exists() and project_dir.is_dir():
            shutil.rmtree(project_dir)

        # データベースから削除（user_projectsにレコードがあれば削除）
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM user_projects WHERE project_id = ?", (project_id,))
                conn.commit()
        except Exception as db_error:
            print(f"Warning: Failed to delete from user_projects table: {db_error}")

        # ストアから削除
        await store.delete_project(project_id)

        return {"message": "プロジェクトを削除しました。", "project_id": project_id}

    except Exception as e:
        import traceback
        error_detail = f"削除処理中にエラーが発生しました: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/health")
async def healthcheck() -> dict:
    """簡易ヘルスチェック."""

    return {"status": "ok"}
