"""フィードバックシステムのAPIエンドポイント."""

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends

from backend.repositories.feedback_repository import FeedbackRepository
from backend.schemas.feedback_schema import (
    AnalysisFeedbackRequest,
    AnalysisFeedbackResponse,
    AnalysisMetricsRequest,
    AnalysisMetricsResponse,
    CustomCaseRequest,
    CustomCaseResponse,
    PromptImprovementRequest,
    PromptImprovementResponse,
    TagFeedbackResponse,
)
from backend.routers.auth import get_current_user, TokenData


router = APIRouter(prefix="/api/feedback", tags=["feedback"])

# リポジトリのシングルトンインスタンス
feedback_repo = FeedbackRepository()


# ============= Analysis Feedback Endpoints =============

@router.post("/analysis", response_model=AnalysisFeedbackResponse)
async def create_analysis_feedback(
    request: AnalysisFeedbackRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """
    分析結果のフィードバックを作成（管理者のみ）.

    - プロジェクトの分析結果に対する全体評価
    - 個々のタグ検出結果の修正
    - 品質スコアの記録
    """
    try:
        # 実際のユーザーIDを使用（ここでは仮でNone）
        user_id = None  # TODO: current_user から取得

        response = feedback_repo.create_analysis_feedback(request, created_by=user_id)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create feedback: {str(e)}")


@router.get("/analysis/{feedback_id}", response_model=AnalysisFeedbackResponse)
async def get_analysis_feedback(
    feedback_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """フィードバックIDから分析フィードバックを取得."""
    feedback = feedback_repo.get_analysis_feedback(feedback_id)

    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    return feedback


@router.get("/analysis/project/{project_id}", response_model=List[AnalysisFeedbackResponse])
async def get_project_feedbacks(
    project_id: str,
    current_user: TokenData = Depends(get_current_user)
):
    """プロジェクトの全フィードバックを取得."""
    try:
        feedbacks = feedback_repo.get_feedbacks_by_project(project_id)
        return feedbacks
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get feedbacks: {str(e)}")


@router.get("/analysis/{feedback_id}/tags", response_model=List[TagFeedbackResponse])
async def get_tag_feedbacks(
    feedback_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """フィードバックIDから全タグフィードバックを取得."""
    try:
        tag_feedbacks = feedback_repo.get_tag_feedbacks(feedback_id)
        return tag_feedbacks
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get tag feedbacks: {str(e)}")


# ============= Custom Cases Endpoints =============

@router.post("/cases", response_model=CustomCaseResponse)
async def create_custom_case(
    request: CustomCaseRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """
    カスタムケースを追加（管理者のみ）.

    - 検出した表現やリスクの事例を学習データとして追加
    - 承認後にAIの学習に使用される
    """
    try:
        user_id = None  # TODO: current_user から取得
        response = feedback_repo.create_custom_case(request, created_by=user_id)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create case: {str(e)}")


@router.post("/cases/{case_id}/approve")
async def approve_custom_case(
    case_id: int,
    current_user: TokenData = Depends(get_current_user)
):
    """カスタムケースを承認（管理者のみ）."""
    success = feedback_repo.approve_custom_case(case_id)

    if not success:
        raise HTTPException(status_code=404, detail="Case not found")

    return {"status": "approved", "case_id": case_id}


@router.get("/cases/approved", response_model=List[CustomCaseResponse])
async def get_approved_cases(
    tag_name: Optional[str] = None,
    limit: int = 10,
    current_user: TokenData = Depends(get_current_user)
):
    """承認済みのカスタムケースを取得."""
    try:
        cases = feedback_repo.get_approved_cases(tag_name=tag_name, limit=limit)
        return cases
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get cases: {str(e)}")


# ============= Prompt Improvements Endpoints =============

@router.post("/prompts", response_model=PromptImprovementResponse)
async def create_prompt_improvement(
    request: PromptImprovementRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """
    プロンプト改善を記録（管理者のみ）.

    - 改善前後のプロンプトを記録
    - 効果スコアを追跡
    """
    try:
        user_id = None  # TODO: current_user から取得
        response = feedback_repo.create_prompt_improvement(request, created_by=user_id)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create improvement: {str(e)}")


@router.get("/prompts", response_model=List[PromptImprovementResponse])
async def get_prompt_improvements(
    tag_name: Optional[str] = None,
    current_user: TokenData = Depends(get_current_user)
):
    """プロンプト改善履歴を取得."""
    try:
        improvements = feedback_repo.get_prompt_improvements(tag_name=tag_name)
        return improvements
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get improvements: {str(e)}")


# ============= Analysis Metrics Endpoints =============

@router.post("/metrics", response_model=AnalysisMetricsResponse)
async def create_analysis_metrics(
    request: AnalysisMetricsRequest,
    current_user: TokenData = Depends(get_current_user)
):
    """
    分析メトリクスを記録.

    - 精度（Precision）、再現率（Recall）、F1スコア
    - 一貫性スコア
    - False Positive/Negative カウント
    """
    try:
        response = feedback_repo.create_analysis_metrics(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create metrics: {str(e)}")


@router.get("/metrics/project/{project_id}", response_model=List[AnalysisMetricsResponse])
async def get_project_metrics(
    project_id: str,
    current_user: TokenData = Depends(get_current_user)
):
    """プロジェクトの全メトリクスを取得."""
    try:
        metrics = feedback_repo.get_metrics_by_project(project_id)
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get metrics: {str(e)}")


@router.get("/metrics/average")
async def get_average_metrics(
    days: int = 30,
    current_user: TokenData = Depends(get_current_user)
):
    """
    過去N日間の平均メトリクスを取得.

    - デフォルトは30日間
    - システム全体の精度傾向を把握
    """
    try:
        avg_metrics = feedback_repo.get_average_metrics(days=days)
        return avg_metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get average metrics: {str(e)}")
