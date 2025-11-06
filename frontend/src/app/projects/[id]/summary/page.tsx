"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";

import ProgressPanel from "@/components/ProgressPanel";
import PreviewPane from "@/components/PreviewPane";
import {
  API_BASE_URL,
  fetchAnalysisStatus,
  fetchProjectReport,
  ProjectReportResponse
} from "@/lib/apiClient";

interface SummaryPageProps {
  params: {
    id: string;
  };
}

const POLL_INTERVAL_MS = 3000;

declare global {
  interface Window {
    html2pdf?: any;
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

const LEGAL_STATUS_BRIDGE = {
  抵触していない: "適切",
  抵触する可能性がある: "修正検討",
  抵触している: "要修正"
} as const;

function mapLegalGradeToLegacy(grade: string): string {
  return LEGAL_STATUS_BRIDGE[grade as keyof typeof LEGAL_STATUS_BRIDGE] ?? grade;
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

function formatSecondsHuman(seconds: number): string {
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

const MATRIX_X_LABELS = ["抵触していない", "抵触する可能性がある", "抵触している"] as const;
const MATRIX_Y_LABELS = ["E", "D", "C", "B", "A"] as const;

function normalizeMatrixPosition(
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

function resolveMatrixCell(legalGrade: string, socialGrade: string): MatrixCellProfile {
  const profile = getStatusProfile(legalGrade, socialGrade);
  return {
    headline: profile.badge,
    description: profile.description,
    bgClass: profile.matrixBg,
    textClass: profile.matrixText
  };
}

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

export default function SummaryPage({ params }: SummaryPageProps) {
  const { id } = params;
  const [report, setReport] = useState<ProjectReportResponse | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isFetchingReport, setIsFetchingReport] = useState(false);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  const { data, error, isLoading } = useSWR(
    ["analysis-status", id],
    () => fetchAnalysisStatus(id),
    {
      refreshInterval: POLL_INTERVAL_MS
    }
  );

  const isImageProject = data?.media_type === "image";
  const isCompleted =
    data?.status === "completed" && (data.analysis_progress ?? 0) >= 1;
  const mediaUrl = useMemo(() => {
    if (!data?.media_url) return null;
    try {
      return new URL(data.media_url, API_BASE_URL).toString();
    } catch (error) {
      console.warn("Failed to resolve media URL", error);
      return `${API_BASE_URL.replace(/\/$/, "")}${data.media_url}`;
    }
  }, [data?.media_url]);

  useEffect(() => {
    if (!isCompleted) {
      setReport(null);
      setReportError(null);
      return;
    }
    if (report) {
      return;
    }

    let isMounted = true;

    const loadReport = async () => {
      setIsFetchingReport(true);
      setReportError(null);
      try {
        const result = await fetchProjectReport(id);
        if (isMounted) {
          setReport(result);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setReportError("レポートの取得に失敗しました。時間を置いて再試行してください。");
        }
      } finally {
        if (isMounted) {
          setIsFetchingReport(false);
        }
      }
    };

    void loadReport();

    return () => {
      isMounted = false;
    };
  }, [id, isCompleted, report]);

  useEffect(() => {
    setVideoDuration(null);
  }, [mediaUrl, isImageProject]);

  const mediaType = data?.media_type;
  const rawAnalysisDuration = data?.analysis_duration_seconds;
  const analysisDurationSeconds =
    typeof rawAnalysisDuration === "number" ? rawAnalysisDuration : null;

  const perSecondCost = useMemo(() => {
    if (mediaType !== "video") {
      return null;
    }
    if (analysisDurationSeconds == null) {
      return null;
    }
    if (videoDuration == null || !Number.isFinite(videoDuration) || videoDuration <= 0) {
      return null;
    }
    return analysisDurationSeconds / videoDuration;
  }, [mediaType, analysisDurationSeconds, videoDuration]);

  const analysisDurationLabel = useMemo(() => {
    if (analysisDurationSeconds == null) {
      return isCompleted ? "算出待ち" : "計測中...";
    }
    return formatSecondsHuman(analysisDurationSeconds);
  }, [analysisDurationSeconds, isCompleted]);

  const videoDurationLabel = useMemo(() => {
    if (isImageProject) {
      return "-";
    }
    if (videoDuration == null) {
      return "取得中...";
    }
    return formatSecondsHuman(videoDuration);
  }, [isImageProject, videoDuration]);

  const perSecondLabel = useMemo(() => {
    if (mediaType !== "video") {
      return "-";
    }
    if (perSecondCost == null) {
      return isCompleted ? "算出待ち" : "計測中...";
    }
    return `${perSecondCost.toFixed(2)} 秒/秒`;
  }, [mediaType, perSecondCost, isCompleted]);

  async function handleFetchReport() {
    setIsFetchingReport(true);
    setReportError(null);
    try {
      const result = await fetchProjectReport(id);
      setReport(result);
    } catch (err) {
      console.error(err);
      setReportError("レポートの取得に失敗しました。時間を置いて再試行してください。");
    } finally {
      setIsFetchingReport(false);
    }
  }

  const reportButtonLabel = report ? "レポートを再取得" : "レポートを表示";

  if (error) {
    return (
      <main className="min-h-screen bg-[#1a1a2e] text-white">
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-4 px-6 text-center text-red-300">
          <p>ステータス取得に失敗しました。ページをリロードしてください。</p>
        <Link href="/projects" className="text-indigo-300 underline">
          アップロード画面へ戻る
        </Link>
        </div>
      </main>
    );
  }

  if (isLoading || !data) {
    return (
      <main className="min-h-screen bg-[#1a1a2e] text-white">
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-gray-300">進捗を取得しています...</p>
        </div>
      </main>
    );
  }

  const progressPercentage = Math.round((data.analysis_progress ?? 0) * 100);

  return (
    <main className="min-h-screen bg-[#1a1a2e] text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">会社名</p>
            <h1 className="text-3xl font-bold text-white">{data.company_name}</h1>
            <p className="mt-2 text-sm text-gray-300">商品名: {data.product_name}</p>
            <p className="text-sm text-gray-300">タイトル: {data.title}</p>
            <p className="text-sm text-gray-400">メディア種別: {isImageProject ? "画像" : "動画"}</p>
          </div>
          <Link
            href="/projects"
            className="text-sm font-semibold text-indigo-300 hover:text-indigo-200"
          >
            + 新しい動画をアップロード
          </Link>
        </div>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 shadow-sm">
            <p className="text-sm font-semibold text-indigo-200">進捗</p>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-300">{progressPercentage}% 完了</p>
          </div>
          <ProgressPanel steps={data.steps} />
        </div>
        <PreviewPane steps={data.steps} />
      </section>

      <div className="flex flex-col gap-6">
        {mediaUrl && (
          <section className="rounded-lg border border-gray-700 bg-gray-900 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-indigo-200">アップロードメディア</h2>
            <p className="text-[11px] text-gray-400">処理対象の{isImageProject ? "画像" : "動画"}を確認できます。</p>
            <div className="mt-3 overflow-hidden rounded-lg border border-gray-700 bg-black/40">
              <MediaPreview
                mediaType={isImageProject ? "image" : "video"}
                src={mediaUrl}
                onDurationChange={
                  isImageProject
                    ? undefined
                    : (duration) => {
                        if (Number.isFinite(duration)) {
                          setVideoDuration(duration);
                        }
                      }
                }
              />
            </div>
            {data.media_type === "video" && (
              <div className="mt-4 space-y-2 rounded-lg border border-gray-700 bg-gray-800 p-4 text-xs text-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">解析時間</span>
                  <span className="font-semibold">{analysisDurationLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">動画尺</span>
                  <span className="font-semibold">{videoDurationLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">1秒あたり処理時間</span>
                  <span className="font-semibold">{perSecondLabel}</span>
                </div>
                {perSecondCost != null && (
                  <p className="text-[11px] text-gray-400">
                    1秒の映像を処理するのに {perSecondCost.toFixed(2)} 秒かかりました。
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <section className="rounded-lg border border-gray-700 bg-gray-900 p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-indigo-200">最終レポート</h2>
              <p className="text-xs text-gray-300">
                全てのステップ完了後に出力ボタンが有効になります。
              </p>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:space-x-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-300">用紙向き:</span>
                <button
                  type="button"
                  onClick={() => setOrientation("portrait")}
                  className={`rounded border px-2 py-1 text-xs ${
                    orientation === "portrait"
                      ? "border-indigo-400 bg-indigo-500 text-white"
                      : "border-slate-500 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  縦 (A4)
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation("landscape")}
                  className={`rounded border px-2 py-1 text-xs ${
                    orientation === "landscape"
                      ? "border-indigo-400 bg-indigo-500 text-white"
                      : "border-slate-500 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  横 (A4)
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleFetchReport}
                  disabled={!isCompleted || isFetchingReport}
                  className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-600"
                >
                  {isFetchingReport ? "取得中..." : reportButtonLabel}
                </button>
              </div>
            </div>
          </div>

          {reportError && (
            <p className="mt-3 text-sm text-red-400">{reportError}</p>
          )}

          <div className="flex flex-col gap-3 pt-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-gray-300">
              プレビューの内容はブラウザの印刷機能から直接印刷できます。（推奨設定: A4 / {orientation === "portrait" ? "縦" : "横"}向き）
            </p>
            <button
              onClick={() => window.print()}
              disabled={!report}
              className="inline-flex items-center justify-center rounded border border-gray-500 px-3 py-1 text-xs font-semibold text-gray-200 shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:border-gray-600 disabled:text-gray-500"
            >
              印刷プレビューを開く
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {!isCompleted && (
              <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-6 text-sm text-gray-300">
                分析の完了後にレポートがここに表示されます。
              </div>
            )}

            {isCompleted && !report && !reportError && (
              <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-4 py-6 text-sm text-gray-200">
                <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                <span>レポートを準備しています...</span>
              </div>
            )}

            {report && (
              <div className="text-slate-900">
                <PrintableSummary
                  report={report}
                  projectTitle={report.title}
                  companyName={report.company_name}
                  productName={report.product_name}
                  orientation={orientation}
                  mediaType={report.media_type}
                />
              </div>
            )}
          </div>
        </section>
      </div>
      </div>
    </main>
  );
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

export function MediaPreview({
  mediaType,
  src,
  onDurationChange
}: {
  mediaType: string;
  src: string;
  onDurationChange?: (duration: number) => void;
}) {
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

  type TagChartItem = {
    tag: string;
    subTag: string;
    grade: keyof typeof EVAL_MAP;
    reason: string;
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
          reason: tag.reason ?? "",
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
    [report.final_report.sections.transcription, report.final_report.sections.ocr, report.final_report.sections.video_analysis]
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
        className="printable-summary avoid-break mt-10 w-full rounded-xl border border-slate-200 bg-white p-8 text-slate-800 shadow-lg print:mt-0 print:border-0 print:px-10 print:py-12 print:shadow-none"
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
                <h4 className="text-sm font-semibold text-slate-300">社会的感度タグサマリー</h4>
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  {socialTagBars.map((entry) => {
                    const style = EVAL_MAP[entry.grade] ?? EVAL_MAP["N/A"];
                    return (
                      <div
                        key={`social-tag-bar-${entry.tag}-${entry.subTag}`}
                        className="flex w-28 max-w-[8rem] flex-col items-center gap-2 text-center text-xs text-gray-200"
                      >
                        <div className="flex h-32 w-full items-end justify-center rounded bg-gray-600 shadow-inner">
                          <div
                            className={`w-full rounded-t ${style.color}`}
                            style={{ height: `${style.width}%` }}
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="block text-[11px] font-semibold text-gray-100">
                            {entry.tag}
                          </span>
                          <span className="block text-[10px] text-gray-300">{entry.subTag}</span>
                        </div>
                        <span
                          className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-[10px] font-semibold ${style.chipBg} ${style.chipText}`}
                        >
                          {style.label}
                        </span>
                        {entry.detectedText && (
                          <span className="max-h-20 overflow-hidden text-[10px] leading-snug text-indigo-200">
                            {entry.detectedText}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-6 space-y-6">
              {Array.from(groupedTagData.entries()).map(([tagName, items]) => {
                const mainInfo = tagMainMap.get(tagName);
                const mainEval = mainInfo?.grade && mainInfo.grade in EVAL_MAP ? mainInfo.grade : "N/A";
                const mainStyle = EVAL_MAP[mainEval as keyof typeof EVAL_MAP];
                const hasSubTags =
                  Array.isArray((mainInfo as any)?.related_sub_tags) &&
                  ((mainInfo as any)?.related_sub_tags?.length ?? 0) > 0;
                const filtered = hasSubTags
                  ? items.filter((item) => item.subTag !== "総合評価")
                  : items;
                const itemsToRender = filtered.length > 0 ? filtered : items;
                return (
                  <div key={tagName} className="rounded-lg bg-gray-700 p-4 shadow-xl">
                    <div className={`p-2 mb-4 border-b ${mainStyle.borderColor}`}>
                      <h4 className="text-xl font-semibold text-indigo-200">{tagName}</h4>
                      {mainInfo?.reason && (
                        <p className="mt-2 text-xs text-gray-300">評価理由: {mainInfo.reason}</p>
                      )}
                      {mainInfo?.detected_text && (
                        <p className="mt-1 text-xs text-indigo-200">
                          検出文言: {mainInfo.detected_text}
                        </p>
                      )}
                    </div>
                    <div className="space-y-4">
                      {itemsToRender.map((item) => {
                        const style = EVAL_MAP[item.grade] ?? EVAL_MAP["N/A"];
                        return (
                          <div key={`${tagName}-${item.subTag}`} className="space-y-1">
                            <div className="flex items-center justify-between gap-3 text-sm text-gray-200">
                              <span className="font-medium">
                                {item.subTag}
                                {item.grade !== mainEval ? ` (${item.grade})` : ""}
                              </span>
                              <span
                                className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${style.chipBg} ${style.chipText}`}
                              >
                                {style.label}
                              </span>
                            </div>
                            <div className="bar-height bg-gray-600 overflow-hidden shadow-inner">
                              <div
                                className={`bar-segment bar-height ${style.color}`}
                                style={{ width: `${style.width}%` }}
                              />
                            </div>
                            {item.detectedText && (
                              <p className="text-[11px] text-indigo-200">
                                検出文言: {item.detectedText}
                              </p>
                            )}
                            {item.reason && (
                              <p className="text-[11px] text-gray-300">評価理由: {item.reason}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div
        className="printable-summary avoid-break mx-auto mt-6 w-full rounded-xl border border-slate-200 bg-white p-8 text-slate-800 shadow-lg print:mt-8 print:border-0 print:px-10 print:py-12 print:shadow-none"
        style={{ ...printableStyle, pageBreakBefore: "always" }}
      >
        <h3 className="text-lg font-semibold text-slate-800">詳細内訳</h3>
        <p className="text-xs text-slate-500">
          以下は解析結果の全文です。必要に応じて参照してください。
        </p>
        <div className="mt-4 space-y-4 text-xs leading-relaxed">
          {detailSections.map((section) => (
            <div key={section.title} style={blockStyle}>
              <h4 className="font-semibold text-slate-600">{section.title}</h4>
              <pre className="mt-1 whitespace-pre-wrap border border-slate-200 bg-slate-50 p-3">
                {section.content}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
