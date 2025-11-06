"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
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

export default function ProjectsPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [productName, setProductName] = useState("");
  const [title, setTitle] = useState("");
  const [model, setModel] = useState(MODEL_OPTIONS[0]?.value ?? "standard");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { mutate } = useSWRConfig();
  const {
    data: projects,
    isLoading: isListLoading,
    error: listError
  } = useSWR("projects", fetchProjects, { refreshInterval: 15_000 });

  const sortedProjects = useMemo<ProjectSummary[] | undefined>(() => {
    if (!projects) return undefined;
    return [...projects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
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
        formData.append("company_name", companyName || "未設定企業");
        formData.append("product_name", productName || "未設定商品");
        formData.append("title", title || file.name);
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
        setCompanyName("");
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

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Creative Guard</h1>
        <p className="text-sm text-slate-600">
          動画または画像ファイルをアップロードすると、AI が音声文字起こし・OCR・映像解析・リスク統合まで自動実行します。
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="company_name" className="block text-sm font-semibold text-slate-700">
                会社名
              </label>
              <input
                id="company_name"
                name="company_name"
                type="text"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="例: サンプル株式会社"
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="product_name" className="block text-sm font-semibold text-slate-700">
                商品名
              </label>
              <input
                id="product_name"
                name="product_name"
                type="text"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                placeholder="例: 次世代アプリ"
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="title" className="block text-sm font-semibold text-slate-700">
              タイトル
            </label>
            <input
              id="title"
              name="title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例: 製品紹介動画 2024Q4"
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="model" className="block text-sm font-semibold text-slate-700">
              分析プリセット
            </label>
            <select
              id="model"
              name="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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

      <section className="space-y-4">
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
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
