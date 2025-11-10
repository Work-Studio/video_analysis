import { AnalysisStep } from "@/lib/apiClient";

interface PreviewPaneProps {
  steps: AnalysisStep[];
}

/**
 * 各ステップのプレビュー文字列を折り畳み表示するコンポーネント.
 */
export default function PreviewPane({ steps }: PreviewPaneProps) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-800 p-4 shadow-sm">
      {steps.map((step) => (
        <details
          key={step.name}
          className="rounded border border-gray-600 bg-gray-900 p-3"
          open={step.status === "completed"}
        >
          <summary className="cursor-pointer text-sm font-semibold text-gray-200">
            {step.name}
          </summary>
          <div className="mt-2 max-h-[65vh] overflow-auto rounded bg-gray-950/40 p-3 text-xs text-gray-100">
            <pre className="whitespace-pre-wrap text-[13px] leading-relaxed">
              {step.payload?.preview || "処理中..."}
            </pre>
          </div>
        </details>
      ))}
    </div>
  );
}
