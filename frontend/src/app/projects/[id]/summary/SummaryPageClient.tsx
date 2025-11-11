"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import useSWR from "swr";
import clsx from "clsx";

import ProgressPanel from "@/components/ProgressPanel";
import {
  API_BASE_URL,
  fetchAnalysisStatus,
  fetchProjectReport,
  AnalysisStep,
  ProjectReportResponse,
} from "@/lib/apiClient";
import { formatSecondsHuman, MediaPreview, PrintableSummary } from "./shared";

interface SummaryPageClientProps {
  params: {
    id: string;
  };
}

const POLL_INTERVAL_MS = 3000;

const NODE_ICON_SOURCES = {
  upload: "/icons/アップロード.svg",
  audio: "/icons/音声解析.svg",
  subtitle: "/icons/字幕摘出.svg",
  visual: "/icons/映像表現.svg",
  "risk-a": "/icons/リスク分析1.svg",
  "risk-b": "/icons/リスク分析2.svg",
  "risk-c": "/icons/リスク分析3.svg",
  "risk-merge": "/icons/リスク分析統合.svg",
  report: "/icons/レポート作成.svg"
} as const;

type NodeIconKey = keyof typeof NODE_ICON_SOURCES;

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
  useEffect(() => {
    if (data) {
      console.log("[SummaryPage] analysis status payload", data);
    }
  }, [data]);

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
      console.log("[SummaryPage] report already loaded", report.id);
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
          console.log("[SummaryPage] fetched report payload", result);
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

  useEffect(() => {
    if (report) {
      console.log("[SummaryPage] report state changed", report);
    }
  }, [report]);

  useEffect(() => {
    if (reportError) {
      console.warn("[SummaryPage] report error", reportError);
    }
  }, [reportError]);

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

        <section className="flex flex-col gap-6">
          <div className="rounded-2xl border border-indigo-900/40 bg-slate-900/40 p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">解析プロセス</h2>
            <p className="mt-2 text-xs text-indigo-200">バックエンドパイプラインのステップごとの状況</p>
            <AnalysisNodeGraph steps={data.steps ?? []} />
            <div className="mt-6 space-y-4">
              <ProgressPanel steps={data.steps ?? []} />
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

type NodeStatus = "pending" | "running" | "success" | "failed";

type GraphNode = {
  id: NodeIconKey;
  label: string;
  iconKey: NodeIconKey;
  position: { top: string; left: string };
  dependencies: NodeIconKey[];
  description: string;
  stepName?: string;
};

const BASE_GRAPH_NODES: GraphNode[] = [
  {
    id: "upload",
    label: "アップロード",
    iconKey: "upload",
    dependencies: [],
    position: { top: "20%", left: "8%" },
    description: "メディアファイルを安全なワークスペースへ配置し、以降の処理キューを起動します。"
  },
  {
    id: "audio",
    label: "音声解析",
    iconKey: "audio",
    dependencies: ["upload"],
    position: { top: "20%", left: "24%" },
    stepName: "音声文字起こし",
    description: "音声トラックを抽出し、話者ごとのテキスト・タイムコードを生成します。"
  },
  {
    id: "subtitle",
    label: "字幕摘出",
    iconKey: "subtitle",
    dependencies: ["audio"],
    position: { top: "20%", left: "40%" },
    stepName: "OCR字幕抽出",
    description: "フレーム単位でテロップ文字をOCRし、音声との差分も併せて補完します。"
  },
  {
    id: "visual",
    label: "映像表現",
    iconKey: "visual",
    dependencies: ["subtitle"],
    position: { top: "20%", left: "56%" },
    stepName: "映像解析",
    description: "構図・人物・シンボルの表現を抽出し、タグ分析に必要なシーン情報を整理します。"
  },
  {
    id: "risk-a",
    label: "リスク分析1（並列）",
    iconKey: "risk-a",
    dependencies: ["visual"],
    position: { top: "45%", left: "40%" },
    stepName: "リスク統合",
    description: "社会的感度を中心に炎上事例DBと照合し、偏見・差別リスクを評価します。"
  },
  {
    id: "risk-b",
    label: "リスク分析2（並列）",
    iconKey: "risk-b",
    dependencies: ["visual"],
    position: { top: "45%", left: "56%" },
    stepName: "リスク統合",
    description: "広告・表示関連法規の観点で法務NGワードや表現をスキャンします。"
  },
  {
    id: "risk-c",
    label: "リスク分析3（並列）",
    iconKey: "risk-c",
    dependencies: ["visual"],
    position: { top: "45%", left: "72%" },
    stepName: "リスク統合",
    description: "ブランド毀損・ジェンダーバランスなど独自指標で炎上可能性を再検証します。"
  },
  {
    id: "risk-merge",
    label: "リスク分析統合",
    iconKey: "risk-merge",
    dependencies: ["risk-a", "risk-b", "risk-c"],
    position: { top: "70%", left: "56%" },
    stepName: "リスク統合",
    description: "3種の分析結果を集約し、最悪グレード・検出文言を確定します。"
  },
  {
    id: "report",
    label: "レポート作成",
    iconKey: "report",
    dependencies: ["risk-merge"],
    position: { top: "70%", left: "80%" },
    description: "最終的なダッシュボード／PDF用レポートデータを生成します。"
  }
];

