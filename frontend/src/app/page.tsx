"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    // 初期表示ではプロジェクト一覧(アップロード画面)へ遷移
    router.replace("/projects");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-lg text-slate-500">読み込み中...</p>
    </main>
  );
}
