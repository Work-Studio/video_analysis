"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import {
  createProject,
  fetchProjects,
  startAnalysis,
  type ProjectCreatedResponse,
  type ProjectSummary
} from "@/lib/apiClient";

const MODEL_OPTIONS = [
  { value: "standard", label: "標準分析" },
  { value: "strict", label: "リスク重視" },
  { value: "light", label: "高速サマリー" }
];

type UploadMode = "single" | "csv";

export default function ProjectsPage() {
  const router = useRouter();
  const [uploadMode, setUploadMode] = useState<UploadMode>("single");
  const [companyName, setCompanyName] = useState("");
  const [productName, setProductName] = useState("");
  const [title, setTitle] = useState("");
  const [model] = useState("standard");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const { mutate } = useSWRConfig();
  const {
    data: projects,
    isLoading: isListLoading,
    error: listError
  } = useSWR("projects", fetchProjects, { refreshInterval: 15_000 });

  useEffect(() => {
    const userInfo = localStorage.getItem("user_info");
    if (userInfo) {
      const parsed = JSON.parse(userInfo);
      setIsAdmin(parsed.is_admin || false);
      setCompanyName(parsed.company_name || "");
    }
  }, []);

  const sortedProjects = useMemo<ProjectSummary[] | undefined>(() => {
    if (!projects) return undefined;
    return [...projects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [projects]);

  // Extract unique product names from past projects
  const pastProductNames = useMemo<string[]>(() => {
    if (!projects) return [];
    const names = new Set<string>();
    projects.forEach(project => {
      if (project.product_name) {
        names.add(project.product_name);
      }
    });
    return Array.from(names).sort();
  }, [projects]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("video_file") as HTMLInputElement | null;
    const files = fileInput?.files ? Array.from(fileInput.files) : [];

    if (!files.length) {
      setErrorMessage("動画または画像ファイルを選択してください。");
      return;
    }

    setIsSubmitting(true);
    try {
      const createdProjects: ProjectCreatedResponse[] = [];
      const failures: string[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append("company_name", companyName);
        formData.append("product_name", productName);
        formData.append("title", title);
        formData.append("model", model);
        formData.append("video_file", file);
        try {
          const project = await createProject(formData);
          createdProjects.push(project);
          await startAnalysis(project.id);
        } catch (uploadError) {
          console.error(uploadError);
          failures.push(file.name);
        }
      }

      if (createdProjects.length) {
        form.reset();
        setProductName("");
        setTitle("");
        await mutate("projects");
      }

      if (failures.length) {
        setErrorMessage(`以下のファイルでエラーが発生しました: ${failures.join(", ")}`);
      }

      if (createdProjects.length === 1) {
        router.push(`/projects/${createdProjects[0].id}/summary`);
      } else if (createdProjects.length > 1) {
        setSuccessMessage(`${createdProjects.length} 件の分析を開始しました。下部の一覧から進捗を確認できます。`);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("プロジェクト作成に失敗しました。再度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_info");
    router.push("/login");
  };

  const handleCsvUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!csvFile) {
      setErrorMessage("CSVファイルを選択してください。");
      return;
    }

    setIsSubmitting(true);
    try {
      // TODO: Implement CSV upload API call
      setSuccessMessage("CSV一括アップロード機能は準備中です。");
      setCsvFile(null);
      const form = event.currentTarget;
      form.reset();
    } catch (error) {
      console.error(error);
      setErrorMessage("CSV一括アップロードに失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadCsvTemplate = () => {
    const csvContent = "商品名,タイトル,ファイルパス\n製品A,キャンペーン1,/path/to/video1.mp4\n製品B,キャンペーン2,/path/to/video2.mp4";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteProject = async (projectId: string, projectTitle: string) => {
    if (!confirm(`本当に「${projectTitle}」を削除しますか？\n\nこの操作は取り消せません。`)) {
      return;
    }

    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        setErrorMessage("認証トークンが見つかりません。再度ログインしてください。");
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"}/projects/${projectId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Delete error:", errorText);

        // 認証エラーの場合はログインページにリダイレクト
        if (response.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("user_info");
          alert("セッションが期限切れです。再度ログインしてください。");
          router.push("/login");
          return;
        }

        throw new Error(`プロジェクトの削除に失敗しました: ${errorText}`);
      }

      setSuccessMessage("プロジェクトを削除しました");
      await mutate("projects");
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "プロジェクトの削除に失敗しました");
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Side Menu */}
      <aside className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-900">Creative Guard</h2>
          <p className="text-xs text-slate-500 mt-1">広告リスク分析システム</p>
        </div>

        <nav className="space-y-2 flex-1">
          <Link
            href="/projects"
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-50 text-indigo-700 font-medium"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            ホーム
          </Link>

          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-700 hover:bg-slate-100 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              管理者画面
            </Link>
          )}
        </nav>

        {/* Logout Button */}
        <div className="border-t border-slate-200 pt-4">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition w-full"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            ログアウト
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 px-8 py-12">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 space-y-2">
            <h1 className="text-3xl font-bold text-slate-900">プロジェクト管理</h1>
            <p className="text-sm text-slate-600">
              動画または画像ファイルをアップロードすると、AI が音声文字起こし・OCR・映像解析・リスク統合まで自動実行します。
            </p>
          </header>

          {/* Upload Mode Tabs */}
          <div className="mb-6 border-b border-slate-200">
            <nav className="-mb-px flex space-x-8">
              <button
                type="button"
                onClick={() => setUploadMode("single")}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  uploadMode === "single"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                単一アップロード
              </button>
              <button
                type="button"
                onClick={() => setUploadMode("csv")}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  uploadMode === "csv"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                CSV一括アップロード
              </button>
            </nav>
          </div>

      {uploadMode === "single" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="product_name" className="block text-sm font-semibold text-slate-700">
                商品名 <span className="text-red-500">*</span>
              </label>
              <input
                id="product_name"
                name="product_name"
                type="text"
                list="product-names"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                required
                placeholder="例: 次世代アプリ"
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40"
              />
              <datalist id="product-names">
                {pastProductNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {pastProductNames.length > 0 && (
                <p className="text-xs text-slate-500">
                  過去の商品名から選択、または新しい商品名を入力できます
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="title" className="block text-sm font-semibold text-slate-700">
                タイトル <span className="text-red-500">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                placeholder="例: 製品紹介動画 2024Q4"
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="video_file"
              className="block text-sm font-semibold text-slate-700"
            >
              動画 / 画像ファイル
            </label>
            <input
              id="video_file"
              name="video_file"
              type="file"
              accept="video/*,image/*"
              multiple
              className="w-full rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500"
            />
            <p className="text-xs text-slate-400">
              MP4 / MOV / JPG など主要フォーマットに対応しています。
            </p>
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}
          {successMessage && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            className="flex w-full items-center justify-center rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white shadow hover:bg-brand-dark focus:outline-none focus:ring-4 focus:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? "アップロード中..." : "アップロードして分析開始"}
          </button>
        </form>
      </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
          <h2 className="text-xl font-bold text-slate-900 mb-4">CSV一括アップロード</h2>
          <p className="text-sm text-slate-600 mb-6">
            規定のCSVフォーマットで複数のプロジェクトを一括登録できます。
          </p>

          <form className="space-y-6" onSubmit={handleCsvUpload}>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">CSVフォーマット</h3>
                <p className="text-xs text-blue-800 mb-3">
                  以下の形式でCSVファイルを作成してください：
                </p>
                <div className="bg-white border border-blue-200 rounded p-3 font-mono text-xs text-slate-700">
                  商品名,タイトル,ファイルパス
                  <br />
                  製品A,キャンペーン1,/path/to/video1.mp4
                  <br />
                  製品B,キャンペーン2,/path/to/video2.mp4
                </div>
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  className="mt-3 text-xs text-blue-700 hover:text-blue-800 font-medium underline"
                >
                  テンプレートをダウンロード
                </button>
              </div>

              <div className="space-y-2">
                <label htmlFor="csv_file" className="block text-sm font-semibold text-slate-700">
                  CSVファイル <span className="text-red-500">*</span>
                </label>
                <input
                  id="csv_file"
                  name="csv_file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  required
                  className="w-full rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500"
                />
                <p className="text-xs text-slate-500">
                  .csv形式のファイルをアップロードしてください
                </p>
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs text-amber-800">
                <strong>注意:</strong> CSV一括アップロード機能は現在準備中です。CSVフォーマットの仕様は今後変更される可能性があります。
              </p>
            </div>

            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white shadow hover:bg-brand-dark focus:outline-none focus:ring-4 focus:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
            >
              {isSubmitting ? "アップロード中..." : "CSV一括アップロード"}
            </button>
          </form>
        </section>
      )}

      <section className="space-y-4 mt-8">
        <header className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-slate-900">過去の分析結果</h2>
          <p className="text-sm text-slate-600">
            これまでにアップロードした動画・画像のレポートを再確認できます。
          </p>
        </header>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {listError && (
            <p className="text-sm text-red-500">プロジェクト一覧の取得に失敗しました。</p>
          )}
          {isListLoading && !sortedProjects && (
            <p className="text-sm text-slate-500">読み込み中...</p>
          )}
          {sortedProjects && sortedProjects.length === 0 && (
            <p className="text-sm text-slate-500">まだ分析済みのプロジェクトはありません。</p>
          )}
          {sortedProjects && sortedProjects.length > 0 && (
            <ul className="divide-y divide-slate-200">
              {sortedProjects.map((project) => (
                <li key={project.id} className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {project.company_name} / {project.product_name}
                    </p>
                    <p className="text-xs text-slate-500">{project.title}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(project.updated_at).toLocaleString()} ・ {project.media_type === "image" ? "🖼 静止画" : "🎬 動画"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${project.status === "completed" ? "bg-emerald-100 text-emerald-700" : project.status === "failed" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
                      {project.status}
                    </span>
                    <span className="text-xs text-slate-500">進捗: {Math.round(project.analysis_progress * 100)}%</span>
                    <Link
                      href={`/projects/${project.id}/summary`}
                      className="rounded border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                    >
                      詳細を表示
                    </Link>
                    <button
                      onClick={() => handleDeleteProject(project.id, project.title)}
                      className="rounded border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      title="削除"
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
        </div>
      </main>
    </div>
  );
}
