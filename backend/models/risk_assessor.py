"""Gemini を用いたリスクアセスメント."""

from __future__ import annotations

import json
import logging
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from textwrap import dedent
from typing import Dict, List, Optional

import pandas as pd

from backend.models.gemini_client import GeminiClient

logger = logging.getLogger(__name__)

GRADE_SCORE_MAP = {"A": 1, "B": 2, "C": 3, "D": 4, "E": 5}


def _grade_to_score(grade: Optional[str]) -> int:
    if not grade:
        return 0
    return GRADE_SCORE_MAP.get(grade, 0)


def _score_to_grade(score: float) -> str:
    if score >= 4.5:
        return "E"
    if score >= 3.5:
        return "D"
    if score >= 2.5:
        return "C"
    if score >= 1.5:
        return "B"
    if score > 0:
        return "A"
    return "N/A"


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
        logger.info(
            "Starting risk assessment: transcript_chars=%d ocr_chars=%d segments=%d",
            len(transcript),
            len(ocr_text),
            len(video_summary.get("segments") or []),
        )

        instruction = dedent(
            """
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
                "grade": "抵触していない|抵触する可能性がある|抵触している",
                "reason": "<Japanese explanation referencing the law list. When grade is not '抵触していない', clearly describe which expressions or depictions may violate which guideline.>",
                "recommendations": "<Specific improvement proposals in Japanese>",
                "violations": [
                  {"reference": "<law or guideline from the legal list>", "expression": "<具体的な文言・表現手法>", "severity": "高|中|低"}
                ],
                "findings": [
                  {"timecode": "<mm:ss または 静止画>", "detail": "<潜在的な抵触要因の説明>"}
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
                  "related_sub_tags": [
                    {"name": "<サブタグ名>", "grade": "A|B|C|D|E", "reason": "<簡潔な説明>"}
                  ]
                }
              ]
            }
            Include only sub-tags that are relevant to the detected risk.
            Grades must strictly follow the enumerated values. Ensure `position` indexes correspond to the grade levels (0 best).
            Always reference the approximate timecode of the problematic expression using mm:ss format. If precise timing is not available, use '静止画' or 'N/A'.
            """
        )

        content_blocks = dedent(
            f"""
            ## Transcript
            {transcript[:5000]}

            ## OCR
            {ocr_text[:5000]}

            ## Video Segments
            {video_segments_text}

            ## Tag Taxonomy (JSON)
            {self.tag_structure_json}

            ## Tag Taxonomy Summary
            {self.tag_structure_summary}

            ## Social Sensitivity Cases Digest
            {self.social_case_digest}

            ## Social Tag List Digest
            {self.social_tag_digest}

            ## Legal Reference Digest
            {self.legal_digest}
            """
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
        logger.info(
            "Gemini response summary: social=%s legal=%s tag_count=%d",
            social.get("grade") if isinstance(social, dict) else "N/A",
            legal.get("grade") if isinstance(legal, dict) else "N/A",
            len(response["tags"]),
        )
        for idx, tag in enumerate(response["tags"][:5]):
            logger.debug(
                "Tag[%d] %s grade=%s detected_text=%s sub_tags=%d",
                idx,
                tag.get("name"),
                tag.get("grade"),
                (tag.get("detected_text") or "")[:80],
                len(tag.get("related_sub_tags") or []),
            )
        return response

    async def assess_with_enrichment(
        self,
        *,
        transcript: str,
        ocr_text: str,
        video_summary: Dict[str, object],
        passes: int = 3
    ) -> Dict[str, object]:
        """複数回の Gemini 実行とタグリスト照合による統合結果を返す."""

        passes = max(1, passes)
        base_results: List[Dict[str, object]] = []
        for attempt in range(passes):
            try:
                result = await self.assess(
                    transcript=transcript,
                    ocr_text=ocr_text,
                    video_summary=video_summary
                )
                base_results.append(result)
            except Exception as exc:  # pragma: no cover
                logger.warning("Gemini assess pass %d failed: %s", attempt + 1, exc)
        if not base_results:
            return await self.assess(
                transcript=transcript,
                ocr_text=ocr_text,
                video_summary=video_summary
            )

        keyword_matches = self._scan_tag_matches(transcript, ocr_text)
        aggregated = self._aggregate_risk_results(base_results, keyword_matches)
        return aggregated

    def _scan_tag_matches(self, transcript: str, ocr_text: str) -> List[Dict[str, object]]:
        combined = f"{transcript}\n{ocr_text}".lower()
        matches: List[Dict[str, object]] = []

        def extract_keywords(definition: Optional[str]) -> List[str]:
            if not definition:
                return []
            tokens = [
                token.strip()
                for token in definition.replace("/", " ").replace("|", " ").replace(",", " ").split()
                if token.strip()
            ]
            return tokens

        def find_keyword(keywords: List[str]) -> Optional[str]:
            for kw in keywords:
                if kw and kw.lower() in combined:
                    return kw
            return None

        for tag in self.tag_structure:
            tag_name = str(tag.get("name", ""))
            definition = tag.get("definition") or ""
            keywords = extract_keywords(definition)
            keyword_hit = find_keyword(keywords)
            sub_tags = tag.get("sub_tags") or []
            related_matches: List[Dict[str, object]] = []

            for sub in sub_tags:
                sub_name = str(sub.get("name", ""))
                sub_keywords = extract_keywords(sub.get("definition"))
                sub_hit = find_keyword(sub_keywords)
                if sub_name and sub_hit:
                    grade = self._risk_grade(float(sub.get("risk") or tag.get("risk") or 3))
                    related_matches.append(
                        {
                            "name": sub_name,
                            "grade": grade,
                            "reason": f"キーワード『{sub_hit}』が検出されました。",
                            "detected_text": sub_hit,
                            "detected_timecode": "N/A"
                        }
                    )

            if tag_name and (keyword_hit or related_matches):
                base_risk = float(tag.get("risk") or 3)
                grade = self._risk_grade(base_risk)
                matches.append(
                    {
                        "name": tag_name,
                        "grade": grade,
                        "reason": (
                            f"キーワード『{keyword_hit or '（サブタグ検出）'}』が検出されたため。"
                            if keyword_hit or related_matches
                            else definition
                        ),
                        "detected_text": keyword_hit or (related_matches[0]["detected_text"] if related_matches else ""),
                        "detected_timecode": "N/A",
                        "related_sub_tags": related_matches
                    }
                )
        logger.info("Keyword scan produced %d matches", len(matches))
        return matches

    def _aggregate_risk_results(
        self,
        base_results: List[Dict[str, object]],
        keyword_matches: List[Dict[str, object]]
    ) -> Dict[str, object]:
        def worst_grade(values: List[str]) -> str:
            return _score_to_grade(max((_grade_to_score(val) for val in values), default=0))

        social_grades = [res.get("social", {}).get("grade") for res in base_results if res.get("social") is not None]
        legal_grades = [res.get("legal", {}).get("grade") for res in base_results if res.get("legal") is not None]
        merged_social = base_results[0].get("social", {}).copy() if base_results[0].get("social") else {}
        merged_legal = base_results[0].get("legal", {}).copy() if base_results[0].get("legal") else {}
        if social_grades:
            merged_social["grade"] = worst_grade([grade for grade in social_grades if grade])
        if legal_grades:
            merged_legal["grade"] = worst_grade([grade for grade in legal_grades if grade])

        def merge_reason(field: str) -> Optional[str]:
            counter: Counter[str] = Counter()
            for res in base_results:
                value = res.get(field, {}).get("reason") if isinstance(res.get(field), dict) else None
                if value:
                    counter[value] += 1
            return counter.most_common(1)[0][0] if counter else None

        social_reason = merge_reason("social")
        legal_reason = merge_reason("legal")
        if social_reason:
            merged_social["reason"] = social_reason
        if legal_reason:
            merged_legal["reason"] = legal_reason

        tag_buckets: Dict[str, Dict[str, object]] = {}

        def get_tag_bucket(tag_name: str) -> Dict[str, object]:
            bucket = tag_buckets.setdefault(
                tag_name,
                {
                    "name": tag_name,
                    "scores": [],
                    "reasons": Counter(),
                    "detected": [],
                    "timecodes": [],
                    "subs": {}
                }
            )
            return bucket

        def ingest_tag(tag_payload: Dict[str, object]) -> None:
            tag_name = tag_payload.get("name")
            if not tag_name:
                return
            bucket = get_tag_bucket(tag_name)
            bucket["scores"].append(_grade_to_score(tag_payload.get("grade")))
            if tag_payload.get("reason"):
                bucket["reasons"][tag_payload["reason"]] += 1
            if tag_payload.get("detected_text"):
                bucket["detected"].append(tag_payload["detected_text"])
            if tag_payload.get("detected_timecode"):
                bucket["timecodes"].append(tag_payload["detected_timecode"])
            subs = bucket.setdefault("subs", {})
            for sub in tag_payload.get("related_sub_tags") or []:
                sub_name = sub.get("name")
                if not sub_name:
                    continue
                sub_bucket = subs.setdefault(
                    sub_name,
                    {
                        "name": sub_name,
                        "scores": [],
                        "reasons": Counter(),
                        "detected": [],
                        "timecodes": []
                    }
                )
                sub_bucket["scores"].append(_grade_to_score(sub.get("grade")))
                if sub.get("reason"):
                    sub_bucket["reasons"][sub["reason"]] += 1
                if sub.get("detected_text"):
                    sub_bucket["detected"].append(sub["detected_text"])
                if sub.get("detected_timecode"):
                    sub_bucket["timecodes"].append(sub["detected_timecode"])

        for result in base_results:
            for tag in result.get("tags") or []:
                ingest_tag(tag)
        for manual_tag in keyword_matches:
            ingest_tag(manual_tag)

        merged_tags: List[Dict[str, object]] = []
        for tag_name, bucket in tag_buckets.items():
            final_grade = _score_to_grade(max(bucket["scores"] or [0]))
            reason = bucket["reasons"].most_common(1)[0][0] if bucket["reasons"] else ""
            detected_text = bucket["detected"][0] if bucket["detected"] else ""
            timecode = bucket["timecodes"][0] if bucket["timecodes"] else None
            related_sub_tags: List[Dict[str, object]] = []
            for sub_name, sub_bucket in bucket.get("subs", {}).items():
                sub_grade = _score_to_grade(max(sub_bucket["scores"] or [0]))
                sub_reason = sub_bucket["reasons"].most_common(1)[0][0] if sub_bucket["reasons"] else ""
                sub_detected = sub_bucket["detected"][0] if sub_bucket["detected"] else ""
                sub_timecode = sub_bucket["timecodes"][0] if sub_bucket["timecodes"] else None
                related_sub_tags.append(
                    {
                        "name": sub_name,
                        "grade": sub_grade,
                        "reason": sub_reason,
                        "detected_text": sub_detected,
                        "detected_timecode": sub_timecode
                    }
                )
            merged_tags.append(
                {
                    "name": tag_name,
                    "grade": final_grade,
                    "reason": reason,
                    "detected_text": detected_text,
                    "detected_timecode": timecode,
                    "related_sub_tags": related_sub_tags
                }
            )

        aggregated = base_results[0].copy()
        aggregated["social"] = merged_social
        aggregated["legal"] = merged_legal
        aggregated["tags"] = merged_tags
        return aggregated

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
        logger.debug("Calculating burn risk from %d tags/subtags", len(tags))

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
        logger.info(
            "Burn risk profile: total_entries=%d avg=%.2f grade=%s",
            burn_profile["count"],
            burn_profile["average"],
            burn_profile["grade"],
        )
        return burn_profile
