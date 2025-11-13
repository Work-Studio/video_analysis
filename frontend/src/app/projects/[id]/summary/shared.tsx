"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

import { ProjectReportResponse, AnnotationAnalysisResponse, TagFramesInfoResponse, getTagFrameUrl } from "@/lib/apiClient";
import { AnnotationDisplay } from "@/components/AnnotationDisplay";

const FALLBACK_DETECTED_TEXT = "検出文言データ未取得";

/**
 * タイムコード文字列を秒数に変換する
 * サポート形式: "mm:ss.d", "hh:mm:ss.d", "0:10.5", "1:23:45.3"
 * 小数点以下は0.1秒単位（例: "1:23.5" = 83.5秒）
 * 静止画の場合は null を返す
 */
function parseTimecode(timecode: string | undefined | null): number | null {
  if (!timecode || timecode === "静止画" || timecode === "N/A") {
    return null;
  }

  const parts = timecode.trim().split(":");
  if (parts.length === 0 || parts.length > 3) {
    return null;
  }

  try {
    // parseFloat を使用して小数点をサポート
    const numbers = parts.map((p) => parseFloat(p));
    if (numbers.some((n) => isNaN(n) || n < 0)) {
      return null;
    }

    if (numbers.length === 2) {
      // mm:ss.d
      const [minutes, seconds] = numbers;
      return minutes * 60 + seconds;
    } else if (numbers.length === 3) {
      // hh:mm:ss.d
      const [hours, minutes, seconds] = numbers;
      return hours * 3600 + minutes * 60 + seconds;
    } else if (numbers.length === 1) {
      // 秒のみ (ss.d)
      return numbers[0];
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two strings
 */
function calculateSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 100;

  const distance = levenshteinDistance(s1.toLowerCase(), s2.toLowerCase());
  const maxLen = Math.max(s1.length, s2.length);
  const similarity = ((maxLen - distance) / maxLen) * 100;

  return similarity;
}

/**
 * Check if two timecodes are within tolerance (in seconds)
 */
function areTimecodesNearby(tc1: string | undefined | null, tc2: string | undefined | null, toleranceSeconds: number): boolean {
  const time1 = parseTimecode(tc1);
  const time2 = parseTimecode(tc2);

  if (time1 === null || time2 === null) return false;

  return Math.abs(time1 - time2) <= toleranceSeconds;
}

/**
 * Get display information for detected source
 */
function getSourceLabel(source: string | undefined): { icon: string; label: string; bgColor: string; textColor: string } {
  switch (source) {
    case "transcript":
      return {
        icon: "🗣️",
        label: "音声",
        bgColor: "bg-blue-100",
        textColor: "text-blue-800"
      };
    case "ocr":
      return {
        icon: "📝",
        label: "テロップ",
        bgColor: "bg-green-100",
        textColor: "text-green-800"
      };
    case "visual":
      return {
        icon: "🎬",
        label: "表現",
        bgColor: "bg-purple-100",
        textColor: "text-purple-800"
      };
    default:
      return {
        icon: "❓",
        label: "不明",
        bgColor: "bg-gray-100",
        textColor: "text-gray-800"
      };
  }
}

type ActionStatusProfile = {
  badge: string;
  description: string;
  bgColor: string;
  textColor: string;
};

type StatusProfile = {
  badge: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  matrixBg: string;
  matrixText: string;
};

type NormalizedLegal = "適切" | "修正検討" | "要修正";
type SocialGrade = "A" | "B" | "C" | "D" | "E";
type RiskTagItem = NonNullable<ProjectReportResponse["final_report"]["risk"]["tags"]>[number];
type RelatedSubTag = NonNullable<RiskTagItem["related_sub_tags"]>[number];

const LEGAL_STATUS_BRIDGE = {
  抵触していない: "適切",
  抵触する可能性がある: "修正検討",
  抵触している: "要修正"
} as const;

const STATUS_PROFILES: Record<NormalizedLegal, Partial<Record<SocialGrade, StatusProfile>>> = {
  適切: {
    A: {
      badge: "🟢 安心領域",
      description: "社会的にも法的にも問題のない表現です",
      badgeBg: "bg-green-600",
      badgeText: "text-white",
      matrixBg: "bg-green-600",
      matrixText: "text-white"
    },
    B: {
      badge: "🟢 安心領域",
      description: "社会的にも法的にも問題のない表現です",
      badgeBg: "bg-green-600",
      badgeText: "text-white",
      matrixBg: "bg-green-600",
      matrixText: "text-white"
    },
    C: {
      badge: "🟡 注意喚起",
      description: "社会的反応に留意が必要。使用前に再確認",
      badgeBg: "bg-yellow-500",
      badgeText: "text-gray-900",
      matrixBg: "bg-yellow-500",
      matrixText: "text-gray-900"
    },
    D: {
      badge: "🟠 危険予兆",
      description: "表現は合法だが、社会的反発の懸念大",
      badgeBg: "bg-orange-600",
      badgeText: "text-white",
      matrixBg: "bg-orange-600",
      matrixText: "text-white"
    },
    E: {
      badge: "🔴 炎上懸念",
      description: "法的には問題なしでも、社会的反発が強く想定されます",
      badgeBg: "bg-red-700",
      badgeText: "text-white",
      matrixBg: "bg-red-700",
      matrixText: "text-white"
    }
  },
  修正検討: {
    A: {
      badge: "🟡 軽微確認",
      description: "軽微な法的確認を推奨。感度面は良好",
      badgeBg: "bg-yellow-500",
      badgeText: "text-gray-900",
      matrixBg: "bg-yellow-500",
      matrixText: "text-gray-900"
    },
    B: {
      badge: "🟡 軽微確認",
      description: "軽微な法的確認を推奨。感度面は良好",
      badgeBg: "bg-yellow-500",
      badgeText: "text-gray-900",
      matrixBg: "bg-yellow-500",
      matrixText: "text-gray-900"
    },
    C: {
      badge: "🟠 要再確認",
      description: "感度・法務ともに軽度リスクあり。共有推奨",
      badgeBg: "bg-orange-500",
      badgeText: "text-white",
      matrixBg: "bg-orange-500",
      matrixText: "text-white"
    },
    D: {
      badge: "🔴 高リスク要相談",
      description: "炎上・法務リスク双方あり。使用前に必ず会議で確認",
      badgeBg: "bg-red-600",
      badgeText: "text-white",
      matrixBg: "bg-red-600",
      matrixText: "text-white"
    },
    E: {
      badge: "🔴 高リスク要相談",
      description: "炎上・法務リスク双方あり。使用前に必ず会議で確認",
      badgeBg: "bg-red-600",
      badgeText: "text-white",
      matrixBg: "bg-red-600",
      matrixText: "text-white"
    }
  },
  要修正: {
    C: {
      badge: "⚫ 掲載不可／再設計要",
      description: "根本的に表現を見直す必要あり",
      badgeBg: "bg-gray-900",
      badgeText: "text-white",
      matrixBg: "bg-gray-900",
      matrixText: "text-white"
    },
    D: {
      badge: "⚫ 掲載不可／再設計要",
      description: "根本的に表現を見直す必要あり",
      badgeBg: "bg-gray-900",
      badgeText: "text-white",
      matrixBg: "bg-gray-900",
      matrixText: "text-white"
    },
    E: {
      badge: "⚫ 使用禁止レベル",
      description: "社会的・法的双方で重大リスク。掲載不可",
      badgeBg: "bg-gray-900",
      badgeText: "text-white",
      matrixBg: "bg-gray-900",
      matrixText: "text-white"
    }
  }
};

const DEFAULT_STATUS_PROFILE: StatusProfile = {
  badge: "🟡 要確認",
  description: "評価結果の組み合わせを確認してください。",
  badgeBg: "bg-yellow-500",
  badgeText: "text-gray-900",
  matrixBg: "bg-gray-500",
  matrixText: "text-white"
};

const MATRIX_X_LABELS = ["抵触していない", "抵触する可能性がある", "抵触している"] as const;
const MATRIX_Y_LABELS = ["E", "D", "C", "B", "A"] as const;

const EVAL_MAP = {
  A: {
    width: 20,
    color: "bg-green-500",
    label: "A (低リスク)",
    borderColor: "border-green-500",
    textColor: "text-green-400",
    chipBg: "bg-emerald-100",
    chipText: "text-emerald-900"
  },
  B: {
    width: 40,
    color: "bg-lime-500",
    label: "B",
    borderColor: "border-lime-500",
    textColor: "text-lime-400",
    chipBg: "bg-lime-100",
    chipText: "text-lime-900"
  },
  C: {
    width: 60,
    color: "bg-yellow-500",
    label: "C",
    borderColor: "border-yellow-500",
    textColor: "text-yellow-400",
    chipBg: "bg-amber-100",
    chipText: "text-amber-900"
  },
  D: {
    width: 80,
    color: "bg-orange-500",
    label: "D",
    borderColor: "border-orange-500",
    textColor: "text-orange-400",
    chipBg: "bg-orange-100",
    chipText: "text-orange-900"
  },
  E: {
    width: 100,
    color: "bg-red-500",
    label: "E (高リスク)",
    borderColor: "border-red-500",
    textColor: "text-red-400",
    chipBg: "bg-rose-100",
    chipText: "text-rose-900"
  },
  "N/A": {
    width: 0,
    color: "bg-gray-500",
    label: "該当なし",
    borderColor: "border-gray-500",
    textColor: "text-gray-400",
    chipBg: "bg-slate-600",
    chipText: "text-slate-200"
  }
} as const;

const EVAL_SCORE = {
  "N/A": 0,
  E: 5,
  D: 4,
  C: 3,
  B: 2,
  A: 1
} as const;

const RISK_DISPLAY_THRESHOLD = 3;

const gradeToScore = (grade?: keyof typeof EVAL_MAP | "N/A") =>
  EVAL_SCORE[(grade as keyof typeof EVAL_SCORE) ?? "N/A"] ?? 0;

const scoreToGrade = (score: number): keyof typeof EVAL_MAP | "N/A" => {
  if (score >= 5) return "E";
  if (score >= 4) return "D";
  if (score >= 3) return "C";
  if (score >= 2) return "B";
  if (score >= 1) return "A";
  return "N/A";
};

const LEGAL_MAP = {
  抵触していない: { borderColor: "border-green-500", textColor: "text-green-500" },
  抵触する可能性がある: { borderColor: "border-yellow-500", textColor: "text-yellow-400" },
  抵触している: { borderColor: "border-red-500", textColor: "text-red-500" }
} as const;

const VIOLATION_SEVERITY_SCORE = {
  低: 1,
  中: 2,
  高: 3
} as const;

function clampLegalGrade(grade: string | undefined): keyof typeof LEGAL_MAP {
  if (grade && grade in LEGAL_MAP) {
    return grade as keyof typeof LEGAL_MAP;
  }
  if (!grade) {
    return "抵触していない";
  }
  const lowered = grade.toLowerCase();
  if (lowered.includes("not") || lowered.includes("safe") || lowered.includes("問題") === false) {
    return "抵触していない";
  }
  if (lowered.includes("violat") || lowered.includes("breach") || grade.includes("抵触している")) {
    return "抵触している";
  }
  if (grade.includes("可能性")) {
    return "抵触する可能性がある";
  }
  // Default to 抵触していない when no clear indication of violations
  return "抵触していない";
}

function deriveLegalGrade(
  rawGrade: string | undefined,
  violations: Array<{ severity?: string | null }>
): keyof typeof LEGAL_MAP {
  // If no violations exist, default to "抵触していない" unless rawGrade explicitly indicates otherwise
  if (!violations || violations.length === 0) {
    return clampLegalGrade(rawGrade);
  }

  let maxSeverity = 0;
  violations.forEach((violation) => {
    const severity = violation?.severity as keyof typeof VIOLATION_SEVERITY_SCORE | undefined;
    const score = severity ? VIOLATION_SEVERITY_SCORE[severity] ?? 0 : 0;
    if (score > maxSeverity) {
      maxSeverity = score;
    }
  });
  if (maxSeverity >= 3) {
    return "抵触している";
  }
  if (maxSeverity >= 2) {
    return "抵触する可能性がある";
  }
  if (maxSeverity >= 1) {
    return "抵触していない";
  }
  return clampLegalGrade(rawGrade);
}

function mapLegalGradeToLegacy(grade: string): string {
  return LEGAL_STATUS_BRIDGE[grade as keyof typeof LEGAL_STATUS_BRIDGE] ?? grade;
}

export function formatSecondsHuman(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "-";
  }
  if (seconds < 1) {
    return `${seconds.toFixed(2)}秒`;
  }
  if (seconds < 60) {
    return seconds < 10 ? `${seconds.toFixed(1)}秒` : `${Math.round(seconds)}秒`;
  }

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours}時間`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}分`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs}秒`);
  }
  return parts.join("");
}

function getStatusProfile(legalGrade: string, socialGrade: string): StatusProfile {
  const normalized = mapLegalGradeToLegacy(legalGrade) as NormalizedLegal;
  const key = socialGrade as SocialGrade;
  const group = STATUS_PROFILES[normalized];
  if (group && group[key]) {
    return group[key] as StatusProfile;
  }
  return DEFAULT_STATUS_PROFILE;
}

const LEGAL_SUMMARY_SUPPLEMENT =
  " 本サービスは広告関連法令・業界自主基準と突き合わせ、潜在的な抵触文言や改善アクションを抽出しています。";

function buildLegalSummaryText(grade: string, summary?: string | null, reason?: string | null): string {
  const parts = [summary, reason]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0);
  if (!parts.length) {
    parts.push(`法務評価は「${grade}」で判定されており、動画内の文言・映像表現が関係法令や業界ガイドラインに照らして適切かを精査しました。`);
  } else {
    parts.push(`総合法務評価は「${grade}」です。`);
  }
  let text = parts.join(" ").replace(/\s+/g, " ").trim();
  const minLen = 200;
  const maxLen = 400;
  while (text.length < minLen) {
    text = `${text}${LEGAL_SUMMARY_SUPPLEMENT}`.replace(/\s+/g, " ").trim();
    if (text.length > maxLen) {
      break;
    }
  }
  if (text.length > maxLen) {
    return `${text.slice(0, maxLen)}…`;
  }
  return text;
}

function resolveActionStatus(legalGrade: string, socialGrade: string): ActionStatusProfile {
  const profile = getStatusProfile(legalGrade, socialGrade);
  return {
    badge: profile.badge,
    description: profile.description,
    bgColor: profile.badgeBg,
    textColor: profile.badgeText
  };
}

function normalizeMatrixPosition(
  rawPosition: number[] | undefined,
  legalGrade: string,
  socialGrade: string
): number[] {
  const position =
    Array.isArray(rawPosition) && rawPosition.length === 2 ? [...rawPosition] : [0, 0];
  const xIndex = MATRIX_X_LABELS.indexOf(legalGrade as (typeof MATRIX_X_LABELS)[number]);
  const yIndex = MATRIX_Y_LABELS.indexOf(socialGrade as (typeof MATRIX_Y_LABELS)[number]);
  if (xIndex >= 0) position[0] = xIndex;
  if (yIndex >= 0) position[1] = yIndex;
  position[0] = Math.min(Math.max(position[0], 0), MATRIX_X_LABELS.length - 1);
  position[1] = Math.min(Math.max(position[1], 0), MATRIX_Y_LABELS.length - 1);
  return position;
}

type MatrixCellProfile = {
  headline: string;
  description: string;
  bgClass: string;
  textClass: string;
};

function resolveMatrixCell(legalGrade: string, socialGrade: string): MatrixCellProfile {
  const profile = getStatusProfile(legalGrade, socialGrade);
  return {
    headline: profile.badge,
    description: profile.description,
    bgClass: profile.matrixBg,
    textClass: profile.matrixText
  };
}

type MatrixViewProps = {
  xLabel: string;
  yLabel: string;
  position: number[];
};

function MatrixView({ xLabel, yLabel, position }: MatrixViewProps) {
  const xLabels = MATRIX_X_LABELS;
  const yLabels = MATRIX_Y_LABELS;
  const [activeX, activeY] = position;
  const gridTemplateColumns = `auto repeat(${xLabels.length}, minmax(0, 1fr))`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="grid text-xs font-semibold text-slate-600" style={{ gridTemplateColumns }}>
          <div className="bg-white" />
          {xLabels.map((label) => (
            <div key={label} className="bg-slate-100 px-2 py-2 text-center text-[11px]">
              {label}
            </div>
          ))}
          {yLabels.map((label, yIdx) => (
            <React.Fragment key={`row-${label}`}>
              <div className="bg-slate-100 px-2 py-6 text-center text-[11px]">{label}</div>
              {xLabels.map((xLabelValue, xIdx) => {
                const isActive = activeX === xIdx && activeY === yIdx;
                const profile = resolveMatrixCell(xLabelValue, label);
                const inactiveClasses = "bg-slate-900 text-slate-400";
                const activeClasses = `${profile.bgClass} ${profile.textClass} border-2 border-amber-300`;
                return (
                  <div
                    key={`${xLabelValue}-${label}`}
                    className={`matrix-cell flex min-h-[90px] items-center justify-center border border-slate-800 p-3 text-[11px] font-semibold transition duration-300 ${
                      isActive ? activeClasses : inactiveClasses
                    }`}
                  >
                    <div className="text-center leading-tight">
                      <span className="block text-xs font-semibold">{profile.headline}</span>
                      {profile.description && (
                        <span className="mt-1 block text-[10px] font-normal">{profile.description}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1 text-[11px] text-slate-500 md:flex-row md:items-center md:justify-between">
        <span>社会的感度基準: {yLabel}</span>
        <span>法務評価基準: {xLabel}</span>
      </div>
    </div>
  );
}

type MediaPreviewProps = {
  mediaType: string;
  src: string;
  onDurationChange?: (duration: number) => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
};

export function MediaPreview({ mediaType, src, onDurationChange, videoRef }: MediaPreviewProps) {
  if (mediaType === "image") {
    return (
      <div className="relative h-[420px] w-full">
        <Image
          src={src}
          alt="アップロードされた画像"
          fill
          unoptimized
          className="object-contain"
          sizes="(max-width: 768px) 100vw, 640px"
        />
      </div>
    );
  }
  return (
    <video
      ref={videoRef}
      key={src}
      controls
      playsInline
      className="max-h-[420px] w-full bg-black"
      src={src}
      onLoadedMetadata={(event) => {
        const media = event.currentTarget;
        if (Number.isFinite(media.duration)) {
          onDurationChange?.(media.duration);
        }
      }}
    >
      お使いのブラウザは動画再生に対応していません。
    </video>
  );
}

type PrintableSummaryProps = {
  report: ProjectReportResponse;
  projectTitle: string;
  companyName: string;
  productName: string;
  orientation: "portrait" | "landscape";
  mediaType: string;
  projectId: string;
  annotations?: AnnotationAnalysisResponse | null;
  tagFramesInfo?: TagFramesInfoResponse | null;
  onSeekToTimecode?: (seconds: number) => void;
};

export function PrintableSummary({
  report,
  projectTitle,
  companyName,
  productName,
  orientation,
  mediaType,
  projectId,
  annotations,
  tagFramesInfo,
  onSeekToTimecode
}: PrintableSummaryProps) {
  // State for manual tag addition
  const [customTags, setCustomTags] = useState<Array<{
    tag: string;
    subTag?: string;
    grade: string;
    expression: string;
    timecode?: string;
    reason?: string;
  }>>([]);
  const [showAddTagForm, setShowAddTagForm] = useState(false);
  const [newTag, setNewTag] = useState({
    tag: "",
    subTag: "",
    grade: "C",
    expression: "",
    timecode: "",
    reason: ""
  });

  const tagAssessments = useMemo<RiskTagItem[]>(() => {
    const tags = report.final_report.risk.tags;
    return Array.isArray(tags) ? (tags as RiskTagItem[]) : [];
  }, [report.final_report.risk.tags]);
  useEffect(() => {
    console.log("=== Tag Assessments Debug ===");
    tagAssessments.forEach((tag, index) => {
      console.log(`Tag ${index} [${tag.name}]`, {
        grade: tag.grade,
        reason: tag.reason,
        detected_text: tag.detected_text,
        sub_tag_count: tag.related_sub_tags?.length ?? 0
      });
      if (Array.isArray(tag.related_sub_tags)) {
        tag.related_sub_tags.forEach((subTag, subIndex) => {
          console.log(`  SubTag ${subIndex} [${subTag.name}]`, {
            grade: subTag.grade,
            detected_text: subTag.detected_text
          });
        });
      }
    });
  }, [tagAssessments]);
  const originalSocialGrade = report.final_report.risk.social.grade;
  const worstTagScore = useMemo(() => {
    const scores: number[] = [];
    tagAssessments.forEach((tag) => {
      scores.push(gradeToScore(tag.grade as keyof typeof EVAL_MAP));
      if (Array.isArray(tag.related_sub_tags)) {
        tag.related_sub_tags.forEach((subTag) => {
          scores.push(gradeToScore(subTag.grade as keyof typeof EVAL_MAP));
        });
      }
    });
    if (!scores.length) {
      return gradeToScore(originalSocialGrade as keyof typeof EVAL_MAP);
    }
    return Math.max(...scores);
  }, [originalSocialGrade, tagAssessments]);
  const socialGrade = scoreToGrade(
    Math.max(gradeToScore(originalSocialGrade as keyof typeof EVAL_MAP), worstTagScore)
  );

  const tagMainMap = useMemo(() => {
    const map = new Map<string, RiskTagItem>();
    tagAssessments.forEach((tag) => map.set(tag.name, tag));
    return map;
  }, [tagAssessments]);
  const subTagLookup = useMemo(() => {
    const map = new Map<string, { parent: RiskTagItem; subTag: RelatedSubTag }>();
    tagAssessments.forEach((tag) => {
      if (Array.isArray(tag.related_sub_tags)) {
        tag.related_sub_tags.forEach((subTag) => {
          if (subTag?.name) {
            map.set(subTag.name, {
              parent: tag,
              subTag: subTag as RelatedSubTag
            });
          }
        });
      }
    });
    return map;
  }, [tagAssessments]);
  const socialFindings = useMemo(() => {
    const findings = report.final_report.risk.social.findings;
    return Array.isArray(findings) ? findings : [];
  }, [report.final_report.risk.social.findings]);
  const legalFindings = useMemo(() => {
    const findings = report.final_report.risk.legal.findings;
    return Array.isArray(findings) ? findings : [];
  }, [report.final_report.risk.legal.findings]);
  const legalViolations = useMemo(() => {
    const violations = report.final_report.risk.legal.violations;
    return Array.isArray(violations) ? violations : [];
  }, [report.final_report.risk.legal.violations]);
  const rawLegalGrade = report.final_report.risk.legal.grade;
  const legalGrade = useMemo(
    () => deriveLegalGrade(rawLegalGrade, legalViolations),
    [rawLegalGrade, legalViolations]
  );
  const socialStyle =
    EVAL_MAP[(socialGrade in EVAL_MAP ? socialGrade : "N/A") as keyof typeof EVAL_MAP];
  const legalStyle =
    LEGAL_MAP[legalGrade as keyof typeof LEGAL_MAP] ?? LEGAL_MAP["抵触する可能性がある"];
  const actionStatus = useMemo(
    () => resolveActionStatus(legalGrade, socialGrade),
    [legalGrade, socialGrade]
  );
  const legalEvidenceItems = useMemo(
    () => {
      const items: Array<{
        id: string;
        label: string;
        timecode: string;
        reference?: string;
        severity?: string;
        type: "finding" | "violation";
      }> = [];
      legalFindings.forEach((finding, index) => {
        items.push({
          id: `finding-${index}`,
          label: (finding.detail || "該当文言").trim(),
          timecode: (finding.timecode && finding.timecode.trim()) || "N/A",
          type: "finding"
        });
      });
      legalViolations.forEach((violation, index) => {
        const timecode = (violation.timecode || "").trim();
        items.push({
          id: `violation-${index}`,
          label: (violation.expression || violation.reference || `論点${index + 1}`).trim(),
          timecode: timecode || "N/A",
          reference: violation.reference,
          severity: violation.severity,
          type: "violation"
        });
      });
      return items;
    },
    [legalFindings, legalViolations]
  );
  const burnRisk = report.final_report.risk.burn_risk;
  const detectSourceLabels = useMemo(() => {
    const normalize = (text?: string | null) =>
      (text ?? "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const sections = [
      { label: "音声文字起こし", normalized: normalize(report.final_report.sections.transcription) },
      { label: "テロップ (OCR)", normalized: normalize(report.final_report.sections.ocr) },
      { label: "映像分析ノート", normalized: normalize(report.final_report.sections.video_analysis) }
    ];
    return (fragment?: string) => {
      const normalizedFragment = normalize(fragment);
      if (!normalizedFragment) {
        return [] as string[];
      }
      return sections
        .filter(
          (section) =>
            section.normalized.length > 0 && section.normalized.includes(normalizedFragment)
        )
        .map((section) => section.label);
    };
  }, [
    report.final_report.sections.transcription,
    report.final_report.sections.ocr,
    report.final_report.sections.video_analysis
  ]);
  const burnRiskDetails = useMemo<BurnRiskDetail[]>(() => {
    if (!burnRisk || !Array.isArray(burnRisk.details)) {
      return [];
    }
    type BaseDetail = {
      name?: string;
      risk: number;
      label?: string;
      type?: string;
      detected_text?: string | null;
      detected_timecode?: string | null;
      reason?: string | null;
      parent_tag?: string | null;
    };
    const normalize = (value?: string | null) => {
      if (typeof value !== "string") {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    return (burnRisk.details as BaseDetail[]).slice(0, 4).map((detail, index) => {
      let detailName = normalize(detail.name) ?? detail.name ?? undefined;
      let detectedText = normalize(detail.detected_text);
      let reason = normalize(detail.reason);
      let parentTag = normalize(detail.parent_tag);
      const detectedTimecode = detail.detected_timecode;

      if (detail.type === "subtag") {
        if (!parentTag && detailName) {
          parentTag = subTagLookup.get(detailName)?.parent.name;
        }
        if ((!detectedText || !reason) && detailName) {
          const lookup = subTagLookup.get(detailName);
          if (lookup) {
            detectedText = detectedText ?? normalize(lookup.subTag.detected_text ?? lookup.parent.detected_text);
            reason = reason ?? normalize(lookup.subTag.reason ?? lookup.parent.reason);
          }
        }
      } else if (detailName) {
        const tag = tagMainMap.get(detailName);
        if (tag) {
          detectedText = detectedText ?? normalize(tag.detected_text);
          reason = reason ?? normalize(tag.reason);
          parentTag = parentTag ?? tag.name;
        }
      }

      if (!detailName) {
        detailName = parentTag ?? `要素 ${index + 1}`;
      }

      return {
        name: detailName,
        risk: detail.risk,
        label: detail.label,
        type: detail.type,
        detectedText,
        detectedTimecode,
        reason,
        parentTag
      };
    });
  }, [burnRisk, subTagLookup, tagMainMap]);
  useEffect(() => {
    console.log("[PrintableSummary] burn risk details", burnRiskDetails);
  }, [burnRiskDetails]);
  const burnRiskCount = burnRisk?.count ?? 0;
  const riskSummaryGridClass = `grid grid-cols-1 gap-4 ${burnRiskCount > 0 ? "md:grid-cols-3" : "md:grid-cols-2"}`;
  const ocrAnnotations = useMemo(() => {
    const metadata = report.final_report.metadata as Record<string, unknown> | undefined;
    const annotations = metadata ? (metadata["ocr_annotations"] as unknown) : undefined;
    if (!annotations) return [] as string[];
    if (Array.isArray(annotations)) {
      return annotations
        .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "")))
        .filter((item) => item.length > 0);
    }
    if (typeof annotations === "string") {
      return [annotations];
    }
    return [];
  }, [report.final_report.metadata]);
  const mediaLabel = mediaType === "image" ? "画像" : "動画";
  const summarizeText = (text?: string, fallback?: string, max = 350) => {
    const base = (text && text.trim()) || fallback || "";
    if (!base) {
      return "詳細な総評はありません。";
    }
    return base.length > max ? `${base.slice(0, max)}…` : base;
  };
  const socialSummaryText = summarizeText(
    report.final_report.risk.social.summary,
    report.final_report.risk.social.reason
  );
  const legalSummaryText = useMemo(
    () =>
      buildLegalSummaryText(
        legalGrade,
        report.final_report.risk.legal.summary,
        report.final_report.risk.legal.reason
      ),
    [legalGrade, report.final_report.risk.legal.summary, report.final_report.risk.legal.reason]
  );
  const matchSocialFindings = useMemo(() => {
    const prepared = socialFindings.map((finding) => ({
      ...finding,
      detailLower: (finding.detail || "").toLowerCase()
    }));
    return (tagName: string, subTag: string, detectedText?: string) => {
      const fallbackDetection = (detectedText ?? "").trim();
      const fallbackFinding = fallbackDetection
        ? [
            {
              timecode: "N/A",
              detail: fallbackDetection
            }
          ]
        : [];
      if (!prepared.length) {
        return fallbackFinding;
      }
      const keywords = [tagName, subTag, detectedText]
        .filter(Boolean)
        .map((keyword) => (keyword || "").toLowerCase());
      const matches = keywords.length
        ? prepared.filter((finding) =>
            keywords.some((keyword) => keyword && finding.detailLower.includes(keyword))
          )
        : [];
      return matches.length ? matches : fallbackFinding;
    };
  }, [socialFindings]);
  const resolveDetectedEvidence = useCallback(
    (
      tagName: string,
      subTagName: string | undefined,
      detectedText?: string | null,
      reason?: string | null,
      detectedTimecode?: string | null
    ): DetectedEvidence => {
      const normalizedDetected = (detectedText ?? "").trim();
      const findings = matchSocialFindings(tagName, subTagName ?? "", detectedText ?? undefined);

      // Priority 1: If we have detected_text, use it with its own timecode
      // Do NOT fallback to findings timecode to avoid mismatched text/timecode pairs
      if (normalizedDetected) {
        return {
          expression: normalizedDetected,
          timecode: detectedTimecode || null  // Only use the provided timecode
        };
      }

      // Priority 2: Use findings from social findings if no detected_text
      if (findings.length) {
        return {
          expression: findings[0].detail || FALLBACK_DETECTED_TEXT,
          timecode: findings[0].timecode
        };
      }

      // Priority 3: Use reason as fallback
      const normalizedReason = (reason ?? "").trim();
      if (normalizedReason) {
        return {
          expression: normalizedReason,
          timecode: detectedTimecode
        };
      }

      // Priority 4: Ultimate fallback
      return {
        expression: FALLBACK_DETECTED_TEXT,
        timecode: detectedTimecode
      };
    },
    [matchSocialFindings]
  );
  const flaggedExpressions = useMemo(() => {
    const unique = new Set<string>();
    const list: Array<{
      tag: string;
      subTag?: string;
      expression: string;
      sources: string[];
      timecode?: string | null;
      grade?: string;
      reason?: string;
      isCustom?: boolean;
    }> = [];
    tagAssessments.forEach((tag) => {
      const pushExpression = (
        subTagObj: {
          name?: string;
          detected_text?: string | null;
          detected_timecode?: string | null;
          reason?: string | null;
          grade?: string | null;
        } | null,
        fallbackReason?: string | null
      ) => {
        const subName = subTagObj?.name;
        const evidence = resolveDetectedEvidence(
          tag.name,
          subName,
          subTagObj?.detected_text ?? tag.detected_text,
          subTagObj?.reason ?? fallbackReason ?? tag.reason,
          subTagObj?.detected_timecode ?? (tag as any).detected_timecode
        );
        const key = `${tag.name}-${subName ?? "main"}-${evidence.expression}`;
        if (unique.has(key)) return;
        unique.add(key);
        const sources =
          evidence.expression === FALLBACK_DETECTED_TEXT ? [] : detectSourceLabels(evidence.expression);
        list.push({
          tag: tag.name,
          subTag: subName,
          expression: evidence.expression,
          sources,
          timecode: evidence.timecode,
          grade: subTagObj?.grade ?? tag.grade,
          reason: subTagObj?.reason ?? fallbackReason ?? tag.reason
        });
      };
      pushExpression(
        { name: undefined, detected_text: tag.detected_text, reason: tag.reason, grade: tag.grade },
        tag.reason
      );
      if (Array.isArray(tag.related_sub_tags)) {
        tag.related_sub_tags.forEach((subTag) => pushExpression(subTag ?? null, tag.reason));
      }
    });

    // Add custom tags
    customTags.forEach((customTag) => {
      const key = `custom-${customTag.tag}-${customTag.subTag ?? "main"}-${customTag.expression}`;
      if (!unique.has(key)) {
        unique.add(key);
        list.push({
          tag: customTag.tag,
          subTag: customTag.subTag,
          expression: customTag.expression,
          sources: [],
          timecode: customTag.timecode,
          grade: customTag.grade,
          reason: customTag.reason,
          isCustom: true
        });
      }
    });

    return list;
  }, [detectSourceLabels, resolveDetectedEvidence, tagAssessments, customTags]);
  useEffect(() => {
    console.log("[PrintableSummary] flagged expressions", flaggedExpressions);
  }, [flaggedExpressions]);

  const tagChartRef = useRef<HTMLDivElement | null>(null);
  const [tagChartInView, setTagChartInView] = useState(false);

type TagChartItem = {
  tag: string;
  subTag: string;
  grade: keyof typeof EVAL_MAP;
  reason?: string;
  detectedText?: string;
  detectedTimecode?: string;
};

type BurnRiskDetail = {
  name: string;
  risk: number;
  label?: string;
  type?: string;
  detectedText?: string;
  detectedTimecode?: string | null;
  reason?: string;
  parentTag?: string;
};

type DetectedEvidence = {
  expression: string;
  timecode?: string | null;
};

const toEvalGrade = (grade?: string): keyof typeof EVAL_MAP => {
    if (grade && grade in EVAL_MAP) {
      return grade as keyof typeof EVAL_MAP;
    }
    return "N/A";
  };

  const tagChartData = useMemo(() => {
    const items: TagChartItem[] = [];
    tagAssessments.forEach((tag) => {
      const subTags = Array.isArray(tag.related_sub_tags) ? tag.related_sub_tags : [];
      if (!subTags.length) {
        items.push({
          tag: tag.name,
          subTag: "総合評価",
          grade: toEvalGrade(tag.grade),
          reason: tag.reason,
          detectedText: tag.detected_text,
          detectedTimecode: (tag as any).detected_timecode
        });
        return;
      }

      subTags.forEach((sub) => {
        items.push({
          tag: tag.name,
          subTag: sub.name,
          grade: toEvalGrade(sub.grade ?? tag.grade),
          reason: sub.reason ?? tag.reason ?? "",
          detectedText: sub.detected_text ?? tag.detected_text,
          detectedTimecode: (sub as any).detected_timecode ?? (tag as any).detected_timecode
        });
      });
    });
    return items;
  }, [tagAssessments]);

  const groupedTagData = useMemo(() => {
    const map = new Map<string, typeof tagChartData>();
    tagChartData.forEach((item) => {
      if (!map.has(item.tag)) {
        map.set(item.tag, []);
      }
      map.get(item.tag)!.push(item);
    });
    return map;
  }, [tagChartData]);
  const highRiskTagEntries = useMemo(() => {
    return [...groupedTagData.entries()].filter(([_, items]) =>
      items.some((item) => gradeToScore(item.grade) >= RISK_DISPLAY_THRESHOLD)
    );
  }, [groupedTagData]);
  const socialTagBars = useMemo(() => {
    type TagRow = {
      tag: string;
      subTag: string;
      grade: keyof typeof EVAL_MAP;
      detectedText?: string;
      detectedTimecode?: string;
      detectedSource?: string;
      reason?: string;
    };

    type GroupedTagEntry = {
      detected_text: string;
      detected_timecode: string;
      detected_source?: string;
      all_detected_texts: string[];
      all_detected_timecodes: string[];
      tags: TagRow[];
    };

    const rows: TagRow[] = [];

    tagAssessments.forEach((tag) => {
      const subTags = Array.isArray(tag.related_sub_tags) ? tag.related_sub_tags : [];

      // Only add sub-tags (no separate main tag row to avoid duplication)
      if (subTags.length) {
        subTags.forEach((sub) => {
          rows.push({
            tag: tag.name,
            subTag: sub.name,
            grade: toEvalGrade(sub.grade ?? tag.grade),
            detectedText: sub.detected_text ?? tag.detected_text,
            detectedTimecode: (sub as any)?.detected_timecode,
            detectedSource: (sub as any)?.detected_source || (tag as any)?.detected_source,
            reason: sub.reason ?? tag.reason
          });
        });
      }
    });

    // Group tags by similar detected text and nearby timecode
    const SIMILARITY_THRESHOLD = 70; // 70% similarity
    const TIMECODE_TOLERANCE = 2; // ±2 seconds

    type TagGroup = {
      texts: string[];
      timecodes: string[];
      rows: TagRow[];
    };

    const groups: TagGroup[] = [];

    rows.forEach((row) => {
      const text = row.detectedText || "";
      const timecode = row.detectedTimecode || "";

      // Try to find matching group
      let matchedGroup: TagGroup | null = null;

      for (const group of groups) {
        // Check text similarity
        const hasSimilarText = group.texts.some((groupText) => {
          if (!text || !groupText) return text === groupText;
          if (text === groupText) return true;
          const similarity = calculateSimilarity(text, groupText);
          return similarity >= SIMILARITY_THRESHOLD;
        });

        // Check timecode proximity
        const hasNearbyTimecode = group.timecodes.some((groupTimecode) => {
          if (!timecode || !groupTimecode) return timecode === groupTimecode;
          if (timecode === groupTimecode) return true;
          return areTimecodesNearby(timecode, groupTimecode, TIMECODE_TOLERANCE);
        });

        // If both match, use this group
        if (hasSimilarText && hasNearbyTimecode) {
          matchedGroup = group;
          break;
        }
      }

      if (matchedGroup) {
        // Add to existing group
        matchedGroup.rows.push(row);
        if (text && !matchedGroup.texts.includes(text)) {
          matchedGroup.texts.push(text);
        }
        if (timecode && !matchedGroup.timecodes.includes(timecode)) {
          matchedGroup.timecodes.push(timecode);
        }
      } else {
        // Create new group
        groups.push({
          texts: text ? [text] : [],
          timecodes: timecode ? [timecode] : [],
          rows: [row],
        });
      }
    });

    // Convert groups to GroupedTagEntry format
    const groupedEntries: GroupedTagEntry[] = groups.map((group) => {
      const representativeText = group.texts.find((t) => t) || "";
      const representativeTimecode = group.timecodes.find((t) => t) || "";
      // Get detected_source from the first row in the group that has one
      const representativeSource = group.rows.find((r) => r.detectedSource)?.detectedSource;

      return {
        detected_text: representativeText,
        detected_timecode: representativeTimecode,
        detected_source: representativeSource,
        all_detected_texts: group.texts.filter((t) => t),
        all_detected_timecodes: group.timecodes.filter((t) => t),
        tags: group.rows,
      };
    });

    // Sort by timecode (earliest first), then by grade (highest risk first)
    return groupedEntries.sort((a, b) => {
      const timeA = parseTimecode(a.detected_timecode);
      const timeB = parseTimecode(b.detected_timecode);

      if (timeA !== null && timeB !== null) {
        if (timeA !== timeB) {
          return timeA - timeB;
        }
      }

      if (timeA !== null && timeB === null) return -1;
      if (timeA === null && timeB !== null) return 1;

      // If timecodes are equal or both null, sort by highest risk
      const maxGradeA = Math.max(...a.tags.map(tag => EVAL_SCORE[tag.grade]));
      const maxGradeB = Math.max(...b.tags.map(tag => EVAL_SCORE[tag.grade]));
      return maxGradeB - maxGradeA;
    });
  }, [tagAssessments]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setTagChartInView(entry.isIntersecting);
      },
      { threshold: 0.35 }
    );
    const target = tagChartRef.current;
    if (!target) {
      setTagChartInView(false);
      return () => observer.disconnect();
    }
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [socialTagBars.length]);

  const printableStyle: React.CSSProperties = { width: "100%", backgroundColor: "#ffffff" };

  const printOrientationStyle = `@media print {
    @page { size: A4 ${orientation}; margin: 12mm; }
    body { -webkit-print-color-adjust: exact; }
    .printable-summary {
      width: ${orientation === "portrait" ? "185mm" : "270mm"} !important;
      min-height: ${orientation === "portrait" ? "265mm" : "200mm"} !important;
      padding: 10mm !important;
      box-sizing: border-box;
      margin: 0 auto !important;
    }
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
    .bar-segment { width: 100% !important; transition: none !important; }
    img, video { max-width: 100% !important; height: auto !important; }

    /* 表紙部分（リスクマトリクスまで）を1ページに */
    .cover-page {
      page-break-after: always;
      break-after: page;
    }

    /* タグ別詳細分析セクション */
    .tag-analysis-section {
      page-break-before: always;
      break-before: page;
    }

    /* 各タグ分析カードが途中で分断されないように */
    .tag-card {
      page-break-inside: avoid;
      break-inside: avoid;
      margin-bottom: 1em;
    }

    /* 付録セクションは新しいページから */
    .appendix-section {
      page-break-before: always;
      break-before: page;
    }

    /* 付録の各セクションも途切れないように */
    .appendix-item {
      page-break-inside: avoid;
      break-inside: avoid;
      margin-bottom: 2em;
    }
  }`;

  const blockStyle: React.CSSProperties = {
    breakInside: "avoid",
    pageBreakInside: "avoid"
  };

  const detailSections = useMemo(
    () => [
      {
        title: "音声文字起こし全文",
        content: report.final_report.sections.transcription
      },
      {
        title: "OCR 字幕抽出全文",
        content: report.final_report.sections.ocr
      },
      {
        title: "映像分析 詳細",
        content: report.final_report.sections.video_analysis
      }
    ],
    [
      report.final_report.sections.transcription,
      report.final_report.sections.ocr,
      report.final_report.sections.video_analysis
    ]
  );

  return (
    <div className="printable-container w-full">
      <style>{printOrientationStyle}</style>
      <style>{`
        .bar-segment {
          transition: width 1s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.3s ease-in-out;
          will-change: width;
        }
        .tag-bar-fill {
          height: 100%;
          border-radius: 9999px;
          transition: width 0.9s cubic-bezier(0.4, 0, 0.2, 1);
          will-change: width;
        }
        @media print {
          .tag-bar-fill {
            transition: none !important;
          }
          .tag-bar-fill[data-print-width="100%"] { width: 100% !important; }
          .tag-bar-fill[data-print-width="95%"] { width: 95% !important; }
          .tag-bar-fill[data-print-width="90%"] { width: 90% !important; }
          .tag-bar-fill[data-print-width="85%"] { width: 85% !important; }
          .tag-bar-fill[data-print-width="80%"] { width: 80% !important; }
          .tag-bar-fill[data-print-width="75%"] { width: 75% !important; }
          .tag-bar-fill[data-print-width="70%"] { width: 70% !important; }
          .tag-bar-fill[data-print-width="65%"] { width: 65% !important; }
          .tag-bar-fill[data-print-width="60%"] { width: 60% !important; }
          .tag-bar-fill[data-print-width="55%"] { width: 55% !important; }
          .tag-bar-fill[data-print-width="50%"] { width: 50% !important; }
          .tag-bar-fill[data-print-width="45%"] { width: 45% !important; }
          .tag-bar-fill[data-print-width="40%"] { width: 40% !important; }
          .tag-bar-fill[data-print-width="35%"] { width: 35% !important; }
          .tag-bar-fill[data-print-width="30%"] { width: 30% !important; }
          .tag-bar-fill[data-print-width="25%"] { width: 25% !important; }
          .tag-bar-fill[data-print-width="20%"] { width: 20% !important; }
          .tag-bar-fill[data-print-width="15%"] { width: 15% !important; }
          .tag-bar-fill[data-print-width="10%"] { width: 10% !important; }
          .tag-bar-fill[data-print-width="5%"] { width: 5% !important; }
        }
        .matrix-cell {
          transition: transform 0.3s ease, background-color 0.3s ease;
          cursor: pointer;
        }
        .matrix-cell:hover {
          transform: scale(1.05);
          box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
        }
        .printable-summary {
          position: relative;
          overflow: hidden;
        }
        .printable-summary::before {
          content: "Creative Guard";
          position: absolute;
          top: -20%;
          left: -10%;
          width: 120%;
          height: 120%;
          pointer-events: none;
          opacity: 0.05;
          font-size: 6rem;
          transform: rotate(-15deg);
          font-weight: 900;
          color: #1f2937;
        }
      `}</style>

      <div className="printable-summary mx-auto flex w-full flex-col gap-6 rounded-lg bg-white p-6 shadow-lg">
        {/* Cover page section - includes everything up to and including risk matrix */}
        <div className="cover-page">
        <header className="flex flex-col gap-4 border-b border-slate-100 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Creative Guard Report</p>
            <h1 className="text-2xl font-bold text-slate-900">{projectTitle}</h1>
            <p className="mt-1 text-sm text-slate-600">会社名: {companyName}</p>
            <p className="text-sm text-slate-600">商品名: {productName}</p>
            <p className="text-sm text-slate-600">メディア種別: {mediaLabel}</p>
          </div>

          <div className="flex flex-col items-start gap-2 text-right md:items-end">
            <span className={`inline-flex items-center gap-3 rounded-full px-4 py-2 text-base font-semibold ${actionStatus.bgColor} ${actionStatus.textColor}`}>
              {actionStatus.badge}
            </span>
            <span className="text-xs text-slate-500 max-w-sm text-right">{actionStatus.description}</span>
          </div>
        </header>

        <section className={riskSummaryGridClass}>
          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">社会的リスク評価</h3>
            <p className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${socialStyle.borderColor} ${socialStyle.textColor}`}>
              {socialGrade} / {socialStyle.label}
            </p>
            <p className="mt-2 text-xs text-slate-500">総評: {socialSummaryText}</p>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">法務チェック</h3>
            <p className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${legalStyle.borderColor} ${legalStyle.textColor}`}>
              {legalGrade}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{legalSummaryText}</p>
            {legalEvidenceItems.length > 0 && (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
                <h4 className="text-xs font-semibold text-slate-600">該当文言とタイムコード</h4>
                <ul className="mt-2 space-y-2 text-[11px] text-slate-600">
                  {legalEvidenceItems.map((item) => (
                    <li key={item.id} className="rounded bg-white/80 p-2">
                      <div className="font-semibold text-slate-700">
                        {item.reference && (
                          <span className="mr-1 text-rose-500">[{item.reference}]</span>
                        )}
                        {item.label}
                        {item.severity && (
                          <span className="ml-2 inline-flex items-center rounded bg-rose-100 px-1 text-[9px] font-semibold text-rose-600">
                            {item.severity}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        タイムコード: <span className="font-mono">{item.timecode}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.final_report.risk.legal.recommendations && (
              <p className="mt-2 rounded bg-amber-50 p-3 text-xs text-amber-700">
                改善提案: {report.final_report.risk.legal.recommendations}
              </p>
            )}
          </article>

          {burnRiskCount > 0 && (
            <article className="hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700">炎上可能性補正</h3>
              <p className="mt-2 text-2xl font-bold text-rose-600">{burnRisk?.grade ?? "-"}</p>
              <p className="mt-2 text-xs text-slate-500">
                {burnRisk?.label ?? "-"}（平均リスク {burnRisk?.average ?? "-"} / 件数 {burnRiskCount}）
              </p>
              {burnRiskDetails.length > 0 && (
                <ul className="mt-2 space-y-3 text-[11px] text-slate-600">
                  {burnRiskDetails.map((detail, index) => {
                    const heading =
                      detail.parentTag && detail.parentTag !== detail.name
                        ? `${detail.parentTag} / ${detail.name}`
                        : detail.name || `要素 ${index + 1}`;
                    const possibilityLabel = detail.label ?? `リスクスコア ${detail.risk}`;
                    const evidence = resolveDetectedEvidence(
                      detail.parentTag ?? detail.name ?? "",
                      detail.type === "subtag" ? detail.name : undefined,
                      detail.detectedText,
                      detail.reason
                    );
                    const relatedSources =
                      evidence.expression === FALLBACK_DETECTED_TEXT
                        ? []
                        : detectSourceLabels(evidence.expression);
                    const sourceLabel =
                      relatedSources.length > 0
                        ? relatedSources.join(" / ")
                        : evidence.expression === FALLBACK_DETECTED_TEXT
                        ? "データなし"
                        : "音声・テロップ・映像分析の複合推定";
                    const resolvedDetailReason =
                      (detail.reason ?? detail.parentTag)?.trim() ||
                      "検出された表現が炎上リスク要因と判断されたためです。";
                    return (
                      <li
                        key={`${detail.name ?? "detail"}-${index}`}
                        className="rounded border border-rose-100 bg-rose-50/60 p-3 leading-relaxed"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold text-slate-700">{heading}</p>
                          {detail.type && (
                            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-rose-500">
                              {detail.type}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          <span className="font-semibold text-rose-600">炎上する可能性:</span>{" "}
                          {possibilityLabel}
                        </p>
                        <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                          <p>
                            <span className="font-semibold text-slate-700">検知された表現:</span>{" "}
                            <span className="font-mono text-[10px] text-slate-700">
                              {evidence.expression}
                            </span>
                          </p>
                          <p className="text-[10px] text-slate-500">
                            <span className="font-semibold text-slate-600">理由:</span>{" "}
                            <span className="font-mono text-[10px] text-slate-700">
                              {evidence.expression}
                            </span>{" "}
                            が {resolvedDetailReason}
                          </p>
                          {mediaType === "video" && evidence.timecode && (
                            <p className="text-[10px] text-slate-500">
                              <span className="font-semibold text-slate-600">タイムコード:</span>{" "}
                              {evidence.timecode}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-500">
                            <span className="font-semibold text-slate-600">参照データ:</span>{" "}
                            {sourceLabel}
                          </p>
                        </div>
                        {detail.reason && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-700">炎上なりうる理由:</span>{" "}
                            {detail.reason}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          )}
        </section>

        {ocrAnnotations.length > 0 && (
          <section className="tag-card mt-6" style={blockStyle}>
            <h3 className="text-lg font-semibold text-slate-800">OCR 注釈（※を含む字幕）</h3>
            <ul className="mt-3 space-y-1 rounded border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
              {ocrAnnotations.map((annotation, index) => (
                <li key={`ocr-annotation-${index}`} className="leading-snug">
                  {annotation}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6" style={blockStyle}>
          <h3 className="text-lg font-semibold text-slate-800">リスクマトリクス</h3>
          <MatrixView
            xLabel={report.final_report.risk.matrix.x_axis}
            yLabel={report.final_report.risk.matrix.y_axis}
            position={normalizeMatrixPosition(
              report.final_report.risk.matrix.position,
              legalGrade,
              socialGrade
            )}
          />
          {report.final_report.risk.note && (
            <p className="mt-2 text-[10px] text-slate-400">注記: {report.final_report.risk.note}</p>
          )}
        </section>
        </div>
        {/* End of cover page */}

        {highRiskTagEntries.length > 0 && (
          <section className="mt-6 tag-analysis-section" style={blockStyle}>
            <h3 className="text-lg font-semibold text-slate-800">タグ別 詳細分析</h3>
            {socialTagBars.length > 0 && (
              <div className="mt-4" ref={tagChartRef}>
                <h4 className="text-sm font-semibold text-slate-600">社会的感度タグサマリー</h4>
                <div className="mt-3 space-y-3">
                  {socialTagBars.map((group, groupIdx) => {
                    const hasMultipleTags = group.tags.length > 1;
                    const hasMultipleTexts = group.all_detected_texts.length > 1;
                    const hasMultipleTimecodes = group.all_detected_timecodes.length > 1;

                    return (
                      <div
                        key={`social-tag-group-${groupIdx}`}
                        className="tag-card rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm"
                      >
                        {/* Group header with detected text and timecode */}
                        {group.detected_text && (
                          <div className="mb-2 pb-2 border-b border-slate-200">
                            <div className="flex items-start gap-2">
                              <span className="text-base">📍</span>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className="text-[10px] font-semibold text-slate-800">検出文言</p>
                                  {group.detected_source && (() => {
                                    const sourceInfo = getSourceLabel(group.detected_source);
                                    return (
                                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold ${sourceInfo.bgColor} ${sourceInfo.textColor}`}>
                                        <span>{sourceInfo.icon}</span>
                                        <span>{sourceInfo.label}</span>
                                      </span>
                                    );
                                  })()}
                                </div>
                                <p className="text-[10px] text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                                  {group.detected_text}
                                </p>
                                {hasMultipleTexts && (
                                  <div className="mt-1 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                                    <p className="text-[9px] text-blue-800 font-medium mb-0.5">
                                      🔗 類似する検出文言がまとめられています (類似度70%以上):
                                    </p>
                                    <div className="space-y-0.5">
                                      {group.all_detected_texts.map((text, idx) => (
                                        <p key={idx} className="text-[9px] text-blue-700 pl-1">
                                          • {text}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {mediaType === "video" && group.detected_timecode && (
                              <div className="mt-1 flex items-center gap-1">
                                <span className="text-[10px] font-semibold text-slate-700">タイムコード:</span>
                                <span className="text-[10px] text-slate-600">{group.detected_timecode}</span>
                                {hasMultipleTimecodes && (
                                  <span className="text-[9px] text-blue-600 ml-1">
                                    (±2秒以内: {group.all_detected_timecodes.join(", ")})
                                  </span>
                                )}
                              </div>
                            )}
                            {hasMultipleTags && (
                              <div className="mt-1 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                <p className="text-[10px] text-amber-800 font-medium">
                                  ⚠️ この文言に対して {group.tags.length} 件のタグが該当しています
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Display all tags in this group */}
                        <div className="space-y-2">
                          {group.tags.map((entry, tagIdx) => {
                            const style = EVAL_MAP[entry.grade] ?? EVAL_MAP["N/A"];
                            return (
                              <div key={`tag-${groupIdx}-${tagIdx}`}>
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-900">{entry.tag}</p>
                                    <p className="text-[11px] text-slate-500">{entry.subTag}</p>
                                  </div>
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.borderColor} ${style.textColor}`}
                                  >
                                    {entry.grade} / {style.label}
                                  </span>
                                </div>
                                <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-200/80">
                                  <div
                                    className={`tag-bar-fill ${style.color}`}
                                    style={{ width: tagChartInView ? `${style.width}%` : "0%" }}
                                    data-print-width={`${style.width}%`}
                                  />
                                </div>
                                {entry.reason && (
                                  <div className="mt-1 text-[10px] text-slate-500">
                                    <p>
                                      <span className="font-semibold text-slate-700">理由:</span>{" "}
                                      {entry.reason}
                                    </p>
                                  </div>
                                )}
                                {/* フレーム画像を表示 (only if timecode exists) */}
                                {mediaType === "video" && entry.detectedTimecode && tagFramesInfo && (() => {
                                  // Match frame by timecode, tag, and sub_tag (if applicable)
                                  const frameInfo = tagFramesInfo.frames.find((f) => {
                                    // Timecode must match
                                    if (f.timecode !== entry.detectedTimecode) return false;

                                    // Tag must match
                                    if (f.tag !== entry.tag) return false;

                                    // Sub-tag must also match
                                    return f.sub_tag === entry.subTag;
                                  });

                                  if (frameInfo) {
                                    return (
                                      <div className="mt-2">
                                        <img
                                          src={getTagFrameUrl(projectId, frameInfo.filename)}
                                          alt={`フレーム at ${entry.detectedTimecode}`}
                                          className="rounded border border-slate-300 max-w-full h-auto"
                                          style={{ maxHeight: "200px" }}
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = "none";
                                          }}
                                        />
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="space-y-4">
              {highRiskTagEntries.map(([tagName, items]) => {
                const mainInfo = tagMainMap.get(tagName);
                const subTags: RelatedSubTag[] = Array.isArray(mainInfo?.related_sub_tags)
                  ? (mainInfo?.related_sub_tags as RelatedSubTag[])
                  : [];
                const mainEval =
                  mainInfo?.grade && mainInfo.grade in EVAL_MAP ? mainInfo.grade : "N/A";
                const mainScore = gradeToScore(mainEval as keyof typeof EVAL_MAP);
                const subScores = items.length
                  ? items.map((item) => gradeToScore(item.grade))
                  : [mainScore];
                const maxSubScore = Math.max(mainScore, ...subScores);
                const aggregateGrade = scoreToGrade(maxSubScore);
                const aggregateStyle =
                  EVAL_MAP[(aggregateGrade as keyof typeof EVAL_MAP) ?? "N/A"];
                const filteredItems = items.filter(
                  (item) => gradeToScore(item.grade) >= RISK_DISPLAY_THRESHOLD
                );

                return (
                  <article key={tagName} className="tag-card hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">タグ</p>
                        <h4 className="text-sm font-semibold text-slate-700">{tagName}</h4>
                      </div>
                      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${aggregateStyle.borderColor} ${aggregateStyle.textColor}`}>
                        総合評価: {aggregateGrade} / {aggregateStyle.label}
                      </span>
                    </div>

                    {filteredItems.length > 0 ? (
                      <ul className="mt-4 space-y-2">
                        {filteredItems.map((item) => {
                          const style = EVAL_MAP[item.grade] ?? EVAL_MAP["N/A"];
                          const detectedText =
                            item.detectedText ??
                            subTags.find((sub) => sub.name === item.subTag)?.detected_text ??
                            mainInfo?.detected_text;
                          const detectedTimecode =
                            item.detectedTimecode ??
                            subTags.find((sub) => sub.name === item.subTag)?.detected_timecode ??
                            (mainInfo as any)?.detected_timecode;
                          const evidence = resolveDetectedEvidence(
                            tagName,
                            item.subTag,
                            detectedText,
                            item.reason ?? mainInfo?.reason,
                            detectedTimecode
                          );
                          const resolvedReason =
                            (item.reason ?? mainInfo?.reason)?.trim() ||
                            "検出文言が社会的感度タグに該当するためです。";
                          const sourceHints =
                            evidence.expression === FALLBACK_DETECTED_TEXT
                              ? []
                              : detectSourceLabels(evidence.expression);
                          const sourceLabel =
                            sourceHints.length > 0
                              ? sourceHints.join(" / ")
                              : evidence.expression === FALLBACK_DETECTED_TEXT
                              ? "データなし"
                              : "音声・テロップ・映像分析の複合推定";
                          return (
                            <li
                              key={`${tagName}-${item.subTag}`}
                              className="rounded border border-slate-200 bg-slate-50 p-3 text-[11px]"
                            >
                              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                <p className="text-xs font-semibold text-slate-700">{item.subTag}</p>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.borderColor} ${style.textColor}`}
                                >
                                  {item.grade} / {style.label}
                                </span>
                              </div>
                              <div className="mt-1 rounded bg-indigo-900/50 p-2 text-[10px] text-white">
                                <p>
                                  検出文言:{" "}
                                  <span className="font-mono">{evidence.expression}</span>
                                </p>
                                <p className="mt-0.5 text-[9px] text-indigo-200">
                                  理由: <span className="font-mono">{evidence.expression}</span> が{" "}
                                  {resolvedReason}
                                </p>
                                {mediaType === "video" && evidence.timecode && (
                                  <p className="mt-0.5 text-[9px] text-indigo-200">
                                    タイムコード: {evidence.timecode}
                                  </p>
                                )}
                                <p className="mt-0.5 text-[9px] text-indigo-200">
                                  参照データ: {sourceLabel}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-4 text-[11px] text-slate-500">
                        リスクのある細分化タグは検出されていません。
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="reference-section mt-6 print:hidden" style={blockStyle}>
          <h3 className="text-lg font-semibold text-slate-800">参考情報</h3>
          <div className="space-y-2 text-[11px] text-slate-600">
            <p>リスク評価モデル: Creative Guard AI</p>
            <p>更新日: {report.final_report.generated_at ?? "-"}</p>
            <p>データソース: 参考法令文書、SNS炎上事例データベース</p>
          </div>
        </section>
      </div>

      {/* 注釈分析セクション */}
      {annotations && (
        <div className="mt-8">
          <AnnotationDisplay
            annotations={annotations}
            onSeekToTimecode={onSeekToTimecode}
          />
        </div>
      )}

      <div className="appendix-section mt-8 rounded-lg bg-white p-6 text-slate-900 shadow-lg print:break-before-page">
        <h2 className="text-xl font-semibold text-slate-900">付録: 取得データ全文</h2>
        <p className="text-xs text-slate-500">取得した全文データを以下にまとめています。</p>
        <div className="mt-4 space-y-6">
          {detailSections.map((section, index) => (
            <article key={`${section.title}-${index}`} className="appendix-item rounded border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-700">{section.title}</h3>
            <pre className="mt-2 max-h-[70vh] overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-[11px] leading-relaxed text-slate-700">
              {section.content?.trim() || "内容はまだ生成されていません。"}
            </pre>
          </article>
        ))}
      </div>

      {flaggedExpressions.length > 0 && (
        <section className="flagged-expressions-section mt-6 rounded border border-slate-200 bg-slate-50 p-4 text-[11px] text-slate-700 print:hidden">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">抽出された該当表現リスト</h3>
              <p className="text-[10px] text-slate-500">
                タグ別に音声内容・テロップ・映像分析から検出された表現を列挙しています。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddTagForm(!showAddTagForm)}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 print:hidden"
            >
              {showAddTagForm ? "キャンセル" : "+ タグを追加"}
            </button>
          </div>

          {/* Manual Tag Addition Form */}
          {showAddTagForm && (
            <div className="mb-4 rounded border border-indigo-200 bg-indigo-50 p-4 print:hidden">
              <h4 className="text-xs font-semibold text-slate-800 mb-3">新規タグを追加</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-1">
                    タグ名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newTag.tag}
                    onChange={(e) => setNewTag({ ...newTag, tag: e.target.value })}
                    placeholder="例: 性的表現"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-1">
                    サブタグ名
                  </label>
                  <input
                    type="text"
                    value={newTag.subTag}
                    onChange={(e) => setNewTag({ ...newTag, subTag: e.target.value })}
                    placeholder="例: 露骨な性描写"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-1">
                    グレード <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newTag.grade}
                    onChange={(e) => setNewTag({ ...newTag, grade: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-[11px] text-slate-800 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="A">A - 最小リスク</option>
                    <option value="B">B - 低リスク</option>
                    <option value="C">C - 中リスク</option>
                    <option value="D">D - 高リスク</option>
                    <option value="E">E - 最高リスク</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-700 mb-1">
                    タイムコード
                  </label>
                  <input
                    type="text"
                    value={newTag.timecode}
                    onChange={(e) => setNewTag({ ...newTag, timecode: e.target.value })}
                    placeholder="例: 1:23 または 静止画"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-700 mb-1">
                    検出された表現 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={newTag.expression}
                    onChange={(e) => setNewTag({ ...newTag, expression: e.target.value })}
                    placeholder="問題となる具体的な表現を入力"
                    rows={2}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-700 mb-1">
                    理由
                  </label>
                  <textarea
                    value={newTag.reason}
                    onChange={(e) => setNewTag({ ...newTag, reason: e.target.value })}
                    placeholder="この表現がリスクとなる理由を説明"
                    rows={2}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (newTag.tag && newTag.expression) {
                      setCustomTags([...customTags, { ...newTag }]);
                      setNewTag({
                        tag: "",
                        subTag: "",
                        grade: "C",
                        expression: "",
                        timecode: "",
                        reason: ""
                      });
                      setShowAddTagForm(false);
                    } else {
                      alert("タグ名と検出された表現は必須です");
                    }
                  }}
                  className="rounded bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  追加
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewTag({
                      tag: "",
                      subTag: "",
                      grade: "C",
                      expression: "",
                      timecode: "",
                      reason: ""
                    });
                    setShowAddTagForm(false);
                  }}
                  className="rounded border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}

          <ul className="mt-3 space-y-2">
            {flaggedExpressions.map((entry, index) => {
              const gradeStyle = entry.grade && entry.grade in EVAL_MAP
                ? EVAL_MAP[entry.grade as keyof typeof EVAL_MAP]
                : null;

              return (
                <li key={`flagged-${index}`} className="rounded border border-slate-200 bg-white px-3 py-2 leading-relaxed">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-slate-800">
                          {entry.tag}
                          {entry.subTag ? ` / ${entry.subTag}` : ""}
                        </p>
                        {gradeStyle && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${gradeStyle.borderColor} ${gradeStyle.textColor}`}
                          >
                            {entry.grade} / {gradeStyle.label}
                          </span>
                        )}
                        {entry.isCustom && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-purple-300 bg-purple-50 px-2 py-0.5 text-[9px] font-semibold text-purple-700">
                            手動追加
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[10px] text-slate-700 mt-1">{entry.expression}</p>
                      {entry.reason && (
                        <p className="text-[10px] text-slate-600 mt-1">
                          <span className="font-semibold">理由:</span> {entry.reason}
                        </p>
                      )}
                      {mediaType === "video" && entry.timecode && (
                        <p className="text-[10px] text-slate-500 mt-1">
                          タイムコード:{" "}
                          {onSeekToTimecode ? (
                            <button
                              type="button"
                              onClick={() => {
                                const seconds = parseTimecode(entry.timecode);
                                if (seconds !== null) {
                                  onSeekToTimecode(seconds);
                                }
                              }}
                              className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              {entry.timecode}
                            </button>
                          ) : (
                            <span>{entry.timecode}</span>
                          )}
                        </p>
                      )}
                      {!entry.isCustom && (
                        <p className="text-[10px] text-slate-500 mt-1">
                          参照データ:{" "}
                          {entry.sources.length > 0
                            ? entry.sources.join(" / ")
                            : entry.expression === FALLBACK_DETECTED_TEXT
                            ? "データなし"
                            : "音声・テロップ・映像分析の複合推定"}
                        </p>
                      )}
                    </div>
                    {entry.isCustom && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomTags(customTags.filter((_, i) => {
                            // Find index of this custom tag in customTags array
                            const customIndex = flaggedExpressions
                              .filter(e => e.isCustom)
                              .findIndex(e => e.tag === entry.tag && e.expression === entry.expression);
                            return i !== customIndex;
                          }));
                        }}
                        className="ml-2 text-[10px] text-red-600 hover:text-red-800 print:hidden"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  </div>
  );
}
