"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import useSWR from "swr";
import clsx from "clsx";

import {
  API_BASE_URL,
  fetchAnalysisStatus,
  fetchProjectReport,
  AnalysisStep,
  ProcessFlowState,
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
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const handleSeekToTimecode = (seconds: number) => {
    const video = videoRef.current;
    if (video && !isImageProject) {
      // まず動画プレーヤーまでスクロール
      video.scrollIntoView({ behavior: "smooth", block: "center" });

      // シーク完了を待ってから再生
      const onSeeked = () => {
        video.play().catch((err) => {
          console.warn("Auto-play prevented:", err);
        });
        video.removeEventListener("seeked", onSeeked);
      };

      video.addEventListener("seeked", onSeeked);
      video.currentTime = seconds;
    }
  };

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

  const iterationLabel = useMemo(() => {
    const total = data?.total_iterations ?? 0;
    if (!total) {
      return "0 / 0";
    }
    const current = data?.current_iteration ?? 0;
    const clamped = Math.min(Math.max(current, 0), total);
    return `${clamped} / ${total}`;
  }, [data?.current_iteration, data?.total_iterations]);

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
            <h1 className="mt-2 text-4xl font-bold text-white">Project Evaluation Summary</h1>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-indigo-100 md:grid-cols-5">
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
              <div>
                <p className="text-indigo-300">イテレーション</p>
                <p className="text-sm font-semibold text-white">{iterationLabel}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
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
            <AnalysisNodeGraph steps={data.steps ?? []} processFlow={data.process_flow} />
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
                  videoRef={videoRef}
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
                    onSeekToTimecode={handleSeekToTimecode}
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
  // アップロードアイコン（情報摘出フェーズの外・上部中央）
  {
    id: "upload",
    label: "アップロード",
    iconKey: "upload",
    dependencies: [],
    position: { top: "5%", left: "50%" },
    description: "メディアファイルを安全なワークスペースへ配置し、以降の処理キューを起動します。"
  },
  // 情報摘出フェーズ (フェーズ枠: top: 18%, left: 6%, width: 88%, height: 22%)
  // 3つのアイコンを枠内で高さ中央揃え（アップロードおよび全アイコンの中央位置を揃える）
  {
    id: "audio",
    label: "音声解析",
    iconKey: "audio",
    dependencies: ["upload"],
    position: { top: "25%", left: "22%" },
    stepName: "音声文字起こし",
    description: "音声トラックを抽出し、話者ごとのテキスト・タイムコードを生成します。"
  },
  {
    id: "subtitle",
    label: "字幕摘出",
    iconKey: "subtitle",
    dependencies: ["upload"],
    position: { top: "25%", left: "50%" },
    stepName: "OCR字幕抽出",
    description: "フレーム単位でテロップ文字をOCRし、音声との差分も併せて補完します。"
  },
  {
    id: "visual",
    label: "映像表現",
    iconKey: "visual",
    dependencies: ["upload"],
    position: { top: "25%", left: "78%" },
    stepName: "映像解析",
    description: "構図・人物・シンボルの表現を抽出し、タグ分析に必要なシーン情報を整理します。"
  },
  // 分析フェーズ (フェーズ枠: top: 45%, left: 6%, width: 88%, height: 35%)
  // リスク分析3つを上段に均等配置、統合を下段中央に配置（全アイコンの中央位置を揃える）
  {
    id: "risk-a",
    label: "リスク分析1",
    iconKey: "risk-a",
    dependencies: ["audio", "subtitle", "visual"],
    position: { top: "51%", left: "22%" },
    stepName: "リスク統合",
    description: "社会的感度を中心に炎上事例DBと照合し、偏見・差別リスクを評価します。"
  },
  {
    id: "risk-b",
    label: "リスク分析2",
    iconKey: "risk-b",
    dependencies: ["risk-a"],
    position: { top: "51%", left: "50%" },
    stepName: "リスク統合",
    description: "社会的感度を中心に炎上事例DBと照合し、偏見・差別リスクを評価します。"
  },
  {
    id: "risk-c",
    label: "リスク分析3",
    iconKey: "risk-c",
    dependencies: ["risk-b"],
    position: { top: "51%", left: "78%" },
    stepName: "リスク統合",
    description: "社会的感度を中心に炎上事例DBと照合し、偏見・差別リスクを評価します。"
  },
  {
    id: "risk-merge",
    label: "リスク分析統合",
    iconKey: "risk-merge",
    dependencies: ["risk-a", "risk-b", "risk-c"],
    position: { top: "67%", left: "50%" },
    stepName: "リスク統合",
    description: "3種の分析結果を集約し、最悪グレード・検出文言を確定します。"
  },
  // レポート作成は分析フェーズの外、中央下に配置
  {
    id: "report",
    label: "レポート作成",
    iconKey: "report",
    dependencies: ["risk-merge"],
    position: { top: "86%", left: "50%" },
    description: "最終的なダッシュボード／PDF用レポートデータを生成します。"
  }
];

