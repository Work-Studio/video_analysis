# AI精度向上実装計画書

## 目的
広告動画分析における炎上リスク検出の精度を向上させ、一貫性のある結果を提供する。

## 現状の課題
1. **一貫性の欠如**: 同じ動画でも毎回微妙に異なる結果
2. **検出文言のばらつき**: 同じリスクでも表現が変わる
3. **フィードバックループの不在**: 精度改善のメカニズムがない
4. **品質評価の不足**: 分析結果の良し悪しを定量化できない

## 解決アプローチ

### 3つの柱
1. **構造化出力の強制** (一貫性向上)
2. **フィードバックループ** (継続的学習)
3. **ルールベース補強** (安定性向上)

---

## Phase 1: 基盤構築 (Week 1-2)

### 1.1 データベース設計 ✅
- [database_schema.sql](backend/database_schema.sql) 作成完了
- フィードバック、学習データ、メトリクス保存

### 1.2 Pydanticスキーマ定義
**目的**: AIの出力を厳密に型定義し、ばらつきを減らす

```python
# backend/schemas/risk_schema.py
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Literal
from enum import Enum

class RiskGrade(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"
    NA = "N/A"

class Finding(BaseModel):
    timecode: str = Field(..., description="タイムコード (mm:ss) または '静止画'")
    detail: str = Field(..., description="問題となる表現の要約", min_length=10, max_length=500)
    severity: Optional[RiskGrade] = Field(None, description="この発見の深刻度")

    @validator('timecode')
    def validate_timecode(cls, v):
        if v == "静止画":
            return v
        # mm:ss形式の検証
        parts = v.split(":")
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            return v
        raise ValueError(f"Invalid timecode format: {v}")

class SubTag(BaseModel):
    name: str = Field(..., description="サブタグ名")
    grade: Optional[RiskGrade] = Field(None, description="グレード")
    detected_text: Optional[str] = Field(None, description="検出されたテキスト", max_length=500)
    detected_timecode: Optional[str] = Field(None, description="検出されたタイムコード")
    reason: Optional[str] = Field(None, description="検出理由", min_length=20, max_length=1000)

class RiskTag(BaseModel):
    name: str = Field(..., description="タグ名")
    grade: RiskGrade = Field(..., description="リスクグレード A-E")
    detected_text: Optional[str] = Field(None, description="検出されたテキスト", max_length=500)
    detected_timecode: Optional[str] = Field(None, description="検出されたタイムコード")
    reason: str = Field(..., description="検出理由の詳細説明", min_length=50, max_length=2000)
    related_sub_tags: List[SubTag] = Field(default_factory=list, description="関連サブタグ")
    confidence_score: Optional[float] = Field(None, ge=0.0, le=1.0, description="検出の信頼度")

class SocialRisk(BaseModel):
    grade: RiskGrade = Field(..., description="社会的リスクグレード")
    reason: str = Field(..., description="グレード判定の理由", min_length=100)
    summary: Optional[str] = Field(None, description="要約", max_length=500)
    findings: List[Finding] = Field(default_factory=list)

class LegalRisk(BaseModel):
    grade: RiskGrade = Field(..., description="法的リスクグレード")
    reason: str = Field(..., description="グレード判定の理由", min_length=100)
    summary: Optional[str] = Field(None, description="要約", max_length=500)
    recommendations: Optional[str] = Field(None, description="推奨事項")
    violations: List[dict] = Field(default_factory=list)
    findings: List[Finding] = Field(default_factory=list)

class RiskAssessmentResponse(BaseModel):
    social: SocialRisk
    legal: LegalRisk
    tags: List[RiskTag] = Field(default_factory=list)
    matrix: dict = Field(default_factory=dict)
    note: Optional[str] = None
    burn_risk: Optional[dict] = None
    confidence_overall: Optional[float] = Field(None, ge=0.0, le=1.0)
```

### 1.3 Langfuse統合
**目的**: プロンプトバージョニング、トレーシング、メトリクス収集

```python
# backend/utils/langfuse_client.py
from langfuse import Langfuse
from functools import wraps
import os

langfuse = Langfuse(
    public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
    secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
    host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
)

def trace_risk_assessment(func):
    """リスク評価関数をトレースするデコレーター"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        trace = langfuse.trace(
            name="risk_assessment",
            metadata={
                "project_id": kwargs.get("project_id"),
                "model": kwargs.get("model", "unknown")
            }
        )

        try:
            result = await func(*args, **kwargs, trace=trace)
            trace.update(output=result, level="DEFAULT")
            return result
        except Exception as e:
            trace.update(level="ERROR", status_message=str(e))
            raise
        finally:
            langfuse.flush()

    return wrapper
```

