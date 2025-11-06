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

export const MATRIX_X_LABELS = ["抵触していない", "抵触する可能性がある", "抵触している"] as const;
export const MATRIX_Y_LABELS = ["E", "D", "C", "B", "A"] as const;

const LEGAL_STATUS_BRIDGE = {
  抵触していない: "適切",
  抵触する可能性がある: "修正検討",
  抵触している: "要修正"
} as const;

export function mapLegalGradeToLegacy(grade: string): NormalizedLegal {
  const mapped = LEGAL_STATUS_BRIDGE[grade as keyof typeof LEGAL_STATUS_BRIDGE] ?? grade;
  if (mapped === "適切" || mapped === "修正検討" || mapped === "要修正") {
    return mapped;
  }
  return "修正検討";
}

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

export function getStatusProfile(legalGrade: string, socialGrade: string): StatusProfile {
  const normalized = mapLegalGradeToLegacy(legalGrade);
  const key = socialGrade as SocialGrade;
  const group = STATUS_PROFILES[normalized];
  if (group && group[key]) {
    return group[key] as StatusProfile;
  }
  return DEFAULT_STATUS_PROFILE;
}

export function resolveActionStatus(legalGrade: string, socialGrade: string): ActionStatusProfile {
  const profile = getStatusProfile(legalGrade, socialGrade);
  return {
    badge: profile.badge,
    description: profile.description,
    bgColor: profile.badgeBg,
    textColor: profile.badgeText
  };
}

