"""Langfuseのプロンプトを現在の詳細版に更新するスクリプト."""

import os
from dotenv import load_dotenv
from textwrap import dedent

# .envファイルを読み込み
load_dotenv()

def update_risk_assessment_prompt():
    """risk-assessmentプロンプトを現在の詳細版に更新."""
    print("🔄 risk-assessment プロンプトを更新中...")

    try:
        from langfuse import Langfuse
    except ImportError:
        print("❌ langfuseがインストールされていません")
        return False

    # Langfuseクライアントを初期化
    client = Langfuse(
        public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
        secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
        host=os.getenv("LANGFUSE_HOST", "https://us.cloud.langfuse.com")
    )

    # 現在使用している詳細なプロンプト
    detailed_prompt = dedent("""
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
              {"timecode": "<mm:ss.d または 静止画>", "detail": "<問題となる表現の要約>"}
            ]
          },
          "legal": {
            "grade": "抵触していない|抵触する可能性がある|抵触している",
            "reason": "<Japanese explanation referencing the law list. IMPORTANT: If no violations or potential violations are found in the content, grade MUST be '抵触していない'. Only use '抵触する可能性がある' when specific expressions that may violate guidelines are detected. Only use '抵触している' when clear violations are confirmed. When grade is not '抵触していない', clearly describe which expressions or depictions may violate which guideline.>",
            "recommendations": "<Specific improvement proposals in Japanese>",
            "violations": [
              {
                "reference": "<law or guideline from the legal list>",
                "expression": "<音声文字起こし、OCR字幕抽出、または映像解析から検出された具体的な文言・表現手法>",
                "severity": "高|中|低",
                "timecode": "<mm:ss.d または 静止画>"
              }
            ],
            "NOTE": "violations array MUST be empty [] when grade is '抵触していない'. Only include violations when specific legal concerns are identified.",
            "findings": [
              {"timecode": "<mm:ss.d または 静止画>", "detail": "<潜在的な抵触要因の説明>"}
            ]
          },
          "matrix": {
            "x_axis": "法務評価",
            "y_axis": "社会的感度",
            "position": [<xIndex 0-2>, <yIndex 0-4>]
          },
          "tags": [
            {
              "name": "<タグ1名>",
              "grade": "A|B|C|D|E",
              "reason": "<Japanese explanation focusing on the core reason this category is a risk>",
              "detected_text": "<音声文字起こし、OCR字幕抽出、または映像解析から検出された具体的な文言・表現>",
              "detected_timecode": "<mm:ss.d または 静止画>",
              "related_sub_tags": [
                {
                  "name": "<サブタグ名>",
                  "grade": "A|B|C|D|E",
                  "reason": "<簡潔な説明>",
                  "detected_text": "<検出された具体的な文言・表現>",
                  "detected_timecode": "<mm:ss.d または 静止画>"
                }
              ]
            }
          ]
        }
        IMPORTANT REQUIREMENTS:
        1. For EVERY tag and sub-tag detected, you MUST provide:
           - "detected_text": The EXACT phrase, word, or expression from the transcript (音声文字起こし全文), OCR subtitles (OCR字幕抽出全文), or video analysis (映像分析 詳細). This is MANDATORY.
           - "detected_timecode": The specific timecode where this was found in mm:ss.d format (0.1 second precision, e.g., "1:23.5" for 1 minute 23.5 seconds) for videos, or '静止画' for images. This is MANDATORY. ALWAYS include decimal point with one digit precision for accuracy (e.g., "0:05.3", "1:45.8", "2:30.0").
           - "reason": Clear explanation of why this specific text/expression is problematic.

        2. For legal violations, you MUST provide:
           - "expression": The EXACT problematic phrase or expression from the source materials.
           - "timecode": The specific timecode where this violation occurs.

        3. For social findings and legal findings arrays:
           - "detail": Must quote or closely paraphrase the actual problematic content.
           - "timecode": Must specify where in the media this occurs.

        4. Source Priority: Always extract actual text from:
           - 音声文字起こし全文 (Transcript) - for spoken content
           - OCR字幕抽出全文 (OCR) - for on-screen text
           - 映像解析 詳細 (Video Analysis) - for visual elements and scene descriptions

        5. Never use generic placeholders - always provide the actual detected content from the supplied materials.

        Include only sub-tags that are relevant to the detected risk.
        Grades must strictly follow the enumerated values. Ensure `position` indexes correspond to the grade levels (0 best).

        # Context:
        - Transcript: {{transcript}}
        - OCR: {{ocr_text}}
        - Video Summary: {{video_segments}}
        - Social Cases: {{social_cases}}
        - Tag Structure: {{tag_structure}}
        - Legal References: {{legal_references}}
        """).strip()

    try:
        # 新しいバージョンとして作成
        client.create_prompt(
            name="risk-assessment",
            prompt=detailed_prompt,
            labels=["production", "detailed"],
            config={
                "model": "gemini-2.0-flash-exp",
                "temperature": 0.1,
            }
        )
        print("✅ risk-assessment プロンプトを詳細版に更新しました")
        print("   新しいバージョンが作成されました")
    except Exception as e:
        print(f"⚠️  更新エラー: {e}")
        print("   Langfuseダッシュボードで手動で更新してください")

    client.flush()
    print("\n✅ 完了！")
    return True


if __name__ == "__main__":
    update_risk_assessment_prompt()