---

## Phase 2: フィードバックループ実装 (Week 3-4)

### 2.1 管理者用フィードバックUI

#### バックエンドAPI
```python
# backend/routers/feedback.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from backend.routers.auth import TokenData, require_admin

router = APIRouter(prefix="/feedback", tags=["feedback"])

class TagFeedbackItem(BaseModel):
    tag_name: str
    sub_tag_name: Optional[str]
    original_grade: Optional[str]
    corrected_grade: Optional[str]
    original_timecode: Optional[str]
    corrected_timecode: Optional[str]
    original_reason: Optional[str]
    corrected_reason: Optional[str]
    action: str  # 'keep', 'modify', 'delete', 'add'

class AnalysisFeedback(BaseModel):
    project_id: str
    analysis_version: str
    feedback_type: str  # 'approve', 'modify', 'reject'
    overall_quality_score: int  # 1-5
    notes: Optional[str]
    tag_feedbacks: List[TagFeedbackItem]

@router.post("/submit")
async def submit_feedback(
    feedback: AnalysisFeedback,
    admin_user: TokenData = Depends(require_admin)
):
    """管理者が分析結果のフィードバックを送信"""
    # 1. フィードバックをDBに保存
    # 2. 学習データとして蓄積
    # 3. プロンプト改善のトリガー
    pass

@router.get("/projects/{project_id}/corrections")
async def get_corrections(
    project_id: str,
    admin_user: TokenData = Depends(require_admin)
):
    """プロジェクトの修正内容を取得"""
    pass
```

#### フロントエンド画面
```typescript
// frontend/src/app/admin/feedback/[projectId]/page.tsx
// 管理者専用: 分析結果の修正画面

interface FeedbackEditorProps {
  project: ProjectReportResponse;
  originalTags: RiskTag[];
}

export default function FeedbackEditor({ project, originalTags }: FeedbackEditorProps) {
  const [tags, setTags] = useState(originalTags);
  const [qualityScore, setQualityScore] = useState(3);

  // タグの追加
  const handleAddTag = (newTag: RiskTag) => { ... };

  // タグの削除
  const handleDeleteTag = (tagId: string) => { ... };

  // タグの修正
  const handleModifyTag = (tagId: string, updates: Partial<RiskTag>) => { ... };

  // フィードバック送信
  const handleSubmitFeedback = async () => {
    const feedback = {
      project_id: project.id,
      feedback_type: 'modify',
      overall_quality_score: qualityScore,
      tag_feedbacks: buildTagFeedbacks(originalTags, tags)
    };

    await submitFeedback(feedback);
  };

  return (
    <div>
      <h1>分析結果の修正</h1>

      {/* 全体評価 */}
      <section>
        <label>分析品質スコア (1-5)</label>
        <input type="range" min="1" max="5" value={qualityScore}
               onChange={(e) => setQualityScore(Number(e.target.value))} />
      </section>

      {/* タグ編集リスト */}
      <section>
        {tags.map(tag => (
          <TagEditor
            key={tag.name}
            tag={tag}
            onModify={(updates) => handleModifyTag(tag.name, updates)}
            onDelete={() => handleDeleteTag(tag.name)}
          />
        ))}
        <button onClick={() => handleAddTag(...)}>+ 新しいタグを追加</button>
      </section>

      <button onClick={handleSubmitFeedback}>フィードバックを送信</button>
    </div>
  );
}
```

### 2.2 動的プロンプト改善システム

