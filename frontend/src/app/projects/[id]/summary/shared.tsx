"use client";

import React, { useMemo } from "react";
import Image from "next/image";

import { ProjectReportResponse } from "@/lib/apiClient";

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

const LEGAL_MAP = {
  抵触していない: { borderColor: "border-green-500", textColor: "text-green-500" },
  抵触する可能性がある: { borderColor: "border-yellow-500", textColor: "text-yellow-400" },
  抵触している: { borderColor: "border-red-500", textColor: "text-red-500" }
} as const;

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
};

export function MediaPreview({ mediaType, src, onDurationChange }: MediaPreviewProps) {
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
};

export function PrintableSummary({
  report,
  projectTitle,
  companyName,
  productName,
  orientation,
  mediaType
}: PrintableSummaryProps) {
  const legalGrade = report.final_report.risk.legal.grade;
  const socialGrade = report.final_report.risk.social.grade;

  const socialStyle =
    EVAL_MAP[(socialGrade in EVAL_MAP ? socialGrade : "N/A") as keyof typeof EVAL_MAP];
  const legalStyle =
    LEGAL_MAP[legalGrade as keyof typeof LEGAL_MAP] ?? LEGAL_MAP["抵触する可能性がある"];

  const actionStatus = useMemo(
    () => resolveActionStatus(legalGrade, socialGrade),
    [legalGrade, socialGrade]
  );

  const tagAssessments = useMemo<RiskTagItem[]>(() => {
    const tags = report.final_report.risk.tags;
    return Array.isArray(tags) ? (tags as RiskTagItem[]) : [];
  }, [report.final_report.risk.tags]);
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
  const burnRisk = report.final_report.risk.burn_risk;
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
        reason,
        parentTag
      };
    });
  }, [burnRisk, subTagLookup, tagMainMap]);
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
  const matchSocialFindings = useMemo(() => {
    const prepared = socialFindings.map((finding) => ({
      ...finding,
      detailLower: (finding.detail || "").toLowerCase()
    }));
    return (tagName: string, subTag: string, detectedText?: string) => {
      const keywords = [tagName, subTag, detectedText]
        .filter(Boolean)
        .map((keyword) => (keyword || "").toLowerCase());
      if (!keywords.length) {
        return [];
      }
      return prepared.filter((finding) =>
        keywords.some((keyword) => keyword && finding.detailLower.includes(keyword))
      );
    };
  }, [socialFindings]);

type TagChartItem = {
  tag: string;
  subTag: string;
  grade: keyof typeof EVAL_MAP;
  reason?: string;
  detectedText?: string;
};

