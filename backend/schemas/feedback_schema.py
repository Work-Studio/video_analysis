"""フィードバックシステム向けのPydanticスキーマ定義."""

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# ============= Enums =============

class FeedbackType(str, Enum):
    """フィードバックのタイプ."""
    APPROVE = "approve"
    MODIFY = "modify"
    REJECT = "reject"


class FeedbackAction(str, Enum):
    """タグフィードバックのアクション."""
    KEEP = "keep"
    MODIFY = "modify"
    DELETE = "delete"
    ADD = "add"


class GradeLevel(str, Enum):
    """リスクグレード."""
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"


class ImprovementType(str, Enum):
    """プロンプト改善のタイプ."""
    EXAMPLE_ADD = "example_add"
    RULE_ADD = "rule_add"
    CONTEXT_UPDATE = "context_update"


# ============= AI Output Schemas (Structured Output) =============

class StructuredTimecode(BaseModel):
    """タイムコードの構造化された形式."""
    raw: str = Field(..., description="元のタイムコード文字列")
    start_seconds: Optional[float] = Field(None, description="開始時刻（秒）")
    end_seconds: Optional[float] = Field(None, description="終了時刻（秒）")
    is_range: bool = Field(False, description="範囲指定かどうか")

    @field_validator("raw")
    @classmethod
    def validate_timecode_format(cls, v: str) -> str:
        """タイムコード形式のバリデーション."""
        # 基本フォーマット: HH:MM:SS or MM:SS or H:MM
        if not v or not any(char.isdigit() for char in v):
            raise ValueError(f"Invalid timecode format: {v}")
        return v


class StructuredSubTag(BaseModel):
    """サブタグの構造化された形式."""
    name: str = Field(..., min_length=1, description="サブタグ名")
    grade: GradeLevel = Field(..., description="リスクグレード")
    reason: str = Field(..., min_length=10, description="検出理由（最低10文字）")
    detected_text: Optional[str] = Field(None, description="検出されたテキスト")
    detected_timecode: Optional[StructuredTimecode] = Field(None, description="検出タイムコード")
    confidence_score: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="AI信頼度スコア（0-1）"
    )


class StructuredRiskTag(BaseModel):
    """リスクタグの構造化された形式."""
    name: str = Field(..., min_length=1, description="タグ名")
    grade: GradeLevel = Field(..., description="リスクグレード")
    reason: str = Field(..., min_length=20, description="検出理由（最低20文字）")
    detected_text: Optional[str] = Field(None, description="検出されたテキスト")
    detected_timecode: Optional[StructuredTimecode] = Field(None, description="検出タイムコード")
    related_sub_tags: List[StructuredSubTag] = Field(
        default_factory=list,
        description="関連サブタグ"
    )
    confidence_score: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="AI信頼度スコア（0-1）"
    )


class StructuredRiskAssessment(BaseModel):
    """リスク評価の構造化された形式."""
    social_grade: GradeLevel = Field(..., description="社会的リスクグレード")
    social_reason: str = Field(..., min_length=50, description="社会的リスク理由（最低50文字）")
    legal_grade: GradeLevel = Field(..., description="法務リスクグレード")
    legal_reason: str = Field(..., min_length=50, description="法務リスク理由（最低50文字）")
    tags: List[StructuredRiskTag] = Field(..., min_items=0, description="検出されたリスクタグ")
    overall_confidence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="全体の信頼度スコア（0-1）"
    )
    analysis_version: str = Field(..., description="分析実行バージョン")
    model_name: str = Field(..., description="使用したモデル名")


# ============= Feedback Request/Response Schemas =============

class TagFeedbackRequest(BaseModel):
    """タグフィードバックのリクエスト."""
    tag_name: str = Field(..., min_length=1)
    sub_tag_name: Optional[str] = None
    original_grade: Optional[GradeLevel] = None
    corrected_grade: Optional[GradeLevel] = None
    original_timecode: Optional[str] = None
    corrected_timecode: Optional[str] = None
    original_reason: Optional[str] = None
    corrected_reason: Optional[str] = None
    action: FeedbackAction = Field(...)
    confidence_score: Optional[float] = Field(None, ge=0.0, le=1.0)