```python
# backend/services/prompt_optimizer.py
from typing import List, Dict
import json
from pathlib import Path

class PromptOptimizer:
    """フィードバックに基づいてプロンプトを動的に改善"""

    def __init__(self, db_conn):
        self.db = db_conn
        self.prompt_templates = self._load_templates()

    def build_enhanced_prompt(self, tag_name: str, base_context: dict) -> str:
        """
        フィードバックデータを基に強化されたプロンプトを生成

        戦略:
        1. 成功事例の追加
        2. 誤検出パターンの除外ルール追加
        3. 文脈キーワードの強調
        """
        # 過去の成功事例を取得
        successful_cases = self._get_successful_cases(tag_name)

        # 誤検出パターンを取得
        false_positive_patterns = self._get_false_positive_patterns(tag_name)

        # 検出パターンを取得
        detection_patterns = self._get_detection_patterns(tag_name)

        enhanced_context = {
            **base_context,
            "successful_examples": successful_cases,
            "avoid_patterns": false_positive_patterns,
            "detection_rules": detection_patterns
        }

        return self._render_prompt(tag_name, enhanced_context)

    def _get_successful_cases(self, tag_name: str) -> List[Dict]:
        """承認された成功事例を取得"""
        query = """
            SELECT case_description, detected_expressions, video_content_summary
            FROM custom_cases
            WHERE tag_name = ? AND is_approved = 1
            ORDER BY created_at DESC
            LIMIT 5
        """
        return self.db.execute(query, (tag_name,)).fetchall()

    def _get_false_positive_patterns(self, tag_name: str) -> List[str]:
        """誤検出されやすいパターンを取得"""
        query = """
            SELECT DISTINCT original_reason
            FROM tag_feedback
            WHERE tag_name = ? AND action = 'delete'
            AND feedback_id IN (
                SELECT id FROM analysis_feedback WHERE feedback_type = 'modify'
            )
        """
        results = self.db.execute(query, (tag_name,)).fetchall()
        return [r[0] for r in results if r[0]]

    def _get_detection_patterns(self, tag_name: str) -> List[Dict]:
        """効果的な検出パターンを取得"""
        query = """
            SELECT detection_pattern, context_keywords, weight
            FROM tag_detection_patterns
            WHERE tag_name = ? AND is_active = 1
            ORDER BY (success_count * 1.0 / NULLIF(success_count + failure_count, 0)) DESC
            LIMIT 10
        """
        return self.db.execute(query, (tag_name,)).fetchall()
```

### 2.3 一貫性スコアリング

```python
# backend/services/consistency_checker.py
from difflib import SequenceMatcher
from typing import List, Dict
import statistics

class ConsistencyChecker:
    """複数回の分析結果の一貫性をチェック"""

    def calculate_consistency_score(
        self,
        results: List[Dict]
    ) -> Dict[str, float]:
        """
        複数回の分析結果から一貫性スコアを計算

        Returns:
            {
                "tag_consistency": 0.0-1.0,  # タグ検出の一貫性
                "grade_consistency": 0.0-1.0,  # グレード判定の一貫性
                "text_similarity": 0.0-1.0,  # 理由文の類似度
                "overall": 0.0-1.0
            }
        """
        if len(results) < 2:
            return {"overall": 1.0}

        # タグ名の一貫性
        tag_sets = [set(r.get("tags", {}).keys()) for r in results]
        tag_consistency = self._jaccard_similarity_multi(tag_sets)

        # グレードの一貫性
        grade_consistency = self._grade_consistency(results)

        # 理由文の類似度
        text_similarity = self._text_similarity_multi(results)

        overall = statistics.mean([
            tag_consistency,
            grade_consistency,
            text_similarity
        ])

        return {
            "tag_consistency": tag_consistency,
            "grade_consistency": grade_consistency,
            "text_similarity": text_similarity,
            "overall": overall
        }

    def _jaccard_similarity_multi(self, sets: List[set]) -> float:
        """複数セットのJaccard類似度"""
        if not sets:
            return 0.0
        intersection = sets[0].intersection(*sets[1:])
        union = sets[0].union(*sets[1:])
        return len(intersection) / len(union) if union else 0.0

    def _grade_consistency(self, results: List[Dict]) -> float:
        """グレード判定の一貫性"""
        social_grades = [r.get("social", {}).get("grade") for r in results if r.get("social")]
        legal_grades = [r.get("legal", {}).get("grade") for r in results if r.get("legal")]

        social_consistency = len(set(social_grades)) == 1 if social_grades else 0.0
        legal_consistency = len(set(legal_grades)) == 1 if legal_grades else 0.0

        return (social_consistency + legal_consistency) / 2

    def _text_similarity_multi(self, results: List[Dict]) -> float:
        """理由文の類似度（ペアワイズ平均）"""
        reasons = [r.get("social", {}).get("reason", "") for r in results]
        reasons = [r for r in reasons if r]

        if len(reasons) < 2:
            return 1.0

        similarities = []
        for i in range(len(reasons)):
            for j in range(i + 1, len(reasons)):
                sim = SequenceMatcher(None, reasons[i], reasons[j]).ratio()
                similarities.append(sim)

        return statistics.mean(similarities) if similarities else 0.0
```

