"""Gemini を用いたリスクアセスメント."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional
import statistics

import pandas as pd

from backend.models.gemini_client import GeminiClient


class RiskAssessor:
    """社会的感度と法務リスクを Gemini で評価する."""

    def __init__(
        self,
        gemini_client: GeminiClient,
        *,
        social_case_path: Path,
        social_tag_path: Path,
        legal_reference_path: Path,
        tag_list_path: Path,
    ) -> None:
        self.gemini_client = gemini_client
        self.social_case_digest = self._load_excel_digest(social_case_path, "炎上事例")
        self.social_tag_digest = self._load_excel_digest(social_tag_path, "タグリスト")
        self.legal_digest = self._load_excel_digest(legal_reference_path, "法務リスト")
        self.tag_structure = self._load_tag_structure(tag_list_path)
        self.tag_structure_json = json.dumps(self.tag_structure, ensure_ascii=False)
        self.tag_structure_summary = self._build_tag_summary(self.tag_structure)
        self.tag_risk_map = self._build_tag_risk_map(self.tag_structure)

    async def assess(
        self,
        *,
        transcript: str,
        ocr_text: str,
        video_summary: Dict[str, object],
    ) -> Dict[str, object]:
        """Gemini にコンテキストを渡してリスク判定を取得."""

        video_segments_text = json.dumps(video_summary, ensure_ascii=False, indent=2)

        instruction = (
            "You are a compliance analyst for Japanese media content. "
            "Given the supplied transcript, OCR subtitles, structured video summary, "
            "and the reference knowledge bases (social cases, tag taxonomy, legal guidelines), "
            "evaluate the risk from two perspectives: Social Sensitivity and Legal Compliance. "
            "Do not cite specific past case titles; instead, explain the core themes or risk factors from the references. "
            "Return JSON using the following schema strictly:\n"
            "{\n"
            '  "social": {\n'
            '    "grade": "A|B|C|D|E",\n'
            '    "reason": "<Japanese explanation connecting core issues to the supplied content and references without naming specific historical cases>",\n'
            '    "findings": [\n'
            '      {"timecode": "<mm:ss または 静止画>", "detail": "<問題となる表現の要約>"}\n'
            '    ]\n'
            "  },\n"
            '  "legal": {\n'
            '    "grade": "抵触していない|抵触する可能性がある|抵触している",\n'
            '    "reason": "<Japanese explanation referencing the law list. When grade is not \'抵触していない\', clearly describe which expressions or depictions may violate which guideline.>",\n'
            '    "recommendations": "<Specific improvement proposals in Japanese>",\n'
            '    "violations": [\n'
            '      {"reference": "<law or guideline from the legal list>", "expression": "<具体的な文言・表現手法>", "severity": "高|中|低"}\n'
            "    ],\n"
            '    "findings": [\n'
            '      {"timecode": "<mm:ss または 静止画>", "detail": "<潜在的な抵触要因の説明>"}\n'
            "    ]\n"
            "  },\n"
            '  "matrix": {\n'
            '    "x_axis": "法務評価",\n'
            '    "y_axis": "社会的感度",\n'
            '    "position": [<xIndex 0-2>, <yIndex 0-4>]\n'
            "  },\n"
            '  "tags": [\n'
            '    {\n'
            '      "name": "<タグ1名>",\n'
            '      "grade": "A|B|C|D|E",\n'
            '      "reason": "<Japanese explanation focusing on the core reason this category is a risk>",\n'
            '      "related_sub_tags": [\n'
            '        {"name": "<サブタグ名>", "grade": "A|B|C|D|E", "reason": "<簡潔な説明>"}\n'
            '      ]\n'
            '    }\n'
            '  ]\n'
            "}\n"
            "Include only sub-tags that are relevant to the detected risk. "
            "Grades must strictly follow the enumerated values. Ensure `position` indexes correspond to the grade levels (0 best). "
            "Always reference the approximate timecode of the problematic expression using mm:ss format. If precise timing is not available, use '静止画' or 'N/A'."
        )

        content_blocks = (
            "## Transcript\n"
            f"{transcript[:5000]}\n\n"
            "## OCR\n"
            f"{ocr_text[:5000]}\n\n"
            "## Video Segments\n"
            f"{video_segments_text}\n\n"
            "## Tag Taxonomy (JSON)\n"
            f"{self.tag_structure_json}\n\n"
            "## Tag Taxonomy Summary\n"
            f"{self.tag_structure_summary}\n\n"
            "## Social Sensitivity Cases Digest\n"
            f"{self.social_case_digest}\n\n"
            "## Social Tag List Digest\n"
            f"{self.social_tag_digest}\n\n"
            "## Legal Reference Digest\n"
            f"{self.legal_digest}\n"
        )

        response = await self.gemini_client.generate_structured_judgement(
            instruction, content_blocks
        )

        def _normalize_findings(payload: object) -> List[dict]:
            findings: List[dict] = []
            if isinstance(payload, list):
                for item in payload:
                    if not isinstance(item, dict):
                        continue
                    detail = str(item.get("detail", "")).strip()
                    timecode = str(item.get("timecode", "N/A")).strip() or "N/A"
                    if detail:
                        findings.append({"timecode": timecode, "detail": detail})
            return findings

        social = response.get("social")
        if isinstance(social, dict):
            social["findings"] = _normalize_findings(social.get("findings"))
        legal = response.get("legal")
        if isinstance(legal, dict):
            violations = legal.get("violations")
            if isinstance(violations, list):
                normalized_violations: List[dict] = []
                for violation in violations:
                    if not isinstance(violation, dict):
                        continue
                    normalized_violations.append(
                        {
                            "reference": violation.get("reference"),
                            "expression": violation.get("expression", ""),
                            "severity": violation.get("severity"),
                        }
                    )
                legal["violations"] = normalized_violations
            else:
                legal["violations"] = []
            legal["findings"] = _normalize_findings(legal.get("findings"))
        tags = response.get("tags")
        if isinstance(tags, list):
            filtered_tags: List[dict] = []
            for tag in tags:
                if not isinstance(tag, dict):
                    continue
                tag.setdefault("detected_text", "")
                tag.setdefault("related_sub_tags", [])
                tag_name = str(tag.get("name", ""))
                if tag_name:
                    tag["risk_level"] = self.tag_risk_map.get(tag_name)
                sub_tags = tag.get("related_sub_tags")
                if isinstance(sub_tags, list):
                    normalized_subs: List[dict] = []
                    for sub_tag in sub_tags:
                        if not isinstance(sub_tag, dict):
                            continue
                        sub_tag.setdefault("detected_text", "")
                        sub_name = str(sub_tag.get("name", ""))
                        if sub_name:
                            sub_tag["risk_level"] = self.tag_risk_map.get(sub_name)
                        normalized_subs.append(sub_tag)
                    tag["related_sub_tags"] = normalized_subs
                filtered_tags.append(tag)
            response["tags"] = filtered_tags
        else:
            response["tags"] = []
        return response

    def _load_excel_digest(self, path: Path, label: str) -> str:
        """Excel の内容を簡潔なテキストに変換する."""

        if not path.exists():
            return f"{label}: 参照ファイルが見つかりません ({path})."

        df = pd.read_excel(path)
        preview_rows = df.head(20)
        return f"{label}:\n{preview_rows.to_csv(index=False)}"

    @staticmethod
    def _parse_risk_value(value: object) -> Optional[int]:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None
        if numeric <= 0:
            return None
        risk = int(round(numeric))
        if 1 <= risk <= 5:
            return risk
        return None

    def _load_tag_structure(self, path: Path) -> List[Dict[str, object]]:
        """タグリストを階層構造で読み込む."""

        if not path.exists():
            return []

        df = pd.read_excel(path, header=0, usecols=[0, 1, 2])
        df.columns = ["tag", "definition", "risk"]

        structure: List[Dict[str, object]] = []
        current_tag: Optional[Dict[str, object]] = None
        parsing_subtags = False

        for _, row in df.iterrows():
            tag = row["tag"]
            definition = row.get("definition")
            risk_value = self._parse_risk_value(row.get("risk"))

            if pd.isna(tag):
                parsing_subtags = False
                current_tag = None
                continue

            tag = str(tag).strip()
            if tag == "タグ1":
                continue

            if str(definition).strip() == "定義":
                parsing_subtags = True
                current_tag = next(
                    (item for item in structure if item["name"] == tag),
                    None,
                )
                if current_tag is None:
                    current_tag = {"name": tag, "definition": "", "sub_tags": [], "risk": risk_value}
                    structure.append(current_tag)
                else:
                    if risk_value is not None:
                        current_tag["risk"] = risk_value
                if "sub_tags" not in current_tag:
                    current_tag["sub_tags"] = []
                continue

            if not parsing_subtags:
                structure.append({
                    "name": tag,
                    "definition": str(definition) if not pd.isna(definition) else "",
                    "sub_tags": [],
                    "risk": risk_value,
                })
            else:
                if current_tag is None:
                    continue
                current_tag.setdefault("sub_tags", []).append(
                    {
                        "name": tag,
                        "definition": str(definition) if not pd.isna(definition) else "",
                        "risk": risk_value,
                    }
                )

        return structure

    @staticmethod
    def _build_tag_summary(structure: List[Dict[str, object]]) -> str:
        lines: List[str] = []
        for tag in structure:
            name = tag.get("name", "不明タグ")
            definition = tag.get("definition", "")
            if definition:
                lines.append(f"- {name}: {definition}")
            else:
                lines.append(f"- {name}")
            sub_tags = tag.get("sub_tags") or []
            if sub_tags:
                examples = ", ".join(sub.get("name", "") for sub in sub_tags[:6] if sub.get("name"))
                if examples:
                    lines.append(f"  サブタグ例: {examples}")
        return "\n".join(lines)

    @staticmethod
    def _build_tag_risk_map(structure: List[Dict[str, object]]) -> Dict[str, int]:
        risk_map: Dict[str, int] = {}
        for tag in structure:
            name = str(tag.get("name", ""))
            risk = tag.get("risk")
            if name and isinstance(risk, int):
                risk_map[name] = risk
            for sub in tag.get("sub_tags", []) or []:
                sub_name = str(sub.get("name", ""))
                sub_risk = sub.get("risk")
                if sub_name and isinstance(sub_risk, int):
                    risk_map[sub_name] = sub_risk
        return risk_map

    @staticmethod
    def _risk_label(value: float) -> str:
        if value <= 1.5:
            return "炎上リスク 極めて高い"
        if value <= 2.5:
            return "炎上リスク 高い"
        if value <= 3.5:
            return "炎上リスク 中程度"
        if value <= 4.5:
            return "炎上リスク やや低い"
        return "炎上リスク 非常に低い"

    @staticmethod
    def _risk_grade(value: float) -> str:
        if value <= 1.5:
            return "E"
        if value <= 2.5:
            return "D"
        if value <= 3.5:
            return "C"
        if value <= 4.5:
            return "B"
        return "A"

    def calculate_burn_risk(self, tags: List[Dict[str, object]]) -> Dict[str, object]:
        if not tags:
            return {"count": 0, "details": []}

        risk_entries: List[Dict[str, object]] = []
        seen: set[str] = set()

        def _clean_text(value: object) -> Optional[str]:
            if value is None:
                return None
            text = str(value).strip()
            return text or None

        def _register(
            *,
            name: Optional[str],
            risk: Optional[int],
            entry_type: str,
            detected_text: Optional[str] = None,
            reason: Optional[str] = None,
            parent_tag: Optional[str] = None,
        ) -> None:
            if risk is None:
                return
            display_name = _clean_text(name)
            if not display_name:
                display_name = f"{entry_type.upper()}_{len(risk_entries) + 1}"
            key = f"{entry_type}:{display_name}"
            if key in seen:
                return
            seen.add(key)
            risk_entries.append(
                {
                    "name": display_name,
                    "risk": risk,
                    "label": self._risk_label(float(risk)),
                    "type": entry_type,
                    "detected_text": _clean_text(detected_text),
                    "reason": _clean_text(reason),
                    "parent_tag": _clean_text(parent_tag) if entry_type == "subtag" else None,
                }
            )

        for tag in tags:
            if not isinstance(tag, dict):
                continue
            raw_tag_name = tag.get("name")
            tag_name = _clean_text(raw_tag_name)
            tag_risk = tag.get("risk_level")
            if tag_risk is None:
                tag_risk = self.tag_risk_map.get(str(tag_name)) if tag_name else None
            _register(
                name=tag_name,
                risk=tag_risk,
                entry_type="tag",
                detected_text=_clean_text(tag.get("detected_text")),
                reason=_clean_text(tag.get("reason")),
            )
            sub_tags = tag.get("related_sub_tags")
            if isinstance(sub_tags, list):
                for sub in sub_tags:
                    if not isinstance(sub, dict):
                        continue
                    sub_name = _clean_text(sub.get("name"))
                    sub_risk = sub.get("risk_level")
                    if sub_risk is None:
                        sub_risk = self.tag_risk_map.get(str(sub_name)) if sub_name else None
                    _register(
                        name=sub_name,
                        risk=sub_risk,
                        entry_type="subtag",
                        detected_text=_clean_text(sub.get("detected_text"))
                        or _clean_text(tag.get("detected_text")),
                        reason=_clean_text(sub.get("reason")) or _clean_text(tag.get("reason")),
                        parent_tag=tag_name,
                    )

        if not risk_entries:
            return {"count": 0, "details": []}

        risks = [entry["risk"] for entry in risk_entries]
        avg = statistics.mean(risks)
        burn_profile = {
            "count": len(risk_entries),
            "average": round(avg, 2),
            "grade": self._risk_grade(avg),
            "label": self._risk_label(avg),
            "min": min(risks),
            "max": max(risks),
            "details": sorted(risk_entries, key=lambda item: item["risk"]),
        }
        return burn_profile
