"use client";

import React from "react";
import type { AnnotationAnalysisResponse } from "@/lib/apiClient";

interface AnnotationDisplayProps {
  annotations: AnnotationAnalysisResponse;
  onSeekToTimecode?: (seconds: number) => void;
}

/**
 * タイムコード文字列を秒数に変換する
 */
function parseTimecode(timecode: string | undefined | null): number | null {
  if (!timecode || timecode === "静止画" || timecode === "N/A") {
    return null;
  }

  const parts = timecode.trim().split(":");
  if (parts.length === 0 || parts.length > 3) {
    return null;
  }

  try {
    const numbers = parts.map((p) => parseInt(p, 10));
    if (numbers.some((n) => isNaN(n) || n < 0)) {
      return null;
    }

    if (numbers.length === 2) {
      // mm:ss
      const [minutes, seconds] = numbers;
      return minutes * 60 + seconds;
    } else if (numbers.length === 3) {
      // hh:mm:ss
      const [hours, minutes, seconds] = numbers;
      return hours * 3600 + minutes * 60 + seconds;
    } else if (numbers.length === 1) {
      // 秒のみ
      return numbers[0];
    }
  } catch {
    return null;
  }

  return null;
}

const SEVERITY_STYLES = {
  必須: {
    badge: "bg-red-100 text-red-800 border-red-300",
    icon: "🔴",
  },
  推奨: {
    badge: "bg-yellow-100 text-yellow-800 border-yellow-300",
    icon: "🟡",
  },
  任意: {
    badge: "bg-blue-100 text-blue-800 border-blue-300",
    icon: "🔵",
  },
};

const ADEQUACY_STYLES = {
  適切: {
    badge: "bg-green-100 text-green-800 border-green-300",
    icon: "✅",
  },
  不十分: {
    badge: "bg-orange-100 text-orange-800 border-orange-300",
    icon: "⚠️",
  },
  不明確: {
    badge: "bg-gray-100 text-gray-800 border-gray-300",
    icon: "❓",
  },
};

export function AnnotationDisplay({ annotations, onSeekToTimecode }: AnnotationDisplayProps) {
  const { existing_annotations, missing_annotations } = annotations;

  const hasExisting = existing_annotations && existing_annotations.length > 0;
  const hasMissing = missing_annotations && missing_annotations.length > 0;

  if (!hasExisting && !hasMissing) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* 既存の注釈セクション */}
      {hasExisting && (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900">検出された注釈</h3>
            <p className="text-sm text-slate-600">
              映像内で「※」を含む注釈が検出されました（{existing_annotations.length}件）
            </p>
          </div>

          <div className="space-y-3">
            {existing_annotations.map((annotation, index) => {
              const adequacyStyle = ADEQUACY_STYLES[annotation.adequacy] || ADEQUACY_STYLES["不明確"];

              return (
                <article
                  key={`existing-${index}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${adequacyStyle.badge}`}
                        >
                          {adequacyStyle.icon} {annotation.adequacy}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-900 mb-2">
                        {annotation.text}
                      </p>
                      <p className="text-xs text-slate-600">
                        <span className="font-semibold">目的:</span> {annotation.purpose}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* 不足している注釈セクション */}
      {hasMissing && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900">不足している可能性のある注釈</h3>
            <p className="text-sm text-slate-600">
              以下の注釈が不足している可能性があります（{missing_annotations.length}件）
            </p>
          </div>

          <div className="space-y-4">
            {missing_annotations.map((missing, index) => {
              const severityStyle = SEVERITY_STYLES[missing.severity] || SEVERITY_STYLES["任意"];
              const timecodeSeconds = parseTimecode(missing.suggested_timecode);

              return (
                <article
                  key={`missing-${index}`}
                  className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${severityStyle.badge}`}
                    >
                      {severityStyle.icon} {missing.severity}
                    </span>
                    {missing.suggested_timecode && (
                      <span className="text-xs text-slate-500">
                        推奨タイムコード:{" "}
                        {onSeekToTimecode && timecodeSeconds !== null ? (
                          <button
                            type="button"
                            onClick={() => onSeekToTimecode(timecodeSeconds)}
                            className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            {missing.suggested_timecode}
                          </button>
                        ) : (
                          <span className="font-semibold">{missing.suggested_timecode}</span>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1">
                        推奨される注釈文:
                      </p>
                      <p className="text-sm text-slate-900 bg-slate-50 rounded p-2 border border-slate-200">
                        {missing.suggested_text}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-700 mb-1">理由:</p>
                      <p className="text-xs text-slate-600">{missing.reason}</p>
                    </div>

                    {missing.legal_basis && (
                      <div>
                        <p className="text-xs font-semibold text-slate-700 mb-1">
                          法的根拠:
                        </p>
                        <p className="text-xs text-slate-600">{missing.legal_basis}</p>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
