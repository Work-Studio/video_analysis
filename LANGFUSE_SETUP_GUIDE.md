# Langfuse プロンプト管理セットアップガイド

このガイドでは、Langfuseを使用してCreative Guardの全プロンプトを一元管理する方法を説明します。

## 1. Langfuseアカウントの設定

### 1.1 アカウント作成
1. https://us.cloud.langfuse.com にアクセス
2. アカウントを作成してログイン
3. 新しいプロジェクトを作成（例: "creative-guard"）

### 1.2 APIキーの取得
1. Settings → API Keys に移動
2. "Create new API key" をクリック
3. Public KeyとSecret Keyをコピー

### 1.3 環境変数の設定
`backend/.env` ファイルに以下を追加:

```bash
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxxxxx
LANGFUSE_HOST=https://us.cloud.langfuse.com
```

## 2. プロンプトの登録

Langfuseダッシュボードで以下のプロンプトを作成します:

### 2.1 リスク評価プロンプト (risk-assessment)

**Name:** `risk-assessment`
**Version:** 1
**Type:** Text

**Prompt Template:**
```
You are a compliance analyst for Japanese media content.
Given the supplied transcript, OCR subtitles, structured video summary,
and the reference knowledge bases (social cases, tag taxonomy, legal guidelines),
evaluate the risk from two perspectives: Social Sensitivity and Legal Compliance.
Do not cite specific past case titles; instead, explain the core themes or risk factors from the references.
Return JSON using the following schema strictly:
{
  "social": {
    "grade": "A|B|C|D|E",
    "reason": "<Japanese explanation connecting core issues to the supplied content and references without naming specific historical cases>",
    "findings": [
      {"timecode": "<mm:ss または 静止画>", "detail": "<問題となる表現の要約>"}
    ]
  },
  "legal": {
    "grade": "A|B|C|D|E",
    "reason": "<Japanese explanation of legal concerns or compliance>",
    "recommendations": "<Optional improvement suggestions>",
    "violations": [
      {"reference": "<法律名>", "expression": "<該当表現>", "severity": "高|中|低"}
    ],
    "findings": [
      {"timecode": "<mm:ss または 静止画>", "detail": "<該当表現>"}
    ]
  }
}

# Context:
- Transcript: {{transcript}}
- OCR: {{ocr_text}}
- Video Summary: {{video_segments}}
- Social Cases: {{social_cases}}
- Tag Structure: {{tag_structure}}
- Legal References: {{legal_references}}
```

**Variables:**
- `transcript`: string
- `ocr_text`: string
- `video_segments`: string
- `social_cases`: string
- `tag_structure`: string
- `legal_references`: string

### 2.2 タグスクリーニングプロンプト (tag-screening)

**Name:** `tag-screening`
**Version:** 1
**Type:** Text

**Prompt Template:**
```
あなたは日本の広告コンプライアンスの専門家です。
以下のコンテンツを分析し、指定されたタグに該当する表現があるか判定してください。

# タグ定義
{{tag_definition}}

# 分析対象コンテンツ
- 音声文字起こし: {{transcript}}
- OCR字幕: {{ocr_text}}
- 映像解析: {{video_summary}}

# 参照事例
{{case_examples}}

# 出力フォーマット
該当する表現が見つかった場合、以下のJSON形式で返してください：
{
  "detected": true,
  "grade": "A|B|C|D|E",
  "reason": "検出理由を詳しく説明",
  "detected_text": "該当する具体的な表現",
  "detected_timecode": "タイムコード（動画の場合）",
  "confidence": 0.0-1.0
}

該当しない場合：
{
  "detected": false,
  "reason": "該当しない理由"
}
```

**Variables:**
- `tag_definition`: string
- `transcript`: string
- `ocr_text`: string
- `video_summary`: string
- `case_examples`: string

### 2.3 サブタグ判定プロンプト (sub-tag-assessment)

**Name:** `sub-tag-assessment`
**Version:** 1
**Type:** Text

**Prompt Template:**
```
あなたは日本の広告コンプライアンスの専門家です。
メインタグ「{{main_tag}}」に該当する表現が検出されました。
次に、以下のサブタグについて詳細に判定してください。

# サブタグリスト
{{sub_tag_list}}

# 分析対象コンテンツ
- 音声文字起こし: {{transcript}}
- OCR字幕: {{ocr_text}}
- 映像解析: {{video_summary}}

# 参照事例
{{case_examples}}

# 出力フォーマット
各サブタグについて以下のJSON配列で返してください：
[
  {
    "sub_tag_name": "サブタグ名",
    "detected": true,
    "grade": "A|B|C|D|E",
    "reason": "検出理由",
    "detected_text": "該当表現",
    "detected_timecode": "タイムコード",
    "confidence": 0.0-1.0
  }
]
```

