"""RiskAssessor.calculate_burn_risk のユニットテスト."""

from __future__ import annotations

from backend.models.risk_assessor import RiskAssessor


def _build_assessor() -> RiskAssessor:
    assessor = RiskAssessor.__new__(RiskAssessor)  # type: ignore[misc]
    assessor.tag_risk_map = {"タグA": 5, "危険表現": 3}
    return assessor


def test_calculate_burn_risk_enriches_details() -> None:
    assessor = _build_assessor()
    tags = [
        {
            "name": "タグA",
            "risk_level": 5,
            "detected_text": "テロップA",
            "reason": "差別的な強調表現",
            "related_sub_tags": [
                {
                    "name": "危険表現",
                    "risk_level": 3,
                    "detected_text": "字幕B",
                    "reason": "攻撃的な表現"
                },
                {
                    "risk_level": 4,
                    "detected_text": "匿名字幕",
                    "reason": ""
                }
            ]
        }
    ]

    profile = assessor.calculate_burn_risk(tags)

    assert profile["count"] == 3
    assert profile["label"].startswith("炎上リスク")
    details = profile["details"]
    assert len(details) == 3

    tag_entry = next(detail for detail in details if detail["type"] == "tag")
    assert tag_entry["name"] == "タグA"
    assert tag_entry["detected_text"] == "テロップA"
    assert tag_entry["reason"] == "差別的な強調表現"

    sub_entry = next(
        detail for detail in details if detail["type"] == "subtag" and detail["name"] == "危険表現"
    )
    assert sub_entry["parent_tag"] == "タグA"
    assert sub_entry["detected_text"] == "字幕B"
    assert sub_entry["reason"] == "攻撃的な表現"

    anonymous_entry = next(
        detail for detail in details if detail["type"] == "subtag" and detail["name"].startswith("SUBTAG_")
    )
    assert anonymous_entry["parent_tag"] == "タグA"
    assert anonymous_entry["detected_text"] == "匿名字幕"
