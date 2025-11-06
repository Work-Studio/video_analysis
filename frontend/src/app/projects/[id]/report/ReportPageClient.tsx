"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  API_BASE_URL,
  fetchProjectReport,
  ProjectReportResponse,
} from "@/lib/apiClient";
import { PrintableSummary, MediaPreview } from "../summary/shared";

interface ReportPageClientProps {
  params: {
    id: string;
  };
}

export default function ReportPageClient({ params }: ReportPageClientProps) {
  const { id } = params;
  const router = useRouter();
  const [report, setReport] = useState<ProjectReportResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("landscape");

  useEffect(() => {
    let mounted = true;
    const loadReport = async () => {
      try {
        const data = await fetchProjectReport(id);
        if (mounted) {
          setReport(data);
        }
      } catch (error) {
        console.error(error);
        if (mounted) {
          setErrorMessage("レポートの取得に失敗しました。ページを再読み込みしてください。");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadReport();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-slate-500">レポートを読み込んでいます...</p>
        </div>
      </main>
    );
  }

  if (errorMessage || !report) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-6 text-center">
          <p className="text-sm text-rose-600">{errorMessage ?? "レポートが見つかりません。"}</p>
          <Link
            href={`/projects/${id}/summary`}
            className="text-sm font-semibold text-indigo-500 hover:text-indigo-400"
          >
            サマリーページへ戻る
          </Link>
        </div>
      </main>
    );
  }

  const mediaUrl = (() => {
    try {
      return new URL(report.media_url, API_BASE_URL).toString();
    } catch (error) {
      console.warn("Failed to resolve media URL", error);
      return `${API_BASE_URL.replace(/\/$/, "")}${report.media_url}`;
    }
  })();

  const isImageProject = report.media_type === "image";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Creative Guard Report</p>
            <h1 className="text-3xl font-bold text-slate-900">{report.title}</h1>
            <p className="mt-2 text-sm text-slate-600">会社名: {report.company_name}</p>
            <p className="text-sm text-slate-600">商品名: {report.product_name}</p>
            <p className="text-sm text-slate-600">メディア種別: {isImageProject ? "画像" : "動画"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setOrientation("portrait")}
              className={`rounded border px-3 py-2 text-xs font-semibold ${
                orientation === "portrait"
                  ? "border-indigo-400 bg-indigo-500 text-white"
                  : "border-slate-400 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              縦 (A4)
            </button>
            <button
              onClick={() => setOrientation("landscape")}
              className={`rounded border px-3 py-2 text-xs font-semibold ${
                orientation === "landscape"
                  ? "border-indigo-400 bg-indigo-500 text-white"
                  : "border-slate-400 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              横 (A4)
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center justify-center rounded border border-slate-400 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
            >
              印刷プレビューを開く
            </button>
            <Link
              href={`/projects/${id}/summary`}
              className="text-xs font-semibold text-indigo-500 hover:text-indigo-400"
            >
              サマリーページに戻る
            </Link>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          {mediaUrl && (
            <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700">アップロードメディア</h2>
              <p className="text-[11px] text-slate-500">処理対象の{isImageProject ? "画像" : "動画"}を確認できます。</p>
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-black/5">
                <MediaPreview mediaType={isImageProject ? "image" : "video"} src={mediaUrl} />
              </div>
            </article>
          )}
        </section>

        <PrintableSummary
          report={report}
          projectTitle={report.title}
          companyName={report.company_name}
          productName={report.product_name}
          orientation={orientation}
          mediaType={report.media_type}
        />
      </div>
    </main>
  );
}