export const EVAL_MAP = {
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

export const EVAL_SCORE = {
  "N/A": 0,
  E: 5,
  D: 4,
  C: 3,
  B: 2,
  A: 1
} as const;

export const LEGAL_MAP = {
  抵触していない: { borderColor: "border-green-500", textColor: "text-green-500" },
  抵触する可能性がある: { borderColor: "border-yellow-500", textColor: "text-yellow-400" },
  抵触している: { borderColor: "border-red-500", textColor: "text-red-500" }
} as const;

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

export function MatrixView({
  xLabel,
  yLabel,
  position
}: {
  xLabel: string;
  yLabel: string;
  position: number[] | undefined;
}) {
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
              const profile = getStatusProfile(xLabelValue, yLabelValue);
              const inactiveClasses = "bg-gray-800 text-gray-500";
              const activeClasses = `${profile.matrixBg} ${profile.matrixText} border-4 border-amber-400 scale-105`;
              return (
                <div
                  key={`${xLabelValue}-${yLabelValue}`}
                  className={`matrix-cell border border-gray-700 p-3 flex items-center justify-center text-sm font-bold h-28 transition duration-300 ease-in-out ${
                    isActive ? activeClasses : inactiveClasses
                  }`}
                >
                  <div className="text-center leading-tight">
                    <span className="block text-sm font-semibold">{profile.badge}</span>
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

export function MediaPreview({ mediaType, src }: { mediaType: string; src: string }) {
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
    >
      お使いのブラウザは動画再生に対応していません。
    </video>
  );
}

export function PrintableSummary({
  report,
  projectTitle,
  companyName,
  productName,
  orientation,
  mediaType
}: {
  report: ProjectReportResponse;
  projectTitle: string;
  companyName: string;
  productName: string;
  orientation: "portrait" | "landscape";
  mediaType: string;
}) {
  const legalGrade = report.final_report.risk.legal.grade;
  const socialGrade = report.final_report.risk.social.grade;

  const socialStyle = EVAL_MAP[(socialGrade in EVAL_MAP ? socialGrade : "N/A") as keyof typeof EVAL_MAP];
  const legalStyle =
    LEGAL_MAP[legalGrade as keyof typeof LEGAL_MAP] ??
    LEGAL_MAP["抵触する可能性がある"];

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

  const printableStyle: React.CSSProperties = { width: "100%", backgroundColor: "#ffffff" };

  const printOrientationStyle = `@media print {
    @page { size: A4 ${orientation}; margin: 12mm; }
    body { -webkit-print-color-adjust: exact; }
    .printable-summary {
      width: ${orientation === "portrait" ? "185mm" : "270mm"} !important;
      min-height: ${orientation === "portrait" ? "265mm" : "200mm"} !important;
      padding: 10mm !important;
      box-sizing: border-box;
      margin: 0 auto !っと;
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
    [report.final_report.sections.transcription, report.final_report.sections.ocr, report.final_report.sections.video_analysis]
  );

  return (
    <div className="printable-container">
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
          font-size: 8rem;
          font-weight: 900;
          color: #1f2937;
          transform: rotate(-25deg);
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
      <div
        className={`printable-summary avoid-break mx-auto mt-10 rounded-xl border border-slate-200 bg-white p-8 text-slate-800 shadow-lg print:mt-0 print:border-0 print:px-10 print:py-12 print:shadow-none ${orientation === "landscape" ? "w-full xl:w-[1200px]" : "w-full xl:w-[960px]"}`}
        style={printableStyle}
      >
        <header className="flex flex-col gap-4 border-b pb-4" style={blockStyle}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-extrabold text-indigo-500">Creative Guard</h2>
              <p className="text-xs text-slate-400">リスク評価ダッシュボード</p>
              <p className="mt-3 text-sm text-slate-500">会社名: {companyName}</p>
              <p className="text-sm text-slate-500">商品名: {productName}</p>
              <p className="text-sm text-slate-500">タイトル: {projectTitle}</p>
              <p className="text-xs text-slate-400">メディア種別: {mediaLabel}</p>
            </div>
            <div className={`flex h-16 items-center justify-center rounded-full px-5 text-sm font-semibold shadow-lg ${actionStatus.bgColor} ${actionStatus.textColor}`}>
              {actionStatus.badge}
            </div>
          </div>
          <p className="text-sm text-slate-600">{actionStatus.description}</p>
        </header>

        <p className="mt-4 text-sm text-slate-600">{report.final_report.summary}</p>

        <section className="mt-6 space-y-4" style={blockStyle}>
          <h3 className="text-lg font-semibold text-slate-800">リスクサマリー</h3>
          <div className={riskSummaryGridClass}>
            <div className="rounded-lg border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-600">社会的感度</h4>
              <p className={`mt-2 text-4xl font-extrabold ${socialStyle.textColor}`}>
                {socialGrade}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {report.final_report.risk.social.reason}
              </p>
              {socialFindings.length > 0 && (
                <ul className="mt-2 space-y-1 rounded border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                  {socialFindings.map((finding, index) => (
                    <li key={`${finding.timecode}-${index}`}>
                      <span className="font-semibold text-slate-700">{finding.timecode}</span>
                      <span className="ml-2">{finding.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-600">法務評価</h4>
              <p className={`mt-2 text-2xl font-bold ${legalStyle.textColor}`}>
                {legalGrade}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {report.final_report.risk.legal.reason}
              </p>
              {legalFindings.length > 0 && (
                <ul className="mt-2 space-y-1 rounded border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                  {legalFindings.map((finding, index) => (
                    <li key={`${finding.timecode}-${index}`}>
                      <span className="font-semibold text-slate-700">{finding.timecode}</span>
                      <span className="ml-2">{finding.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
              {legalViolations.length > 0 && (
                <div className="mt-3 space-y-1 rounded border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold text-slate-600">抵触可能な表現・文言</p>
                  <ul className="space-y-1 text-[10px] text-slate-600">
                    {legalViolations.map((violation, index) => (
                      <li key={`${violation.reference ?? "violation"}-${index}`}>
                        {violation.reference && (
                          <span className="font-semibold text-slate-700">
                            [{violation.reference}]
                          </span>
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
            </div>
            {burnRiskCount > 0 && (
              <div className="rounded-lg border border-slate-200 p-4">
                <h4 className="text-sm font-semibold text-slate-600">炎上可能性補正</h4>
                <p className="mt-2 text-2xl font-bold text-rose-600">
                  {burnRisk?.grade ?? "-"}
                </p>
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
              </div>
            )}
          </div>
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
            <p className="mt-2 text-[10px] text-slate-400">
              注記: {report.final_report.risk.note}
            </p>
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
            <h3 className="text-lg font-semibold text-slate-800">タグ別詳細評価（A:低リスク 〜 E:高リスク）</h3>
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
*** End of File
