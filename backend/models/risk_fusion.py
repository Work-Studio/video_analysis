"""分析結果を統合してリスクスコアを算出するモジュール."""

from typing import Dict


def fuse(transcript: str, ocr_text: str, apollo_result: Dict[str, str]) -> Dict[str, object]:
    """各モジュールの結果を統合し、法務リスクと社会的リスクを推定する."""

    # 本実装ではダミー計算を行う。実利用時には適切なルールやモデルに置き換える。
    combined_text = "\n".join([transcript, ocr_text, apollo_result.get("summary", "")])
    length_factor = min(len(combined_text) / 1000, 1)
    legal_score = round(0.4 + 0.3 * length_factor, 2)
    social_score = round(0.5 + 0.4 * length_factor, 2)

    return {
        "summary": (
            "全体的にリスクは中程度。"
            "内容と字幕に軽微なトーンの揺れが確認されました。"
        ),
        "scores": {"legal": legal_score, "social": social_score},
        "combined_preview": combined_text[:500],
    }
