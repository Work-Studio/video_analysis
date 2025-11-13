"""Langfuseに初期プロンプトを登録するスクリプト."""

import os
from dotenv import load_dotenv

# .envファイルを読み込み
load_dotenv()

def setup_prompts():
    """Langfuseに初期プロンプトを登録."""
    print("🚀 Langfuseプロンプトセットアップを開始...")

    try:
        from langfuse import Langfuse
    except ImportError:
        print("❌ langfuseがインストールされていません")
        print("   pip install langfuse を実行してください")
        return False

    # Langfuseクライアントを初期化
    client = Langfuse(
        public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
        secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
        host=os.getenv("LANGFUSE_HOST", "https://us.cloud.langfuse.com")
    )

    print("✅ Langfuseクライアント初期化完了")

    # 1. リスク評価プロンプト
    print("\n📝 プロンプト 1/3: risk-assessment を登録中...")
    risk_assessment_prompt = """You are a compliance analyst for Japanese media content.
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
- Legal References: {{legal_references}}"""

    try:
        client.create_prompt(
            name="risk-assessment",
            prompt=risk_assessment_prompt,
            labels=["production"],
            config={
                "model": "gemini-2.0-flash-exp",
                "temperature": 0.1,
            }
        )
        print("✅ risk-assessment プロンプト登録完了")
    except Exception as e:
        print(f"⚠️  risk-assessment プロンプト登録エラー: {e}")
        print("   既に存在する場合は無視してください")

    # 2. タグスクリーニングプロンプト
    print("\n📝 プロンプト 2/3: tag-screening を登録中...")
    tag_screening_prompt = """あなたは日本の広告コンプライアンスの専門家です。
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
}"""

    try:
        client.create_prompt(
            name="tag-screening",
            prompt=tag_screening_prompt,
            labels=["production"],
            config={
                "model": "gemini-2.0-flash-exp",
                "temperature": 0.1,
            }
        )
        print("✅ tag-screening プロンプト登録完了")
    except Exception as e:
        print(f"⚠️  tag-screening プロンプト登録エラー: {e}")
        print("   既に存在する場合は無視してください")

    # 3. サブタグ評価プロンプト
    print("\n📝 プロンプト 3/3: sub-tag-assessment を登録中...")
    sub_tag_prompt = """あなたは日本の広告コンプライアンスの専門家です。
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
]"""

    try:
        client.create_prompt(
            name="sub-tag-assessment",
            prompt=sub_tag_prompt,
            labels=["production"],
            config={
                "model": "gemini-2.0-flash-exp",
                "temperature": 0.1,
            }
        )
        print("✅ sub-tag-assessment プロンプト登録完了")
    except Exception as e:
        print(f"⚠️  sub-tag-assessment プロンプト登録エラー: {e}")
        print("   既に存在する場合は無視してください")

    print("\n🎉 全てのプロンプト登録が完了しました！")
    print("   Langfuseダッシュボード (https://us.cloud.langfuse.com) の")
    print("   Prompts セクションで確認してください")

    client.flush()
    return True


if __name__ == "__main__":
    setup_prompts()
