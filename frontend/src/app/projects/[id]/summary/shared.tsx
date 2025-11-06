"use client";

import React, { useMemo } from "react";

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

export const MATRIX_X_LABELS = ["抵触していない", "抵触する可能性がある", "抵触している"] as const;
export const MATRIX_Y_LABELS = ["E", "D", "C", "B", "A"] as const;

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

export function normalizeMatrixPosition(
  rawPosition: number[] | undefined,
  legalGrade: string,
  socialGrade: string
): number[] {
  const xIndex = MATRIX_X_LABELS.indexOf(legalGrade as (typeof MATRIX_X_LABELS)[number]);
  const yIndex = MATRIX_Y_LABELS.indexOf(socialGrade as (typeof MATRIX_Y_LABELS)[number]);

  const position = Array.isArray(rawPosition) && rawPosition.length === 2
    ? [...rawPosition]
    : [Math.max(xIndex, 0), Math.max(yIndex, 0)];

  if (xIndex >= 0) {
    position[0] = xIndex;
  }
  if (yIndex >= 0) {
    position[1] = yIndex;
  }
  position[0] = Math.min(Math.max(position[0], 0), MATRIX_X_LABELS.length - 1);
  position[1] = Math.min(Math.max(position[1], 0), MATRIX_Y_LABELS.length - 1);
  return position;
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

type MatrixCellProfile = {
  headline: string;
  description: string;
  bgClass: string;
  textClass: string;
};

export function resolveMatrixCell(legalGrade: string, socialGrade: string): MatrixCellProfile {
  const profile = getStatusProfile(legalGrade, socialGrade);
  return {
    headline: profile.badge,
    description: profile.description,
    bgClass: profile.matrixBg,
    textClass: profile.matrixText
  };
}

type MediaPreviewProps = {
  mediaType: string;
  src: string;
  onDurationChange?: (duration: number) => void;
};

export function MediaPreview({ mediaType, src, onDurationChange }: MediaPreviewProps) {
  if (mediaType === "image") {
    return (
      <img
        src={src}
        alt="アップロードされた画像"
        className="max-h-[420px] w-full object-contain"
      />
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

  const tagAssessments = Array.isArray(report.final_report.risk.tags)
    ? report.final_report.risk.tags
    : [];
  const socialFindings = Array.isArray(report.final_report.risk.social.findings)
    ? report.final_report.risk.social.findings
    : [];
  const legalFindings = Array.isArray(report.final_report.risk.legal.findings)
    ? report.final_report.risk.legal.findings
    : [];
  const legalViolations = Array.isArray(report.final_report.risk.legal.violations)
    ? report.final_report.risk.legal.violations
    : [];
  const burnRisk = report.final_report.risk.burn_risk;
  const burnRiskDetails = useMemo(() => {
    if (!burnRisk || !Array.isArray(burnRisk.details)) {
      return [] as Array<{ name: string; risk: number; label?: string; type?: string }>;
    }
    return (burnRisk.details as Array<{ name: string; risk: number; label?: string; type?: string }>).
      slice(0, 4);
  }, [burnRisk]);
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

  type TagChartItem = {
    tag: string;
    subTag: string;
    grade: keyof typeof EVAL_MAP;
    reason?: string;
    detectedText?: string;
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

  const tagMainMap = useMemo(() => {
    const map = new Map<string, (typeof tagAssessments)[number]>();
    tagAssessments.forEach((tag) => map.set(tag.name, tag));
    return map;
  }, [tagAssessments]);

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
        <header className="flex flex-col gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Creative Guard Report</p>
            <h1 className="text-2xl font-bold text-slate-900">{projectTitle}</h1>
            <p className="mt-1 text-sm text-slate-600">会社名: {companyName}</p>
            <p className="text-sm text-slate-600">商品名: {productName}</p>
            <p className="text-sm text-slate-600">メディア種別: {mediaLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${actionStatus.bgColor} ${actionStatus.textColor}`}>
              {actionStatus.badge}
            </span>
            <span className="text-xs text-slate-500">{actionStatus.description}</span>
          </div>
        </header>

        <section className={riskSummaryGridClass}>
          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">社会的リスク評価</h3>
            <p className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${socialStyle.borderColor} ${socialStyle.textColor}`}>
              {report.final_report.risk.social.grade} / {socialStyle.label}
            </p>
            <p className="mt-2 text-xs text-slate-500">{report.final_report.risk.social.summary}</p>
            {socialFindings.length > 0 && (
              <ul className="mt-2 space-y-2 text-[11px] text-slate-600">
                {socialFindings.map((finding, index) => (
                  <li key={`social-${index}`} className="rounded bg-slate-50 p-2">
                    {finding.timecode && (
                      <span className="mr-2 font-semibold text-slate-500">
                        [{finding.timecode}]
                      </span>
                    )}
                    {finding.detail}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700">法務チェック</h3>
            <p className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${legalStyle.borderColor} ${legalStyle.textColor}`}>
              {report.final_report.risk.legal.grade}
            </p>
            <p className="mt-2 text-xs text-slate-500">{report.final_report.risk.legal.summary}</p>
            {legalFindings.length > 0 && (
              <ul className="mt-2 space-y-2 text-[11px] text-slate-600">
                {legalFindings.map((finding, index) => (
                  <li key={`legal-${index}`} className="rounded bg-slate-50 p-2">
                    {finding.timecode && (
                      <span className="mr-2 font-semibold text-slate-500">
                        [{finding.timecode}]
                      </span>
                    )}
                    {finding.detail}
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
                      {violation.expression}
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
                <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
                  {burnRiskDetails.map((detail, index) => (
                    <li key={`${detail.name}-${index}`} className="leading-snug">
                      <span className="font-semibold text-slate-700">{detail.name}</span>
                      <span className="ml-2">リスクスコア: {detail.risk}</span>
                      {detail.label && <span className="ml-2 text-slate-500">{detail.label}</span>}
                      {detail.type && <span className="ml-2 text-slate-400">({detail.type})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}
        </section>

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

        {groupedTagData.size > 0 && (
          <section className="mt-6" style={blockStyle}>
            <h3 className="text-lg font-semibold text-slate-800">タグ別 詳細分析</h3>
            <div className="space-y-4">
              {[...groupedTagData.entries()].map(([tagName, items]) => {
                const mainInfo = tagMainMap.get(tagName);
                const subTags = Array.isArray(mainInfo?.related_sub_tags)
                  ? mainInfo?.related_sub_tags
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
                        return (
                          <div key={`${tagName}-${item.subTag}`} className="rounded border border-slate-200 bg-slate-50 p-3 text-[11px]">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="text-xs font-semibold text-slate-700">{item.subTag}</p>
                                {item.reason && <p className="text-[11px] text-slate-500">{item.reason}</p>}
                              </div>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${style.borderColor} ${style.textColor}`}>
                                {item.grade} / {style.label}
                              </span>
                            </div>
                            {item.detectedText && (
                              <p className="mt-2 rounded bg-white px-2 py-1 text-[10px] text-slate-600">
                                抽出テキスト: {item.detectedText}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {subTags.length > 0 && (
                      <div className="mt-3 rounded border border-slate-200 bg-white p-3 text-[11px] text-slate-600">
                        <h5 className="text-xs font-semibold text-slate-700">関連サブタグ</h5>
                        <ul className="mt-2 space-y-1">
                          {subTags.map((subTag, index) => {
                            const style = EVAL_MAP[toEvalGrade(subTag.grade)] ?? EVAL_MAP["N/A"];
                            return (
                              <li key={`${tagName}-sub-${index}`} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                                <span>{subTag.name}</span>
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.borderColor} ${style.textColor}`}>
                                  {subTag.grade ?? "N/A"}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
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
    </div>
  );
}

type MatrixViewProps = {
  xLabel: string;
  yLabel: string;
  position: number[] | undefined;
};

export function MatrixView({ xLabel, yLabel, position }: MatrixViewProps) {
  const xLabels = MATRIX_X_LABELS;
  const yLabels = MATRIX_Y_LABELS;
  const isArray = Array.isArray(position);
  const activeX = isArray ? position[0] : -1;
  const activeY = isArray ? position[1] : -1;

  return (
    <div className="space-y-2">
      <div className="flex flex-col md:flex-row items-stretch">
        <div className="flex md:flex-col justify-around text-sm font-semibold text-center md:text-right mt-4 md:mt-0 md:mr-4 md:justify-start">
          <div className="flex-1 p-2 md:p-0 md:text-center md:mb-4 md:h-16 flex items-center justify-center text-xs text-gray-300">
            {yLabel}
          </div>
          {yLabels.map((label) => (
            <div
              key={label}
              className="h-16 md:h-24 flex items-center justify-center text-lg font-bold"
            >
              <span
                className={
                  label === "E"
                    ? "text-red-400"
                    : label === "D"
                    ? "text-orange-400"
                    : label === "C"
                    ? "text-yellow-400"
                    : label === "B"
                    ? "text-lime-400"
                    : "text-green-400"
                }
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="flex-grow grid grid-cols-3 border border-gray-600 rounded-lg overflow-hidden">
          {yLabels.map((yLabelValue, yIdx) =>
            xLabels.map((xLabelValue, xIdx) => {
              const isActive = activeX === xIdx && activeY === yIdx;
              const profile = resolveMatrixCell(xLabelValue, yLabelValue);
              const inactiveClasses = "bg-gray-800 text-gray-500";
              const activeClasses = `${profile.bgClass} ${profile.textClass} border-4 border-amber-400 scale-105`;
              return (
                <div
                  key={`${xLabelValue}-${yLabelValue}`}
                  className={`matrix-cell border border-gray-700 p-3 flex items-center justify-center text-sm font-bold h-28 transition duration-300 ease-in-out ${
                    isActive ? activeClasses : inactiveClasses
                  }`}
                >
                  <div className="text-center leading-tight">
                    <span className="block text-sm font-semibold">{profile.headline}</span>
                    {profile.description && (
                      <span className="mt-1 block text-[10px] font-normal">
                        {profile.description}
                      </span>
                    )}
                    {isActive && (
                      <span className="mt-2 block text-[10px] font-semibold">
                        現在位置: {yLabelValue} / {xLabelValue}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="flex justify-around mt-4 text-sm font-semibold text-center md:ml-16 text-gray-200">
        {xLabels.map((label) => (
          <div
            key={label}
            className={
              label === "抵触していない"
                ? "w-1/3 text-green-400"
                : label === "抵触する可能性がある"
                ? "w-1/3 text-yellow-400"
                : "w-1/3 text-red-400"
            }
          >
            {label}
          </div>
        ))}
      </div>
      <div className="text-center mt-1 text-xs text-gray-400 md:ml-16">{xLabel}</div>
    </div>
  );
}