---

## Phase 3: 出力最適化 (Week 5)

### 3.1 構造化出力の強制

```python
# backend/models/gemini_client.py に追加

async def generate_structured(
    self,
    prompt: str,
    response_schema: Type[BaseModel],
    **kwargs
) -> BaseModel:
    """
    Pydanticスキーマを使用して構造化出力を強制

    Gemini の response_schema パラメータを使用
    """
    generation_config = {
        "response_mime_type": "application/json",
        "response_schema": response_schema.model_json_schema()
    }

    response = await self.model.generate_content_async(
        prompt,
        generation_config=generation_config,
        **kwargs
    )

    # JSONパースとバリデーション
    try:
        data = json.loads(response.text)
        return response_schema.model_validate(data)
    except Exception as e:
        logger.error(f"Structured output validation failed: {e}")
        raise
```

### 3.2 リスク評価の改善版

```python
# backend/models/risk_assessor.py に追加

async def assess_with_feedback(
    self,
    *,
    transcript: str,
    ocr_text: str,
    video_summary: Dict,
    project_id: Optional[str] = None
) -> RiskAssessmentResponse:
    """
    フィードバック学習を活用したリスク評価

    改善点:
    1. Pydantic スキーマで構造化出力
    2. 過去のフィードバックを反映したプロンプト
    3. 一貫性チェックのための複数回実行
    4. 信頼度スコアの付与
    """
    # プロンプトオプティマイザーを使用
    optimizer = PromptOptimizer(self.db)

    # タグごとに強化されたコンテキストを構築
    enhanced_prompts = {}
    for tag_name in self.tag_structure.keys():
        enhanced_prompts[tag_name] = optimizer.build_enhanced_prompt(
            tag_name,
            {
                "transcript": transcript,
                "ocr_text": ocr_text,
                "video_summary": video_summary
            }
        )

    # 構造化出力で評価実行
    result = await self.gemini_client.generate_structured(
        prompt=self._build_assessment_prompt(enhanced_prompts),
        response_schema=RiskAssessmentResponse
    )

    # 信頼度スコアを計算
    result.confidence_overall = self._calculate_confidence(result)

    # Langfuseにトレース記録
    if project_id:
        self._log_to_langfuse(project_id, result)

    return result
```

---

## 実装の優先順位

### 必須 (Week 1-2)
1. ✅ データベーススキーマ作成
2. Pydanticスキーマ定義 ([backend/schemas/risk_schema.py](backend/schemas/risk_schema.py))
3. データベースマイグレーション実行
4. 基本的なフィードバックAPI ([backend/routers/feedback.py](backend/routers/feedback.py))

### 重要 (Week 3-4)
5. 管理者用フィードバックUI (フロントエンド)
6. プロンプトオプティマイザー実装
7. 一貫性チェッカー実装
8. Langfuse統合

### 推奨 (Week 5+)
9. 自動的なプロンプト改善ループ
10. A/Bテスト機能
11. ダッシュボードでの精度可視化

---

## メトリクス定義

### 測定する指標

1. **精度 (Precision)**
   - 検出したタグのうち、正しいものの割合
   - `正しく検出 / (正しく検出 + 誤検出)`

2. **再現率 (Recall)**
   - 実際に存在するリスクのうち、検出できた割合
   - `正しく検出 / (正しく検出 + 見逃し)`

3. **F1スコア**
   - PrecisionとRecallの調和平均
   - `2 × (Precision × Recall) / (Precision + Recall)`

4. **一貫性スコア (Consistency)**
   - 同じ入力に対する出力の安定性
   - 0.0 (完全にばらばら) ~ 1.0 (完全に一致)

5. **信頼度スコア (Confidence)**
   - AIが自身の出力に対して持つ確信度
   - 0.0 (不確実) ~ 1.0 (確実)

---

## 次のステップ

1. データベースマイグレーションの実行
2. Pydanticスキーマファイルの作成
3. フィードバックAPIエンドポイントの実装
4. 管理者用UI画面の作成

どこから始めますか？
