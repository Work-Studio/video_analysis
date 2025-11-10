"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";

import ProgressPanel from "@/components/ProgressPanel";
import {
  API_BASE_URL,
  fetchAnalysisStatus,
  fetchProjectReport,
  ProjectReportResponse,
} from "@/lib/apiClient";
import { formatSecondsHuman, MediaPreview, PrintableSummary } from "./shared";

interface SummaryPageClientProps {
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

function SummaryPageClient({ params }: SummaryPageClientProps) {
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
      refreshInterval: POLL_INTERVAL_MS,
    },
  );

  const isImageProject = data?.media_type === "image";
  const isCompleted =
    data?.status === "completed" && (data.analysis_progress ?? 0) >= 1;
  const mediaUrl = useMemo(() => {
    if (!data?.media_url) return null;
    try {
      return new URL(data.media_url, API_BASE_URL).toString();
    } catch (err) {
      console.warn("Failed to resolve media URL", err);
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
    <main className="min-h-screen bg-[#0b1120] text-gray-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-20 pt-10">
        <div className="flex flex-col gap-2 text-xs text-indigo-200 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 rounded-full border border-indigo-500 px-3 py-1 font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
          >
            ← ホームに戻る
          </Link>
          <span className="text-slate-400">Project ID: {data.id}</span>
        </div>
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-indigo-300">Creative Guard</p>
            <h1 className="mt-2 text-4xl font-bold text-white">プロジェクト解析サマリー</h1>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-indigo-100 md:grid-cols-4">
              <div>
                <p className="text-indigo-300">メディア種別</p>
                <p className="text-sm font-semibold text-white">{data.media_type === "image" ? "画像" : "動画"}</p>
              </div>
              <div>
                <p className="text-indigo-300">ステータス</p>
                <p className="text-sm font-semibold text-white">{data.status}</p>
              </div>
              <div>
                <p className="text-indigo-300">解析時間</p>
                <p className="text-sm font-semibold text-white">{analysisDurationLabel}</p>
              </div>
              <div>
                <p className="text-indigo-300">対象メディア時間</p>
                <p className="text-sm font-semibold text-white">{videoDurationLabel}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <div className="relative flex h-24 w-24 items-center justify-center">
                <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="#1e293b"
                    strokeWidth="10"
                    fill="none"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="#6366f1"
                    strokeWidth="10"
                    fill="none"
                    strokeDasharray="282.6"
                    strokeDashoffset={((100 - progressPercentage) / 100) * 282.6}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-xl font-semibold text-white">{progressPercentage}%</span>
              </div>
              <p className="text-xs text-indigo-200">進捗状況</p>
            </div>
            <div className="rounded-xl bg-indigo-900/40 p-4">
              <dl className="space-y-2 text-xs text-indigo-100">
                <div className="flex items-center justify-between gap-4">
                  <dt>推定単位時間コスト</dt>
                  <dd className="text-sm font-semibold text-white">{perSecondLabel}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>最終更新</dt>
                  <dd className="text-sm font-semibold text-white">{data.analysis_completed_at ?? "-"}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt>解析開始</dt>
                  <dd className="text-sm font-semibold text-white">{data.analysis_started_at ?? "-"}</dd>
                </div>
              </dl>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)]">
          <div className="rounded-2xl border border-indigo-900/40 bg-slate-900/40 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">解析プロセス</h2>
            <p className="mt-2 text-xs text-indigo-200">バックエンドパイプラインのステップごとの状況</p>
            <div className="mt-4 space-y-4">
              <ProgressPanel steps={data.steps} />
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-900/40 bg-slate-900/40 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">アップロードメディア</h2>
            <p className="mt-2 text-xs text-indigo-200">
              {isImageProject ? "解析対象の画像プレビュー" : "解析対象の動画プレビュー"}
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-indigo-900/40 bg-black/40">
              {mediaUrl ? (
                <MediaPreview
                  mediaType={isImageProject ? "image" : "video"}
                  src={mediaUrl}
                  onDurationChange={(duration) => setVideoDuration(duration)}
                />
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-indigo-200">
                  メディアを取得できませんでした。
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-indigo-900/40 bg-slate-900/40 p-6 shadow-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">レポート</h2>
              <p className="mt-1 text-xs text-indigo-200">
                最終解析結果と推奨事項を確認できます。
              </p>
            </div>

            <div className="flex flex-col items-start gap-2 text-xs text-indigo-200 md:flex-row md:items-center md:gap-4">
              <div className="flex items-center gap-1">
                <span className="inline-flex h-2 w-2 rounded-full bg-indigo-400" />
                <span>進捗: {progressPercentage}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                <span>レポート取得{report ? "済" : "未"}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 text-xs text-indigo-200 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-300">用紙向き:</span>
                <button
                  type="button"
                  onClick={() => setOrientation("portrait")}
                  className={`rounded border px-2 py-1 text-xs ${orientation === "portrait" ? "border-indigo-400 bg-indigo-500 text-white" : "border-slate-500 bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
                >
                  縦 (A4)
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation("landscape")}
                  className={`rounded border px-2 py-1 text-xs ${orientation === "landscape" ? "border-indigo-400 bg-indigo-500 text-white" : "border-slate-500 bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
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
                <button
                  onClick={() => window.print()}
                  disabled={!report}
                  className="inline-flex items-center justify-center rounded border border-slate-500 px-3 py-2 text-xs font-semibold text-indigo-200 shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-600 disabled:text-slate-500"
                >
                  印刷プレビューを開く
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-xs text-indigo-200">
              <span>解析ステータス: {data.status}</span>
              <span>完了日時: {data.analysis_completed_at ?? "-"}</span>
            </div>
          </div>

          {reportError && (
            <p className="mt-3 text-sm text-red-400">{reportError}</p>
          )}

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
              <div className="space-y-6">
                <div className="rounded-lg bg-white p-4 text-slate-900 shadow">
                  <PrintableSummary
                    report={report}
                    projectTitle={report.title}
                    companyName={report.company_name}
                    productName={report.product_name}
                    orientation={orientation}
                    mediaType={report.media_type}
                  />
                </div>

              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default SummaryPageClient;
