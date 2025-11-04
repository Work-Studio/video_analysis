"""FastAPI エンドポイントの E2E テスト."""

import asyncio
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from ..app import app, store


@pytest.mark.asyncio
async def test_project_pipeline_flow() -> None:
    """アップロードからレポート取得までの基本フローを検証."""

    await store.reset()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        files = {"video_file": ("demo.mp4", b"fake video data", "video/mp4")}
        data = {
            "company_name": "テスト企業",
            "product_name": "テスト商品",
            "title": "デモ案件",
            "model": "default",
        }

        create_resp = await client.post("/projects", data=data, files=files)
        assert create_resp.status_code == 200
        created_payload = create_resp.json()
        project_id = created_payload["id"]
        assert created_payload["company_name"] == "テスト企業"
        assert created_payload["product_name"] == "テスト商品"

        analyze_resp = await client.post(f"/projects/{project_id}/analyze")
        assert analyze_resp.status_code == 200

        status_payload = None
        for _ in range(50):
            status_resp = await client.get(f"/projects/{project_id}/analysis-status")
            assert status_resp.status_code == 200
            status_payload = status_resp.json()
            if status_payload["status"] == "completed":
                break
            await asyncio.sleep(0.1)

        assert status_payload is not None
        assert status_payload["status"] == "completed"
        assert status_payload["analysis_progress"] == pytest.approx(1.0)
        assert len(status_payload["steps"]) == 4

        report_resp = await client.get(f"/projects/{project_id}/report")
        assert report_resp.status_code == 200
        report_data = report_resp.json()
        assert "summary" in report_data["final_report"]
        sections = report_data["final_report"]["sections"]
        assert "transcription" in sections
        assert "ocr" in sections
        assert "video_analysis" in sections

        files_info = report_data["final_report"]["files"]
        transcription_path = Path(files_info["transcription"])
        ocr_path = Path(files_info["ocr"])
        video_path = Path(files_info["video_analysis"])
        risk_path = Path(files_info["risk_assessment"])

        for path in (transcription_path, ocr_path, video_path, risk_path):
            assert path.exists(), f"Expected file to exist: {path}"

        risk = report_data["final_report"]["risk"]
        assert "social" in risk
        assert "legal" in risk
        assert "matrix" in risk
