"""フィードバックシステムのデータベースリポジトリ."""

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from backend.schemas.feedback_schema import (
    AnalysisFeedbackRequest,
    AnalysisFeedbackResponse,
    AnalysisMetricsRequest,
    AnalysisMetricsResponse,
    CustomCaseRequest,
    CustomCaseResponse,
    FeedbackAction,
    FeedbackType,
    PromptImprovementRequest,
    PromptImprovementResponse,
    TagFeedbackRequest,
    TagFeedbackResponse,
)


class FeedbackRepository:
    """フィードバックデータベースアクセス用のリポジトリ."""

    def __init__(self, db_path: str = "backend/creative_guard.db"):
        """Initialize repository with database path."""
        self.db_path = db_path
        self._ensure_db_exists()

    def _ensure_db_exists(self) -> None:
        """データベースファイルが存在することを確認."""
        db_file = Path(self.db_path)
        if not db_file.exists():
            raise FileNotFoundError(f"Database file not found: {self.db_path}")

    def _get_connection(self) -> sqlite3.Connection:
        """データベース接続を取得."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    # ============= Analysis Feedback =============

    def create_analysis_feedback(
        self,
        request: AnalysisFeedbackRequest,
        created_by: Optional[int] = None
    ) -> AnalysisFeedbackResponse:
        """分析フィードバックを作成."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # メインフィードバックを挿入
            cursor.execute(
                """
                INSERT INTO analysis_feedback (
                    project_id, analysis_version, created_by, feedback_type,
                    overall_quality_score, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request.project_id,
                    request.analysis_version,
                    created_by,
                    request.feedback_type.value,
                    request.overall_quality_score,
                    request.notes,
                    datetime.now()
                )
            )

            feedback_id = cursor.lastrowid

            # タグフィードバックを挿入
            for tag_fb in request.tag_feedbacks:
                self._create_tag_feedback(cursor, feedback_id, tag_fb)

            conn.commit()

            return AnalysisFeedbackResponse(
                id=feedback_id,
                project_id=request.project_id,
                analysis_version=request.analysis_version,
                feedback_type=request.feedback_type,
                overall_quality_score=request.overall_quality_score,
                notes=request.notes,
                created_at=datetime.now(),
                tag_feedback_count=len(request.tag_feedbacks)
            )

        finally:
            conn.close()

    def _create_tag_feedback(
        self,
        cursor: sqlite3.Cursor,
        feedback_id: int,
        request: TagFeedbackRequest
    ) -> int:
        """タグフィードバックを作成."""
        cursor.execute(
            """
            INSERT INTO tag_feedback (
                feedback_id, tag_name, sub_tag_name,
                original_grade, corrected_grade,
                original_timecode, corrected_timecode,
                original_reason, corrected_reason,
                action, confidence_score, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                feedback_id,
                request.tag_name,
                request.sub_tag_name,
                request.original_grade.value if request.original_grade else None,
                request.corrected_grade.value if request.corrected_grade else None,
                request.original_timecode,
                request.corrected_timecode,
                request.original_reason,
                request.corrected_reason,
                request.action.value,
                request.confidence_score,
                datetime.now()
            )
        )
        return cursor.lastrowid

    def get_analysis_feedback(self, feedback_id: int) -> Optional[AnalysisFeedbackResponse]:
        """フィードバックIDから分析フィードバックを取得."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT af.*, COUNT(tf.id) as tag_count
                FROM analysis_feedback af
                LEFT JOIN tag_feedback tf ON af.id = tf.feedback_id
                WHERE af.id = ?
                GROUP BY af.id
                """,
                (feedback_id,)
            )
            row = cursor.fetchone()

            if not row:
                return None

            return AnalysisFeedbackResponse(
                id=row["id"],
                project_id=row["project_id"],
                analysis_version=row["analysis_version"],
                feedback_type=FeedbackType(row["feedback_type"]),
                overall_quality_score=row["overall_quality_score"],
                notes=row["notes"],
                created_at=datetime.fromisoformat(row["created_at"]),
                tag_feedback_count=row["tag_count"]
            )

        finally:
            conn.close()

    def get_feedbacks_by_project(self, project_id: str) -> List[AnalysisFeedbackResponse]:
        """プロジェクトIDから全フィードバックを取得."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT af.*, COUNT(tf.id) as tag_count
                FROM analysis_feedback af
                LEFT JOIN tag_feedback tf ON af.id = tf.feedback_id
                WHERE af.project_id = ?
                GROUP BY af.id
                ORDER BY af.created_at DESC
                """,
                (project_id,)
            )
            rows = cursor.fetchall()

            return [
                AnalysisFeedbackResponse(
                    id=row["id"],
                    project_id=row["project_id"],
                    analysis_version=row["analysis_version"],
                    feedback_type=FeedbackType(row["feedback_type"]),
                    overall_quality_score=row["overall_quality_score"],
                    notes=row["notes"],
                    created_at=datetime.fromisoformat(row["created_at"]),
                    tag_feedback_count=row["tag_count"]
                )
                for row in rows
            ]

        finally:
            conn.close()

    def get_tag_feedbacks(self, feedback_id: int) -> List[TagFeedbackResponse]:
        """フィードバックIDから全タグフィードバックを取得."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM tag_feedback
                WHERE feedback_id = ?
                ORDER BY created_at ASC
                """,
                (feedback_id,)
            )
            rows = cursor.fetchall()

            return [
                TagFeedbackResponse(
                    id=row["id"],
                    feedback_id=row["feedback_id"],
                    tag_name=row["tag_name"],
                    sub_tag_name=row["sub_tag_name"],
                    original_grade=row["original_grade"],
                    corrected_grade=row["corrected_grade"],
                    action=FeedbackAction(row["action"]),
                    created_at=datetime.fromisoformat(row["created_at"])
                )
                for row in rows
            ]

        finally:
            conn.close()

    # ============= Custom Cases =============

    def create_custom_case(
        self,
        request: CustomCaseRequest,
        created_by: Optional[int] = None
    ) -> CustomCaseResponse:
        """カスタムケースを作成."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO custom_cases (
                    tag_name, sub_tag_name, case_description,
                    video_content_summary, detected_expressions,
                    risk_level, source_project_id, created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request.tag_name,
                    request.sub_tag_name,
                    request.case_description,
                    request.video_content_summary,
                    request.detected_expressions,
                    request.risk_level.value,
                    request.source_project_id,
                    created_by,
                    datetime.now()
                )
            )

            case_id = cursor.lastrowid
            conn.commit()

            return CustomCaseResponse(
                id=case_id,
                tag_name=request.tag_name,
                sub_tag_name=request.sub_tag_name,
                case_description=request.case_description,
                risk_level=request.risk_level,
                is_approved=False,
                created_at=datetime.now()
            )

        finally:
            conn.close()

    def approve_custom_case(self, case_id: int) -> bool:
        """カスタムケースを承認."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE custom_cases SET is_approved = 1 WHERE id = ?",
                (case_id,)
            )
            conn.commit()
            return cursor.rowcount > 0

        finally:
            conn.close()

    def get_approved_cases(
        self,
        tag_name: Optional[str] = None,
        limit: int = 10
    ) -> List[CustomCaseResponse]:
        """承認済みのカスタムケースを取得."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            if tag_name:
                cursor.execute(
                    """
                    SELECT * FROM custom_cases
                    WHERE is_approved = 1 AND tag_name = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (tag_name, limit)
                )
            else:
                cursor.execute(
                    """
                    SELECT * FROM custom_cases
                    WHERE is_approved = 1
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (limit,)
                )

            rows = cursor.fetchall()

            return [
                CustomCaseResponse(
                    id=row["id"],
                    tag_name=row["tag_name"],
                    sub_tag_name=row["sub_tag_name"],
                    case_description=row["case_description"],
                    risk_level=row["risk_level"],
                    is_approved=bool(row["is_approved"]),
                    created_at=datetime.fromisoformat(row["created_at"])
                )
                for row in rows
            ]

        finally:
            conn.close()

    # ============= Prompt Improvements =============

    def create_prompt_improvement(
        self,
        request: PromptImprovementRequest,
        created_by: Optional[int] = None
    ) -> PromptImprovementResponse:
        """プロンプト改善を記録."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO prompt_improvements (
                    tag_name, sub_tag_name, improvement_type,
                    before_prompt, after_prompt, effectiveness_score,
                    created_by, applied_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request.tag_name,
                    request.sub_tag_name,
                    request.improvement_type.value,
                    request.before_prompt,
                    request.after_prompt,
                    request.effectiveness_score,
                    created_by,
                    datetime.now()
                )
            )

            improvement_id = cursor.lastrowid
            conn.commit()

            return PromptImprovementResponse(
                id=improvement_id,
                tag_name=request.tag_name,
                sub_tag_name=request.sub_tag_name,
                improvement_type=request.improvement_type,
                effectiveness_score=request.effectiveness_score,
                applied_at=datetime.now()
            )

        finally:
            conn.close()

    def get_prompt_improvements(
        self,
        tag_name: Optional[str] = None
    ) -> List[PromptImprovementResponse]:
        """プロンプト改善履歴を取得."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            if tag_name:
                cursor.execute(
                    """
                    SELECT * FROM prompt_improvements
                    WHERE tag_name = ?
                    ORDER BY applied_at DESC
                    """,
                    (tag_name,)
                )
            else:
                cursor.execute(
                    """
                    SELECT * FROM prompt_improvements
                    ORDER BY applied_at DESC
                    LIMIT 100
                    """
                )

            rows = cursor.fetchall()

            return [
                PromptImprovementResponse(
                    id=row["id"],
                    tag_name=row["tag_name"],
                    sub_tag_name=row["sub_tag_name"],
                    improvement_type=row["improvement_type"],
                    effectiveness_score=row["effectiveness_score"],
                    applied_at=datetime.fromisoformat(row["applied_at"])
                )
                for row in rows
            ]

        finally:
            conn.close()

    # ============= Analysis Metrics =============

    def create_analysis_metrics(
        self,
        request: AnalysisMetricsRequest
    ) -> AnalysisMetricsResponse:
        """分析メトリクスを記録."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO analysis_metrics (
                    project_id, analysis_version, precision_score,
                    recall_score, f1_score, consistency_score,
                    false_positive_count, false_negative_count, measured_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request.project_id,
                    request.analysis_version,
                    request.precision_score,
                    request.recall_score,
                    request.f1_score,
                    request.consistency_score,
                    request.false_positive_count,
                    request.false_negative_count,
                    datetime.now()
                )
            )

            metrics_id = cursor.lastrowid
            conn.commit()

            return AnalysisMetricsResponse(
                id=metrics_id,
                project_id=request.project_id,
                analysis_version=request.analysis_version,
                precision_score=request.precision_score,
                recall_score=request.recall_score,
                f1_score=request.f1_score,
                consistency_score=request.consistency_score,
                false_positive_count=request.false_positive_count,
                false_negative_count=request.false_negative_count,
                measured_at=datetime.now()
            )

        finally:
            conn.close()

    def get_metrics_by_project(self, project_id: str) -> List[AnalysisMetricsResponse]:
        """プロジェクトの全メトリクスを取得."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM analysis_metrics
                WHERE project_id = ?
                ORDER BY measured_at DESC
                """,
                (project_id,)
            )
            rows = cursor.fetchall()

            return [
                AnalysisMetricsResponse(
                    id=row["id"],
                    project_id=row["project_id"],
                    analysis_version=row["analysis_version"],
                    precision_score=row["precision_score"],
                    recall_score=row["recall_score"],
                    f1_score=row["f1_score"],
                    consistency_score=row["consistency_score"],
                    false_positive_count=row["false_positive_count"],
                    false_negative_count=row["false_negative_count"],
                    measured_at=datetime.fromisoformat(row["measured_at"])
                )
                for row in rows
            ]

        finally:
            conn.close()

    def get_average_metrics(self, days: int = 30) -> dict:
        """過去N日間の平均メトリクスを取得."""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT
                    AVG(precision_score) as avg_precision,
                    AVG(recall_score) as avg_recall,
                    AVG(f1_score) as avg_f1,
                    AVG(consistency_score) as avg_consistency,
                    SUM(false_positive_count) as total_fp,
                    SUM(false_negative_count) as total_fn,
                    COUNT(*) as total_analyses
                FROM analysis_metrics
                WHERE measured_at >= datetime('now', '-' || ? || ' days')
                """,
                (days,)
            )
            row = cursor.fetchone()

            return {
                "avg_precision": row["avg_precision"],
                "avg_recall": row["avg_recall"],
                "avg_f1": row["avg_f1"],
                "avg_consistency": row["avg_consistency"],
                "total_false_positives": row["total_fp"] or 0,
                "total_false_negatives": row["total_fn"] or 0,
                "total_analyses": row["total_analyses"]
            }

        finally:
            conn.close()