class AnalysisFeedbackRequest(BaseModel):
    """分析結果フィードバックのリクエスト."""
    project_id: str = Field(..., min_length=1)
    analysis_version: str = Field(...)
    feedback_type: FeedbackType = Field(...)
    overall_quality_score: int = Field(..., ge=1, le=5, description="1-5の品質スコア")
    notes: Optional[str] = None
    tag_feedbacks: List[TagFeedbackRequest] = Field(default_factory=list)


class AnalysisFeedbackResponse(BaseModel):
    """分析結果フィードバックのレスポンス."""
    id: int
    project_id: str
    analysis_version: str
    feedback_type: FeedbackType
    overall_quality_score: int
    notes: Optional[str]
    created_at: datetime
    tag_feedback_count: int


class TagFeedbackResponse(BaseModel):
    """タグフィードバックのレスポンス."""
    id: int
    feedback_id: int
    tag_name: str
    sub_tag_name: Optional[str]
    original_grade: Optional[str]
    corrected_grade: Optional[str]
    action: FeedbackAction
    created_at: datetime


# ============= Learning Data Schemas =============

class CustomCaseRequest(BaseModel):
    """カスタムケース追加リクエスト."""
    tag_name: str = Field(..., min_length=1)
    sub_tag_name: Optional[str] = None
    case_description: str = Field(..., min_length=20, description="ケース説明（最低20文字）")
    video_content_summary: Optional[str] = None
    detected_expressions: Optional[str] = None
    risk_level: GradeLevel = Field(...)
    source_project_id: Optional[str] = None


class CustomCaseResponse(BaseModel):
    """カスタムケースのレスポンス."""
    id: int
    tag_name: str
    sub_tag_name: Optional[str]
    case_description: str
    risk_level: GradeLevel
    is_approved: bool
    created_at: datetime


class PromptImprovementRequest(BaseModel):
    """プロンプト改善リクエスト."""
    tag_name: str = Field(..., min_length=1)
    sub_tag_name: Optional[str] = None
    improvement_type: ImprovementType = Field(...)
    before_prompt: str = Field(..., min_length=10)
    after_prompt: str = Field(..., min_length=10)
    effectiveness_score: Optional[float] = Field(None, ge=0.0, le=1.0)


class PromptImprovementResponse(BaseModel):
    """プロンプト改善のレスポンス."""
    id: int
    tag_name: str
    sub_tag_name: Optional[str]
    improvement_type: ImprovementType
    effectiveness_score: Optional[float]
    applied_at: datetime


# ============= Metrics Schemas =============

class AnalysisMetricsRequest(BaseModel):
    """分析メトリクスの記録リクエスト."""
    project_id: str = Field(..., min_length=1)
    analysis_version: str = Field(...)
    precision_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    recall_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    f1_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    consistency_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    false_positive_count: int = Field(default=0, ge=0)
    false_negative_count: int = Field(default=0, ge=0)


class AnalysisMetricsResponse(BaseModel):
    """分析メトリクスのレスポンス."""
    id: int
    project_id: str
    analysis_version: str
    precision_score: Optional[float]
    recall_score: Optional[float]
    f1_score: Optional[float]
    consistency_score: Optional[float]
    false_positive_count: int
    false_negative_count: int
    measured_at: datetime


# ============= Consistency Check Schemas =============

class ConsistencyCheckResult(BaseModel):
    """一貫性チェック結果."""
    is_consistent: bool = Field(..., description="一貫性があるか")
    variance_score: float = Field(..., ge=0.0, description="分散スコア（低いほど一貫性が高い）")
    differences: List[str] = Field(default_factory=list, description="検出された差異リスト")
    recommendation: str = Field(..., description="推奨アクション")


class MultiRunComparisonResult(BaseModel):
    """複数回実行の比較結果."""
    run_count: int = Field(..., ge=2, description="実行回数")
    average_tag_count: float = Field(..., ge=0.0)
    tag_count_variance: float = Field(..., ge=0.0)
    common_tags: List[str] = Field(default_factory=list, description="全実行で共通するタグ")
    inconsistent_tags: List[str] = Field(default_factory=list, description="実行間で不一致のタグ")
    consistency_score: float = Field(..., ge=0.0, le=1.0, description="一貫性スコア（0-1）")
