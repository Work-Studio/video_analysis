import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../app/globals.css";

export const metadata: Metadata = {
  title: "Video Analysis Dashboard",
  description: "動画分析パイプラインの進捗を管理するフロントエンド"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