**Variables:**
- `main_tag`: string
- `sub_tag_list`: string
- `transcript`: string
- `ocr_text`: string
- `video_summary`: string
- `case_examples`: string

## 3. コード側での使用方法

### 3.1 プロンプトの取得

```python
from backend.services.langfuse_service import get_langfuse_service

langfuse = get_langfuse_service()

# プロンプトを取得（最新バージョン）
risk_prompt = langfuse.get_prompt("risk-assessment")

# 特定バージョンを取得
risk_prompt_v2 = langfuse.get_prompt("risk-assessment", version=2)
```

### 3.2 変数の置き換え

```python
# プロンプトテンプレートの変数を置き換え
filled_prompt = risk_prompt.replace("{{transcript}}", transcript_text)
filled_prompt = filled_prompt.replace("{{ocr_text}}", ocr_text)
# ... 他の変数も同様
```

### 3.3 トレーシング機能

```python
# トレースを開始
trace_id = langfuse.start_trace(
    name="risk-assessment",
    user_id="project_123",
    metadata={"project_id": "abc123"}
)

# AI呼び出しをログ
langfuse.log_generation(
    name="gemini-risk-eval",
    prompt=filled_prompt,
    model="gemini-2.0-flash-exp",
    completion=response_text,
    metadata={"iteration": 1}
)

# スコアを付与（後からフィードバックとして）
langfuse.score_generation(
    trace_id=trace_id,
    name="quality",
    value=0.85,
    comment="High quality detection"
)
```

## 4. プロンプトのバージョン管理

### 4.1 新しいバージョンの作成
1. Langfuseダッシュボードで該当プロンプトを開く
2. "New Version" をクリック
3. プロンプトを編集して保存
4. バージョン番号が自動的に付与される

### 4.2 A/Bテスト
Langfuseでは複数バージョンのプロンプトを並行してテストできます:

```python
# バージョン1を使用
prompt_v1 = langfuse.get_prompt("risk-assessment", version=1)

# バージョン2を使用
prompt_v2 = langfuse.get_prompt("risk-assessment", version=2)

# 両方を実行して比較
```

### 4.3 プロンプトの自動改善
フィードバックデータを基にプロンプトを改善:

1. Langfuseで過去のトレースと品質スコアを確認
2. 低スコアのケースを分析
3. プロンプトを修正して新バージョンを作成
4. データベースに改善履歴を記録:

```python
from backend.repositories.feedback_repository import FeedbackRepository
from backend.schemas.feedback_schema import PromptImprovementRequest, ImprovementType

repo = FeedbackRepository()
repo.create_prompt_improvement(
    PromptImprovementRequest(
        tag_name="女性表現",
        improvement_type=ImprovementType.EXAMPLE_ADD,
        before_prompt="元のプロンプト...",
        after_prompt="改善後のプロンプト...",
        effectiveness_score=0.75
    )
)
```

## 5. メトリクスとダッシュボード

### 5.1 Langfuseダッシュボードで確認できる情報
- 全トレースの一覧
- プロンプトごとの使用回数
- 平均レスポンス時間
- コスト（トークン数）
- 品質スコアの推移

### 5.2 カスタムメトリクスの追加
```python
langfuse.score_generation(
    trace_id=trace_id,
    name="precision",
    value=0.92
)

langfuse.score_generation(
    trace_id=trace_id,
    name="recall",
    value=0.88
)
```

## 6. トラブルシューティング

### Langfuseに接続できない
- `.env`ファイルのAPIキーが正しいか確認
- `LANGFUSE_ENABLED=true`になっているか確認
- Langfuseがインストールされているか確認: `pip install langfuse`

### プロンプトが取得できない
- Langfuseダッシュボードでプロンプト名が正しいか確認
- プロンプトが公開（Published）状態か確認
- バージョン番号が存在するか確認

### トレースが記録されない
- `langfuse.flush()`を呼び出してバッファをフラッシュ
- ネットワーク接続を確認
- Langfuseのステータスページを確認

## 7. 今後の拡張

### 7.1 Dynamic Few-Shot Learning
- フィードバックから承認された事例を自動的にプロンプトに追加
- ケーススタディの自動選択

### 7.2 プロンプトチェーン
- 複数のプロンプトを連鎖させて高度な分析を実現
- 各ステップをLangfuseでトレース

### 7.3 コスト最適化
- Langfuseのメトリクスを使用してコストを分析
- 高コストなプロンプトを特定して最適化