// フェーズ枠の配置設定
const PHASE_CONFIG = [
  {
    id: "extraction" as const,
    label: "情報摘出フェーズ",
    nodes: ["audio", "subtitle", "visual"],
    boxStyle: {
      top: "18%",
      left: "6%",
      width: "88%",
      height: "22%"
    }
  },
  {
    id: "analysis" as const,
    label: "分析フェーズ",
    nodes: ["risk-a", "risk-b", "risk-c", "risk-merge"],
    boxStyle: {
      top: "45%",
      left: "6%",
      width: "88%",
      height: "35%"
    }
  }
];

// ノード間の接続関係
const CONNECTOR_EDGES = [
  // 分析フェーズ内の接続（リスク分析1→2→3）
  { source: "risk-a", target: "risk-b" },
  { source: "risk-b", target: "risk-c" },
  // リスク分析3完了後、全リスク分析から統合へ接続
  { source: "risk-a", target: "risk-merge" },
  { source: "risk-b", target: "risk-merge" },
  { source: "risk-c", target: "risk-merge" },
  // 統合完了後、統合→レポートへ接続
  { source: "risk-merge", target: "report" }
];


const statusLabelMap: Record<NodeStatus, string> = {
  pending: "待機中",
  running: "処理中",
  success: "完了",
  failed: "失敗"
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

type PhaseState = {
  id: (typeof PHASE_CONFIG)[number]["id"];
  label: string;
  status: "pending" | "active" | "complete";
  boxStyle: (typeof PHASE_CONFIG)[number]["boxStyle"];
};

// AnalysisNodeGraphコンポーネント内での表示制御ロジック
function AnalysisNodeGraph({ steps, processFlow }: { steps: AnalysisStep[]; processFlow?: ProcessFlowState }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [paths, setPaths] = useState<ConnectorPath[]>([]);
  const [showExtractionPhase, setShowExtractionPhase] = useState(false);
  const [showAnalysisPhase, setShowAnalysisPhase] = useState(false);
  const [showRiskMergeConnectors, setShowRiskMergeConnectors] = useState(false);
  const [showRiskMerge, setShowRiskMerge] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // 情報摘出フェーズの完了状態を永続化
  const [extractionStatusCache, setExtractionStatusCache] = useState<Record<string, NodeStatus>>({});

  // リスク分析アイコンの完了状態を永続化
  const [riskAnalysisCache, setRiskAnalysisCache] = useState<Record<string, boolean>>({});

  const stepStatusMap = useMemo(() => {
    const map: Record<string, NodeStatus> = {};
    steps.forEach((step) => {
      map[step.name] = stepStatusToNode(step.status);
    });
    console.log("[DEBUG] stepStatusMap:", map);

    // 情報摘出フェーズの完了状態をキャッシュに保存
    const extractionSteps = ["音声文字起こし", "OCR字幕抽出", "映像解析"];
    extractionSteps.forEach((stepName) => {
      if (map[stepName] === "success") {
        setExtractionStatusCache((prev) => ({ ...prev, [stepName]: "success" }));
      }
    });

    return map;
  }, [steps]);

  const backendStatusMap = useMemo(() => {
    if (!processFlow) return undefined;
    const map: Record<string, NodeStatus> = {};
    processFlow.nodes.forEach((node) => {
      map[node.key] = stepStatusToNode(node.status);
    });
    console.log("[DEBUG] backendStatusMap:", map);
    console.log("[DEBUG] current_iteration:", processFlow.current_iteration);
    console.log("[DEBUG] total_iterations:", processFlow.total_iterations);
    return map;
  }, [processFlow]);

  const backendDependencies = useMemo(() => {
    if (!processFlow) return undefined;
    const map: Record<string, string[]> = {};
    processFlow.nodes.forEach((node) => {
      map[node.key] = node.dependencies ?? [];
    });
    return map;
  }, [processFlow]);

  const nodes = useMemo<RenderGraphNode[]>(() => {
    const currentIteration = processFlow?.current_iteration ?? 1;
    const totalIterations = processFlow?.total_iterations ?? 3;

    return BASE_GRAPH_NODES.map((node) => {
      const overrideDeps = backendDependencies?.[node.id];
      const effectiveDependencies: NodeIconKey[] =
        overrideDeps && overrideDeps.length > 0
          ? (overrideDeps as NodeIconKey[])
          : node.dependencies;
      let status: NodeStatus = "pending";

      // 情報摘出フェーズのアイコン：キャッシュを優先、次にstepStatusMapを使用（並行処理）
      if (node.id === "audio") {
        const cachedStatus = extractionStatusCache["音声文字起こし"];
        status = cachedStatus === "success" ? "success" : (stepStatusMap["音声文字起こし"] ?? "pending");
        console.log("[DEBUG] audio status:", status, "cached:", cachedStatus, "from stepStatusMap:", stepStatusMap["音声文字起こし"]);
      } else if (node.id === "subtitle") {
        const cachedStatus = extractionStatusCache["OCR字幕抽出"];
        status = cachedStatus === "success" ? "success" : (stepStatusMap["OCR字幕抽出"] ?? "pending");
        console.log("[DEBUG] subtitle status:", status, "cached:", cachedStatus, "from stepStatusMap:", stepStatusMap["OCR字幕抽出"]);
      } else if (node.id === "visual") {
        const cachedStatus = extractionStatusCache["映像解析"];
        status = cachedStatus === "success" ? "success" : (stepStatusMap["映像解析"] ?? "pending");
        console.log("[DEBUG] visual status:", status, "cached:", cachedStatus, "from stepStatusMap:", stepStatusMap["映像解析"]);
      }
      // アップロード：いずれかのステップが開始されたら成功
      else if (node.id === "upload") {
        status = steps.some((step) => step.status !== "pending") ? "success" : "pending";
      }
      // リスク分析のステータスをcurrent_iterationに基づいて設定（キャッシュを優先）
      else if (node.id === "risk-a") {
        if (riskAnalysisCache["risk-a"]) {
          status = "success";
        } else if (currentIteration > 1) {
          status = "success";
          setRiskAnalysisCache((prev) => ({ ...prev, "risk-a": true }));
        } else if (currentIteration === 1) {
          const riskStatus = stepStatusMap["リスク統合"] ?? "pending";
          status = riskStatus;
          if (riskStatus === "success") {
            setRiskAnalysisCache((prev) => ({ ...prev, "risk-a": true }));
          }
        }
      } else if (node.id === "risk-b") {
        if (riskAnalysisCache["risk-b"]) {
          status = "success";
        } else if (currentIteration > 2) {
          status = "success";
          setRiskAnalysisCache((prev) => ({ ...prev, "risk-b": true }));
        } else if (currentIteration === 2) {
          const riskStatus = stepStatusMap["リスク統合"] ?? "pending";
          status = riskStatus;
          if (riskStatus === "success") {
            setRiskAnalysisCache((prev) => ({ ...prev, "risk-b": true }));
          }
        } else {
          status = "pending";
        }
      } else if (node.id === "risk-c") {
        if (riskAnalysisCache["risk-c"]) {
          status = "success";
        } else if (currentIteration === 3) {
          const riskStatus = stepStatusMap["リスク統合"] ?? "pending";
          status = riskStatus;
          if (riskStatus === "success") {
            setRiskAnalysisCache((prev) => ({ ...prev, "risk-c": true }));
          }
        } else {
          status = "pending";
        }
      } else if (node.id === "risk-merge") {
        // すべてのイテレーションが完了したら統合を実行
        if (currentIteration >= totalIterations && stepStatusMap["リスク統合"] === "success") {
          status = "success";
        } else {
          status = "pending";
        }
      }
      // レポート：リスク統合完了後
      else if (node.id === "report") {
        const finalStatus = stepStatusMap["リスク統合"];
        status = finalStatus ? finalStatus : "pending";
      }
      // その他のノード：backendStatusMapを使用
      else if (backendStatusMap && backendStatusMap[node.id] != null) {
        status = backendStatusMap[node.id];
      }
      // stepNameが設定されている場合
      else if (node.stepName) {
        status = stepStatusMap[node.stepName] ?? "pending";
      }

      const detailBase = node.description || "";
      const detail =
        status === "failed"
          ? `${detailBase} 現在: エラー検知。ログから詳細を確認してください。`
          : `${detailBase} 現在: ${statusLabelMap[status]}`;
      return {
        ...node,
        status,
        dependencies: effectiveDependencies,
        detail
      };
    });
  }, [backendDependencies, backendStatusMap, stepStatusMap, steps, processFlow, extractionStatusCache, riskAnalysisCache]);

  const nodesById = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, node])),
    [nodes]
  );

  // アップロード完了チェック
  const uploadComplete = useMemo(() => {
    return nodesById["upload"]?.status === "success";
  }, [nodesById]);

  // 情報摘出フェーズ完了チェック
  const extractionComplete = useMemo(() => {
    const extractionNodes = ["audio", "subtitle", "visual"];
    return extractionNodes.every(nodeId => nodesById[nodeId]?.status === "success");
  }, [nodesById]);

  // risk-c完了チェック
  const riskCComplete = useMemo(() => {
    return nodesById["risk-c"]?.status === "success";
  }, [nodesById]);

  // risk-merge完了チェック
  const riskMergeComplete = useMemo(() => {
    return nodesById["risk-merge"]?.status === "success";
  }, [nodesById]);

  // アップロード完了時に情報摘出フェーズを表示
  useEffect(() => {
    if (uploadComplete && !showExtractionPhase) {
      setTimeout(() => setShowExtractionPhase(true), 500);
    }
  }, [uploadComplete, showExtractionPhase]);

  // 情報摘出フェーズ完了時に分析フェーズを即座に表示
  useEffect(() => {
    if (extractionComplete && !showAnalysisPhase) {
      setShowAnalysisPhase(true);
    }
  }, [extractionComplete, showAnalysisPhase]);

  // risk-c完了時に統合への接続線を表示
  useEffect(() => {
    if (riskCComplete && !showRiskMergeConnectors) {
      setTimeout(() => setShowRiskMergeConnectors(true), 300);
    }
  }, [riskCComplete, showRiskMergeConnectors]);

  // 統合への接続線表示後にrisk-mergeノードを表示
  useEffect(() => {
    if (showRiskMergeConnectors && !showRiskMerge) {
      setTimeout(() => setShowRiskMerge(true), 300);
    }
  }, [showRiskMergeConnectors, showRiskMerge]);

  // risk-merge完了後にreportを表示
  useEffect(() => {
    if (riskMergeComplete && !showReport) {
      setTimeout(() => setShowReport(true), 500);
    }
  }, [riskMergeComplete, showReport]);

  const phaseStates = useMemo<PhaseState[]>(() => {
    const states: PhaseState[] = [];
    PHASE_CONFIG.forEach((phase, index) => {
      const nodeStatuses = phase.nodes.map(
        (nodeId) => nodesById[nodeId]?.status ?? "pending"
      );
      const isComplete =
        nodeStatuses.length > 0 && nodeStatuses.every((status) => status === "success");
      const hasProgress = nodeStatuses.some(
        (status) => status === "running" || status === "success"
      );
      const prevComplete = index === 0 ? true : states[index - 1].status === "complete";
      let status: PhaseState["status"] = "pending";
      if (isComplete) {
        status = "complete";
      } else if (prevComplete || hasProgress) {
        status = "active";
      }
      states.push({
        id: phase.id,
        label: phase.label,
        status,
        boxStyle: phase.boxStyle
      });
    });
    return states;
  }, [nodesById]);

  const pathEdges = useMemo(
    () => CONNECTOR_EDGES.map((edge) => ({ source: edge.source, target: edge.target })),
    []
  );

  useLayoutEffect(() => {
    const computePaths = () => {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const newPaths: ConnectorPath[] = [];

      // アップロード→情報摘出フェーズの接続線（中央列アイコンのx位置に揃える）
      if (uploadComplete && showExtractionPhase) {
        const uploadEl = nodeRefs.current["upload"];
        const subtitleEl = nodeRefs.current["subtitle"]; // 中央列の情報摘出アイコン
        if (uploadEl && subtitleEl) {
          const uploadRect = uploadEl.getBoundingClientRect();
          const subtitleRect = subtitleEl.getBoundingClientRect();
          const x1 = uploadRect.left - containerRect.left + uploadRect.width / 2;
          const y1 = uploadRect.top - containerRect.top + uploadRect.height / 2;
          // 情報摘出フェーズの上端、x位置は中央アイコンに揃える
          const x2 = subtitleRect.left - containerRect.left + subtitleRect.width / 2;
          const y2 = containerRect.height * 0.18;
          const d = `M ${x1} ${y1} L ${x2} ${y2}`;
          newPaths.push({
            id: "upload-extraction-phase",
            d,
            status: extractionComplete ? "success" : "running"
          });
        }
      }

      // 情報摘出フェーズ→分析フェーズの接続線（中央列アイコンのx位置に揃える）
      if (extractionComplete && showAnalysisPhase) {
        const subtitleEl = nodeRefs.current["subtitle"]; // 情報摘出フェーズ中央アイコン
        const riskBEl = nodeRefs.current["risk-b"]; // 分析フェーズ中央アイコン
        if (subtitleEl && riskBEl) {
          const subtitleRect = subtitleEl.getBoundingClientRect();
          const riskBRect = riskBEl.getBoundingClientRect();
          const x1 = subtitleRect.left - containerRect.left + subtitleRect.width / 2;
          const y1 = containerRect.height * 0.4; // 情報摘出フェーズ下端
          const x2 = riskBRect.left - containerRect.left + riskBRect.width / 2;
          const y2 = containerRect.height * 0.45; // 分析フェーズ上端
          const d = `M ${x1} ${y1} L ${x2} ${y2}`;
          newPaths.push({
            id: "extraction-phase-analysis-phase",
            d,
            status: "success"
          });
        }
      }

      // 既存のノード間接続
      pathEdges.forEach(({ source, target }) => {
        const fromEl = nodeRefs.current[source];
        const toEl = nodeRefs.current[target];
        if (!fromEl || !toEl) return;
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const x1 = fromRect.left - containerRect.left + fromRect.width / 2;
        const y1 = fromRect.top - containerRect.top + fromRect.height / 2;
        const x2 = toRect.left - containerRect.left + toRect.width / 2;
        const y2 = toRect.top - containerRect.top + toRect.height / 2;
        const d = `M ${x1} ${y1} L ${x2} ${y2}`;
        const targetStatus = nodesById[target]?.status ?? "pending";
        newPaths.push({
          id: `${source}-${target}`,
          d,
          status: targetStatus
        });
      });
      setPaths(newPaths);
    };

    computePaths();
    window.addEventListener("resize", computePaths);
    return () => window.removeEventListener("resize", computePaths);
  }, [nodesById, pathEdges, showExtractionPhase, showAnalysisPhase, showRiskMergeConnectors, showRiskMerge, showReport, uploadComplete, extractionComplete]);

  const statusClass = (status: NodeStatus) =>
    clsx("analysis-node", {
      "status-pending": status === "pending",
      "status-running": status === "running",
      "status-success": status === "success",
      "status-failed": status === "failed"
    });

  // フィルタリング: 表示すべきノードのみ
  const visibleNodes = nodes.filter(node => {
    // アップロードは常に表示
    if (node.id === "upload") return true;
    // 情報摘出フェーズのノードはアップロード完了後に表示
    if (["audio", "subtitle", "visual"].includes(node.id)) return showExtractionPhase;
    // 分析フェーズのノードは情報摘出完了後に表示
    if (!showAnalysisPhase) return false;
    // risk-mergeは統合への接続線表示後に表示
    if (node.id === "risk-merge" && !showRiskMerge) return false;
    // レポートはrisk-merge完了後に表示
    if (node.id === "report" && !showReport) return false;
    return true;
  });

  return (
    <div className="mt-4">
      <div ref={containerRef} className="analysis-node-container">
        {phaseStates.map((phase) => {
          // 情報摘出フェーズはアップロード完了後に表示
          if (phase.id === "extraction" && !showExtractionPhase) return null;
          // 分析フェーズは情報摘出完了後に表示
          if (phase.id === "analysis" && !showAnalysisPhase) return null;

          return (
            <div
              key={phase.id}
              className={clsx("phase-outline", `phase-outline-${phase.id}`, {
                "phase-outline-active": phase.status === "active",
                "phase-outline-complete": phase.status === "complete",
                "phase-fade-in": (phase.id === "extraction" && showExtractionPhase) || (phase.id === "analysis" && showAnalysisPhase)
              })}
              style={phase.boxStyle}
            >
              <span className="phase-outline-label">{phase.label}</span>
            </div>
          );
        })}
        
        
        <svg className="connector-svg" width="100%" height="100%" preserveAspectRatio="none">
          {paths.map((path) => {
            // フェーズ間接続線は常に表示（既に条件付きで追加されている）
            if (path.id === "upload-extraction-phase" || path.id === "extraction-phase-analysis-phase") {
              return (
                <path
                  key={path.id}
                  d={path.d}
                  className={clsx("connector-line", {
                    "status-running": path.status === "running",
                    "status-success": path.status === "success",
                    "status-failed": path.status === "failed"
                  })}
                />
              );
            }

            // 非表示ノードへの線は描画しない
            const sourceNode = visibleNodes.find(n => path.id.startsWith(n.id + "-"));
            const targetNode = visibleNodes.find(n => path.id.endsWith("-" + n.id));
            if (!sourceNode || !targetNode) return null;

            // risk-mergeへの接続線は、showRiskMergeConnectorsがtrueの時のみ表示
            if (path.id.endsWith("-risk-merge") && !showRiskMergeConnectors) return null;

            return (
              <path
                key={path.id}
                d={path.d}
                className={clsx("connector-line", {
                  "status-running": path.status === "running",
                  "status-success": path.status === "success",
                  "status-failed": path.status === "failed"
                })}
              />
            );
          })}
        </svg>
        
        {visibleNodes.map((node) => {
          const iconSrc = NODE_ICON_SOURCES[node.iconKey];
          const isNewlyVisible = 
            (node.id === "risk-merge" && showRiskMerge) ||
            (node.id === "report" && showReport);
          
          return (
            <div
              key={node.id}
              ref={(el) => {
                nodeRefs.current[node.id] = el;
              }}
              className={clsx(statusClass(node.status), {
                "node-fade-in": isNewlyVisible
              })}
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
                {/* 常時表示のラベル（ステータスアイコンなし） */}
                <div className="node-label">
                  {node.label}
                </div>
                {/* ホバー時のみ表示する説明 */}
                <div className="node-tooltip">
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
          height: 720px;
          margin-top: 1rem;
          border-radius: 1.25rem;
          border: 1px solid rgba(99, 102, 241, 0.4);
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
          overflow: visible;
        }
        .phase-outline {
          position: absolute;
          border-radius: 1.5rem;
          border: 2px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.35);
          transition: border-color 0.4s ease, box-shadow 0.4s ease, opacity 0.4s ease;
          pointer-events: none;
          z-index: 1;
        }
        .phase-fade-in {
          animation: fadeInPhase 0.8s ease-out;
        }
        @keyframes fadeInPhase {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .phase-outline-label {
          position: absolute;
          top: 8px;
          left: 16px;
          font-size: 0.78rem;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(226, 232, 240, 0.7);
        }
        .phase-outline-extraction {
          border-color: rgba(96, 165, 250, 0.25);
        }
        .phase-outline-analysis {
          border-color: rgba(251, 146, 60, 0.25);
        }
        .phase-outline-active.phase-outline-extraction {
          border-color: rgba(96, 165, 250, 0.75);
          box-shadow: 0 0 18px rgba(96, 165, 250, 0.5);
          animation: pulsePhase 1.5s infinite;
        }
        .phase-outline-complete.phase-outline-extraction {
          border-color: rgba(52, 211, 153, 0.75);
          background: rgba(52, 211, 153, 0.1);
          box-shadow: 0 0 18px rgba(52, 211, 153, 0.5);
          animation: none;
        }
        .phase-outline-active.phase-outline-analysis {
          border-color: rgba(251, 146, 60, 0.75);
          box-shadow: 0 0 18px rgba(251, 146, 60, 0.45);
          animation: pulsePhase 1.5s infinite;
        }
        .phase-outline-complete.phase-outline-analysis {
          border-color: rgba(52, 211, 153, 0.75);
          background: rgba(52, 211, 153, 0.1);
          box-shadow: 0 0 18px rgba(52, 211, 153, 0.5);
          animation: none;
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
        .node-fade-in {
          animation: fadeInNode 0.6s ease-out;
        }
        @keyframes fadeInNode {
          from {
            opacity: 0;
            transform: scale(0.5);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
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
        .analysis-node .node-label {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          font-weight: 600;
          font-size: 0.85rem;
          color: #e2e8f0;
          white-space: nowrap;
          text-align: center;
          pointer-events: none;
        }
        .analysis-node .node-tooltip {
          position: absolute;
          bottom: calc(100% + 36px);
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
            height: 640px;
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
        @keyframes pulsePhase {
          0%, 100% {
            box-shadow: 0 0 18px rgba(96, 165, 250, 0.5);
          }
          50% {
            box-shadow: 0 0 28px rgba(96, 165, 250, 0.7);
          }
        }
      `}</style>
    </div>
  );
}

export default SummaryPageClient;
