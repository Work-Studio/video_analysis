import { AnalysisStep } from "@/lib/apiClient";

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return "✅";
    case "running":
      return "⏳";
    case "failed":
      return "⚠️";
    default:
      return "🕓";
  }
}

interface ProgressPanelProps {
  steps: AnalysisStep[];
}

/**
 * 各ステップの進行状況をリスト表示する軽量パネル.
 */
export default function ProgressPanel({ steps }: ProgressPanelProps) {
  return (
    <ul className="hidden space-y-2 rounded-lg border border-gray-700 bg-gray-800 p-4 shadow-sm">
      {steps.map((step) => (
        <li
          key={step.name}
          className="flex items-center justify-between text-sm font-medium text-gray-200"
        >
          <span className="flex items-center gap-2">
            <span>{statusIcon(step.status)}</span>
            <span>{step.name}</span>
          </span>
          <span className="text-xs uppercase text-gray-400">{step.status}</span>
        </li>
      ))}
    </ul>
  );
}
