"""RiskAssessor 補助ロジックのテスト."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from backend.models.risk_assessor import RiskAssessor


def _build_assessor() -> RiskAssessor:
    assessor = RiskAssessor.__new__(RiskAssessor)  # type: ignore[misc]
    assessor.tag_risk_map = {"タグA": 5, "危険表現": 3}
    assessor.case_reference_rows = []
    assessor.tag_definition_entries = []
    assessor.tag_structure = []
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
                    "reason": "攻撃的な表現",
                },
                {
                    "risk_level": 4,
                    "detected_text": "匿名字幕",
                    "reason": "",
                },
            ],
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
        detail
        for detail in details
        if detail["type"] == "subtag" and detail["name"].startswith("SUBTAG_")
    )
    assert anonymous_entry["parent_tag"] == "タグA"
    assert anonymous_entry["detected_text"] == "匿名字幕"


def test_screen_with_cases_returns_grade_c_or_higher() -> None:
    assessor = _build_assessor()
    assessor.case_reference_rows = [
        {
            "発火要因": "25歳は女の子じゃないという不適切表現",
            "タグ１": "女性表現",
            "細分化タグ": "結婚出産固定観念",
        }
    ]
    assessor.tag_definition_entries = [
        {"name": "女性表現", "definition": "女性に関する差別的表現", "type": "tag", "parent": None},
        {
            "name": "結婚出産固定観念",
            "definition": "結婚や出産を固定観念で語る表現",
            "type": "subtag",
            "parent": "女性表現",
        },
    ]

    hits = assessor._screen_with_cases("25歳は女の子じゃない、と断言するCMです。", "")

    assert hits, "ケース照合で少なくとも1件のタグが検出される想定"
    top_hit = hits[0]
    assert top_hit["name"] == "女性表現"
    assert top_hit["grade"] in {"C", "D", "E"}
    assert top_hit["related_sub_tags"], "細分化タグが含まれるはず"


def test_load_case_reference_rows_reads_excel(tmp_path: Path) -> None:
    assessor = _build_assessor()
    sample_path = tmp_path / "cases.xlsx"
    df = pd.DataFrame(
        [
            {
                "炎上事例 ID": "CASE-1",
                "発火要因": "テスト案件の表現が問題視された",
                "タグ１": "社会リスク",
                "細分化タグ": "モラル",
            }
        ]
    )
    df.to_excel(sample_path, index=False)

    rows = RiskAssessor._load_case_reference_rows(assessor, sample_path)

    assert len(rows) == 1
    assert rows[0]["発火要因"] == "テスト案件の表現が問題視された"