type BurnRiskDetail = {
  name: string;
  risk: number;
  label?: string;
  type?: string;
  detectedText?: string;
  reason?: string;
  parentTag?: string;
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
          detectedText: tag.detected_text
        });
        return;
      }

      subTags.forEach((sub) => {
        items.push({
          tag: tag.name,
          subTag: sub.name,
          grade: toEvalGrade(sub.grade ?? tag.grade),
          reason: sub.reason ?? tag.reason ?? "",
          detectedText: sub.detected_text ?? tag.detected_text
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
  const socialTagBars = useMemo(() => {
    const rows: Array<{
      tag: string;
      subTag: string;
      grade: keyof typeof EVAL_MAP;
      detectedText?: string;
    }> = [];
    tagAssessments.forEach((tag) => {
      const subTags = Array.isArray(tag.related_sub_tags) ? tag.related_sub_tags : [];
      if (subTags.length) {
        subTags.forEach((sub) => {
          rows.push({
            tag: tag.name,
            subTag: sub.name,
            grade: toEvalGrade(sub.grade ?? tag.grade),
            detectedText: sub.detected_text ?? tag.detected_text
          });
        });
      } else {
        rows.push({
          tag: tag.name,
          subTag: "総合評価",
          grade: toEvalGrade(tag.grade),
          detectedText: tag.detected_text
        });
      }
    });
    return rows.sort((a, b) => EVAL_SCORE[b.grade] - EVAL_SCORE[a.grade]);
  }, [tagAssessments]);

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
              {report.final_report.risk.social.grade} / {socialStyle.label}
            </p>
            <p className="mt-2 text-xs text-slate-500">総評: {socialSummaryText}</p>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">法務チェック</h3>
            <p className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${legalStyle.borderColor} ${legalStyle.textColor}`}>
              {report.final_report.risk.legal.grade}
            </p>
            <p className="mt-2 text-xs text-slate-500">{report.final_report.risk.legal.summary}</p>
            {legalFindings.length > 0 && (
              <ul className="mt-2 space-y-2 rounded bg-slate-50 p-3 text-[11px] text-slate-600">
                {legalFindings.map((finding, index) => (
                  <li key={`legal-${index}`} className="rounded bg-white p-2">
                    {finding.timecode && (
                      <span className="mr-2 font-semibold text-slate-500">
                        [{finding.timecode}]
                      </span>
                    )}
                    文言/表現: {finding.detail}
                  </li>
                ))}
              </ul>
            )}
            {legalViolations.length > 0 && (
              <div className="mt-3 rounded border border-rose-200 bg-rose-50 p-3">
                <h4 className="text-xs font-semibold text-rose-600">抵触可能性のある論点</h4>
                <ul className="mt-2 space-y-1 text-[11px] text-rose-600">
                  {legalViolations.map((violation, index) => (
                    <li key={`violation-${index}`} className="leading-snug">
                      {violation.reference && (
                        <span className="font-semibold text-slate-700">[{violation.reference}]</span>
                      )}{" "}
                      文言/表現: {violation.expression}
                      {violation.severity && (
                        <span className="ml-1 rounded bg-slate-200 px-1 text-[9px] font-semibold text-slate-700">
                          {violation.severity}
                        </span>
                      )}
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
            <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
                        {detail.detectedText && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-700">検知された理由:</span>{" "}
                            <span className="font-mono text-[10px] text-slate-700">
                              {detail.detectedText}
                            </span>
                          </p>
                        )}
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
          <section className="mt-6" style={blockStyle}>
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

        {groupedTagData.size > 0 && (
          <section className="mt-6" style={blockStyle}>
            <h3 className="text-lg font-semibold text-slate-800">タグ別 詳細分析</h3>
            {socialTagBars.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-slate-600">社会的感度タグサマリー</h4>
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  {socialTagBars.map((entry) => {
                    const style = EVAL_MAP[entry.grade] ?? EVAL_MAP["N/A"];
                    return (
                      <div
                        key={`social-tag-bar-${entry.tag}-${entry.subTag}`}
                        className="flex w-28 max-w-[8rem] flex-col items-center gap-2 text-center text-xs text-slate-700"
                      >
                        <div className="flex h-32 w-full items-end justify-center rounded bg-slate-200 shadow-inner">
                          <div
                            className={`w-full rounded-t ${style.color}`}
                            style={{ height: `${style.width}%` }}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="block text-[11px] font-semibold text-slate-900">
                            {entry.tag}
                          </span>
                          <span className="block text-[10px] text-slate-600">{entry.subTag}</span>
                          {entry.detectedText && (
                            <span className="block text-[9px] text-slate-500">
                              抽出: {entry.detectedText}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="space-y-4">
              {[...groupedTagData.entries()].map(([tagName, items]) => {
                const mainInfo = tagMainMap.get(tagName);
                const subTags: RelatedSubTag[] = Array.isArray(mainInfo?.related_sub_tags)
                  ? (mainInfo?.related_sub_tags as RelatedSubTag[])
                  : [];
                const mainEval =
                  mainInfo?.grade && mainInfo.grade in EVAL_MAP ? mainInfo.grade : "N/A";
                const mainStyle = EVAL_MAP[mainEval as keyof typeof EVAL_MAP];

                return (
                  <article key={tagName} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700">{tagName}</h4>
                        <p className="text-[11px] text-slate-500">
                          評価: {mainEval} / {mainStyle.label}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${mainStyle.borderColor} ${mainStyle.textColor}`}>
                        主要評価
                      </span>
                    </header>

                    <div className="mt-3 space-y-3">
                      {items.map((item) => {
                        const style = EVAL_MAP[item.grade] ?? EVAL_MAP["N/A"];
                        const detectedText =
                          item.detectedText ??
                          subTags.find((sub) => sub.name === item.subTag)?.detected_text ??
                          mainInfo?.detected_text;
                        const matchingFindings = matchSocialFindings(tagName, item.subTag, detectedText);
                        return (
                          <div
                            key={`${tagName}-${item.subTag}`}
                            className="rounded border border-slate-200 bg-slate-50 p-3 text-[11px]"
                          >
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="text-xs font-semibold text-slate-700">{item.subTag}</p>
                                {item.reason && (
                                  <p className="text-[11px] text-slate-500">理由: {item.reason}</p>
                                )}
                                {detectedText && (
                                  <p className="text-[10px] text-slate-600">
                                    該当表現: <span className="font-mono">{detectedText}</span>
                                  </p>
                                )}
                                {matchingFindings.length > 0 && (
                                  <ul className="mt-2 space-y-1 rounded bg-white p-2 text-[10px] text-slate-600">
                                    {matchingFindings.map((finding, idx) => (
                                      <li key={`${tagName}-${item.subTag}-finding-${idx}`}>
                                        {finding.timecode && (
                                          <span className="mr-1 font-semibold text-slate-500">
                                            [{finding.timecode}]
                                          </span>
                                        )}
                                        {finding.detail}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${style.borderColor} ${style.textColor}`}
                              >
                                {item.grade} / {style.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-6" style={blockStyle}>
          <h3 className="text-lg font-semibold text-slate-800">アクション推奨事項</h3>
          <p className="text-sm text-slate-600">
            {report.final_report.recommendation?.action_plan ?? "追加のアクションプランはありません。"}
          </p>
        </section>

        <section className="mt-6" style={blockStyle}>
          <h3 className="text-lg font-semibold text-slate-800">参考情報</h3>
          <div className="space-y-2 text-[11px] text-slate-600">
            <p>リスク評価モデル: Creative Guard AI</p>
            <p>更新日: {report.final_report.generated_at ?? "-"}</p>
            <p>データソース: 参考法令文書、SNS炎上事例データベース</p>
          </div>
        </section>
      </div>

      <div className="mt-8 rounded-lg bg-white p-6 text-slate-900 shadow-lg print:break-before-page">
        <h2 className="text-xl font-semibold text-slate-900">付録: 取得データ全文</h2>
        <p className="text-xs text-slate-500">取得した全文データを以下にまとめています。</p>
        <div className="mt-4 space-y-6">
          {detailSections.map((section, index) => (
            <article key={`${section.title}-${index}`} className="rounded border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-700">{section.title}</h3>
            <pre className="mt-2 max-h-[70vh] overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-[11px] leading-relaxed text-slate-700">
              {section.content?.trim() || "内容はまだ生成されていません。"}
            </pre>
          </article>
        ))}
      </div>
    </div>
  </div>
  );
}