const statusLabelMap: Record<NodeStatus, string> = {
  pending: "待機中",
  running: "処理中",
  success: "完了",
  failed: "失敗"
};

const statusIconMap: Record<NodeStatus, string> = {
  pending: "🕓",
  running: "⏳",
  success: "✅",
  failed: "⚠️"
};

const stepStatusToNode = (status?: string): NodeStatus => {
  switch (status) {
    case "running":
      return "running";
    case "completed":
      return "success";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
};

type RenderGraphNode = GraphNode & {
  status: NodeStatus;
  detail: string;
};

type ConnectorPath = {
  id: string;
  d: string;
  status: NodeStatus;
};

function AnalysisNodeGraph({ steps }: { steps: AnalysisStep[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [paths, setPaths] = useState<ConnectorPath[]>([]);

  const stepStatusMap = useMemo(() => {
    const map: Record<string, NodeStatus> = {};
    steps.forEach((step) => {
      map[step.name] = stepStatusToNode(step.status);
    });
    return map;
  }, [steps]);

  const nodes = useMemo<RenderGraphNode[]>(() => {
    return BASE_GRAPH_NODES.map((node) => {
      const matchingStep = node.stepName
        ? steps.find((step) => step.name === node.stepName)
        : undefined;
      let status: NodeStatus = "pending";
      if (node.stepName) {
        status = stepStatusMap[node.stepName] ?? "pending";
      } else if (node.id === "upload") {
        status = steps.some((step) => step.status !== "pending") ? "success" : "pending";
      } else if (node.id === "report") {
        const finalStatus = stepStatusMap["リスク統合"];
        status = finalStatus ? finalStatus : "pending";
      }
      const detailBase = node.description || "";
      const detail =
        status === "failed"
          ? `${detailBase} 現在: エラー検知。ログから詳細を確認してください。`
          : `${detailBase} 現在: ${statusLabelMap[status]}`;
      return {
        ...node,
        status,
        detail
      };
    });
  }, [stepStatusMap, steps]);

  useLayoutEffect(() => {
    const computePaths = () => {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const newPaths: ConnectorPath[] = [];
      nodes.forEach((node) => {
        node.dependencies.forEach((depId) => {
          const fromEl = nodeRefs.current[depId];
          const toEl = nodeRefs.current[node.id];
          if (!fromEl || !toEl) return;
          const fromRect = fromEl.getBoundingClientRect();
          const toRect = toEl.getBoundingClientRect();
          const x1 = fromRect.left - containerRect.left + fromRect.width / 2;
          const y1 = fromRect.top - containerRect.top + fromRect.height / 2;
          const x2 = toRect.left - containerRect.left + toRect.width / 2;
          const y2 = toRect.top - containerRect.top + toRect.height / 2;
          const controlOffsetX = (x2 - x1) * 0.5;
          const controlOffsetY = (y2 - y1) * 0.5;
          const d = `M ${x1} ${y1} C ${x1 + controlOffsetX} ${y1}, ${x2 - controlOffsetX} ${y2}, ${x2} ${y2}`;
          newPaths.push({
            id: `${depId}-${node.id}`,
            d,
            status: node.status
          });
        });
      });
      setPaths(newPaths);
    };

    computePaths();
    window.addEventListener("resize", computePaths);
    return () => window.removeEventListener("resize", computePaths);
  }, [nodes]);

  const statusClass = (status: NodeStatus) =>
    clsx("analysis-node", {
      "status-pending": status === "pending",
      "status-running": status === "running",
      "status-success": status === "success",
      "status-failed": status === "failed"
    });

  return (
    <div className="mt-4">
      <div ref={containerRef} className="analysis-node-container">
        <svg className="connector-svg">
          {paths.map((path) => (
            <path
              key={path.id}
              d={path.d}
              className={clsx("connector-line", {
                "status-running": path.status === "running",
                "status-success": path.status === "success",
                "status-failed": path.status === "failed"
              })}
            />
          ))}
        </svg>
        {nodes.map((node) => {
          const iconSrc = NODE_ICON_SOURCES[node.iconKey];
          return (
            <div
              key={node.id}
              ref={(el) => {
                nodeRefs.current[node.id] = el;
              }}
              className={statusClass(node.status)}
              style={{ top: node.position.top, left: node.position.left }}
            >
              <div className="node-pill" aria-label={node.label}>
                <Image
                  src={iconSrc}
                  alt={`${node.label} アイコン`}
                  width={36}
                  height={36}
                  className="node-icon"
                />
                <span className="sr-only">{node.label}</span>
                <div className="node-tooltip">
                  <p className="node-title">
                    {statusIconMap[node.status]} {node.label}
                  </p>
                  <p className="node-tooltip-text">{node.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <style jsx>{`
        .analysis-node-container {
          position: relative;
          width: 100%;
          max-width: 100%;
          height: 640px;
          margin-top: 1rem;
          border-radius: 1.25rem;
          border: 1px solid rgba(99, 102, 241, 0.4);
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
          overflow: visible;
        }
        .analysis-node {
          position: absolute;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 72px;
          height: 72px;
          border-radius: 9999px;
          z-index: 5;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .analysis-node .node-pill {
          position: relative;
          width: 60px;
          height: 60px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgba(15, 23, 42, 0.85);
          border: 1.5px solid rgba(148, 163, 184, 0.6);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.35);
          cursor: default;
        }
        .analysis-node .node-pill::after {
          content: "";
          position: absolute;
          inset: -6px;
          border-radius: 9999px;
          border: 1.5px dashed rgba(148, 163, 184, 0.5);
          opacity: 0.7;
        }
        .analysis-node.status-running .node-pill::after {
          border-color: rgba(96, 165, 250, 0.8);
          animation: rotate-ring 1.2s linear infinite;
        }
        .analysis-node .node-icon {
          width: 36px;
          height: 36px;
          object-fit: contain;
        }
        .analysis-node .node-tooltip {
          position: absolute;
          bottom: calc(100% + 12px);
          left: 50%;
          transform: translate(-50%, 10px);
          min-width: 220px;
          padding: 0.75rem;
          border-radius: 0.6rem;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.4);
          color: #e2e8f0;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.6);
          text-align: left;
        }
        .analysis-node .node-tooltip::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border-width: 6px;
          border-style: solid;
          border-color: rgba(15, 23, 42, 0.95) transparent transparent transparent;
        }
        .analysis-node .node-title {
          font-weight: 600;
          font-size: 0.85rem;
          margin-bottom: 0.2rem;
          display: block;
        }
        .analysis-node .node-tooltip-text {
          font-size: 0.75rem;
          line-height: 1.4;
          color: #cbd5f5;
        }
        .analysis-node .node-pill:hover .node-tooltip {
          opacity: 1;
          transform: translate(-50%, 0);
        }
        .analysis-node .node-pill:focus-visible {
          outline: 2px solid #818cf8;
          outline-offset: 4px;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          border: 0;
        }
        .analysis-node.status-running .node-pill {
          border-color: #60a5fa;
          box-shadow: 0 0 25px rgba(96, 165, 250, 0.4);
        }
        .analysis-node.status-success .node-pill {
          border-color: #34d399;
          box-shadow: 0 0 25px rgba(52, 211, 153, 0.4);
        }
        .analysis-node.status-failed .node-pill {
          border-color: #f87171;
          box-shadow: 0 0 25px rgba(248, 113, 113, 0.5);
        }
        .connector-svg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .connector-line {
          stroke: #475569;
          stroke-width: 3px;
          stroke-linecap: round;
          stroke-dasharray: 6 6;
          fill: none;
          filter: drop-shadow(0 0 6px rgba(148, 163, 184, 0.4));
        }
        .connector-line.status-running {
          stroke: #60a5fa;
          stroke-dasharray: 6 6;
          animation: flow 1.2s linear infinite;
        }
        .connector-line.status-success {
          stroke: #34d399;
        }
        .connector-line.status-failed {
          stroke: #f87171;
        }
        @media (max-width: 768px) {
          .analysis-node-container {
            height: 560px;
          }
          .analysis-node {
            width: 56px;
            height: 56px;
          }
          .analysis-node .node-pill {
            width: 48px;
            height: 48px;
          }
        }
        @keyframes flow {
          from {
            stroke-dashoffset: 0;
          }
          to {
            stroke-dashoffset: -20;
          }
        }
        @keyframes rotate-ring {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default SummaryPageClient;
