"use client";

import React, { useState, useMemo } from "react";
import {
  RiskTag,
  RiskRelatedSubTag,
  FeedbackType,
  FeedbackAction,
  GradeLevel,
  TagFeedbackRequest,
  createAnalysisFeedback,
} from "@/lib/apiClient";

/**
 * Calculate Levenshtein distance between two strings
 * Returns a value between 0 and max(s1.length, s2.length)
 */
function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two strings
 * Returns a value between 0 and 100
 */
function calculateSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 100;

  const distance = levenshteinDistance(s1.toLowerCase(), s2.toLowerCase());
  const maxLen = Math.max(s1.length, s2.length);
  const similarity = ((maxLen - distance) / maxLen) * 100;

  return similarity;
}

/**
 * Parse timecode string (MM:SS.D or HH:MM:SS.D) to seconds
 * Returns null if parsing fails
 */
function parseTimecode(timecode: string): number | null {
  if (!timecode) return null;

  const parts = timecode.split(":");
  if (parts.length < 2) return null;

  try {
    if (parts.length === 2) {
      // MM:SS.D format
      const [minutes, seconds] = parts;
      return parseFloat(minutes) * 60 + parseFloat(seconds);
    } else if (parts.length === 3) {
      // HH:MM:SS.D format
      const [hours, minutes, seconds] = parts;
      return parseFloat(hours) * 3600 + parseFloat(minutes) * 60 + parseFloat(seconds);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Check if two timecodes are within tolerance (in seconds)
 */
function areTimecodesNearby(tc1: string, tc2: string, toleranceSeconds: number): boolean {
  const time1 = parseTimecode(tc1);
  const time2 = parseTimecode(tc2);

  if (time1 === null || time2 === null) return false;

  return Math.abs(time1 - time2) <= toleranceSeconds;
}

interface AdminFeedbackPanelProps {
  projectId: string;
  tags: RiskTag[];
  onFeedbackSubmitted?: () => void;
}

interface TagEditState {
  tagName: string;
  originalGrade: GradeLevel;
  correctedGrade: GradeLevel;
  action: FeedbackAction;
  correctionReason: string;
  detectedText: string;
  detectedTimecode: string;
  isSubTag: boolean;
  parentTag?: string;
  isManuallyAdded?: boolean;
}

interface FlattenedTag {
  name: string;
  grade: string;
  reason: string;
  detected_text?: string;
  detected_timecode?: string;
  isSubTag: boolean;
  parentTag?: string;
  isManuallyAdded?: boolean;
}

interface GroupedTagEntry {
  groupKey: string;
  detected_text: string;
  detected_timecode: string;
  tags: FlattenedTag[];
  all_detected_texts?: string[];
  all_detected_timecodes?: string[];
}

export function AdminFeedbackPanel({
  projectId,
  tags,
  onFeedbackSubmitted,
}: AdminFeedbackPanelProps) {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("approve");
  const [overallComment, setOverallComment] = useState("");
  const [qualityScore, setQualityScore] = useState<number>(5);
  const [tagEdits, setTagEdits] = useState<Map<string, TagEditState>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSubTagsOnly, setShowSubTagsOnly] = useState(false);
  const [showMainTagsOnly, setShowMainTagsOnly] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<GradeLevel | "all">("all");

  // State for manual tag addition
  const [showAddTagForm, setShowAddTagForm] = useState(false);
  const [newManualTag, setNewManualTag] = useState({
    tagName: "",
    subTagName: "",
    grade: "C" as GradeLevel,
    reason: "",
    detectedText: "",
    detectedTimecode: "",
    isSubTag: false,
    parentTag: "",
  });

  // Get available tags and sub-tags from existing tags
  const availableTags = useMemo(() => {
    const tagMap = new Map<string, string[]>();
    tags.forEach(tag => {
      const subTags: string[] = [];
      if (tag.related_sub_tags && Array.isArray(tag.related_sub_tags)) {
        tag.related_sub_tags.forEach(sub => {
          if (sub.name) {
            subTags.push(sub.name);
          }
        });
      }
      tagMap.set(tag.name, subTags);
    });
    return tagMap;
  }, [tags]);

  // Get available sub-tags for the selected main tag
  const availableSubTags = useMemo(() => {
    if (!newManualTag.tagName) return [];
    return availableTags.get(newManualTag.tagName) || [];
  }, [newManualTag.tagName, availableTags]);

  // Flatten tags to include all sub-tags and manually added tags
  const flattenedTags = useMemo<FlattenedTag[]>(() => {
    const result: FlattenedTag[] = [];

    tags.forEach(tag => {
      // Add main tag
      result.push({
        name: tag.name,
        grade: tag.grade,
        reason: tag.reason,
        detected_text: tag.detected_text,
        detected_timecode: tag.detected_timecode,
        isSubTag: false,
      });

      // Add sub-tags
      if (tag.related_sub_tags && Array.isArray(tag.related_sub_tags)) {
        tag.related_sub_tags.forEach(subTag => {
          if (subTag.grade) {
            result.push({
              name: subTag.name,
              grade: subTag.grade,
              reason: subTag.reason || "",
              detected_text: subTag.detected_text,
              detected_timecode: subTag.detected_timecode,
              isSubTag: true,
              parentTag: tag.name,
            });
          }
        });
      }
    });

    // Add manually added tags from tagEdits with action="add"
    tagEdits.forEach((edit, tagName) => {
      if (edit.action === "add" && edit.isManuallyAdded) {
        result.push({
          name: edit.tagName,
          grade: edit.correctedGrade,
          reason: edit.correctionReason,
          detected_text: edit.detectedText,
          detected_timecode: edit.detectedTimecode,
          isSubTag: edit.isSubTag,
          parentTag: edit.parentTag,
          isManuallyAdded: true,
        });
      }
    });

    return result;
  }, [tags, tagEdits]);

  // Filter tags based on filter state
  const filteredTags = useMemo(() => {
    let result = flattenedTags;

    // Apply tag type filter
    if (showMainTagsOnly) {
      result = result.filter(tag => !tag.isSubTag);
    } else if (showSubTagsOnly) {
      result = result.filter(tag => tag.isSubTag);
    }

    // Apply grade filter
    if (gradeFilter !== "all") {
      result = result.filter(tag => tag.grade === gradeFilter);
    }

    return result;
  }, [flattenedTags, showMainTagsOnly, showSubTagsOnly, gradeFilter]);

  // Group tags by detected_text and detected_timecode with similarity detection
  const groupedTags = useMemo<GroupedTagEntry[]>(() => {
    const SIMILARITY_THRESHOLD = 70; // 70% similarity threshold
    const TIMECODE_TOLERANCE = 2; // ±2 seconds

    const groups: Array<{
      texts: string[];
      timecodes: string[];
      tags: FlattenedTag[];
    }> = [];

    filteredTags.forEach(tag => {
      const text = tag.detected_text || "";
      const timecode = tag.detected_timecode || "";

      // If no detected text/timecode, create a unique group for this tag
      if (!text && !timecode) {
        groups.push({
          texts: [text],
          timecodes: [timecode],
          tags: [tag],
        });
        return;
      }

      // Try to find a matching group based on similarity and timecode proximity
      let matchedGroup: typeof groups[0] | null = null;

      for (const group of groups) {
        // Check if any text in the group is similar to current tag's text
        const hasSimilarText = group.texts.some(groupText => {
          if (!text || !groupText) return text === groupText;

          // Check exact match first
          if (text === groupText) return true;

          // Check similarity
          const similarity = calculateSimilarity(text, groupText);
          return similarity >= SIMILARITY_THRESHOLD;
        });

        // Check if any timecode in the group is nearby
        const hasNearbyTimecode = group.timecodes.some(groupTimecode => {
          if (!timecode || !groupTimecode) return timecode === groupTimecode;

          // Check exact match first
          if (timecode === groupTimecode) return true;

          // Check proximity
          return areTimecodesNearby(timecode, groupTimecode, TIMECODE_TOLERANCE);
        });

        // If both text and timecode match (or are similar/nearby), add to this group
        if (hasSimilarText && hasNearbyTimecode) {
          matchedGroup = group;
          break;
        }
      }

      if (matchedGroup) {
        // Add to existing group
        matchedGroup.tags.push(tag);

        // Add new text/timecode to group if not already present
        if (text && !matchedGroup.texts.includes(text)) {
          matchedGroup.texts.push(text);
        }
        if (timecode && !matchedGroup.timecodes.includes(timecode)) {
          matchedGroup.timecodes.push(timecode);
        }
      } else {
        // Create new group
        groups.push({
          texts: text ? [text] : [],
          timecodes: timecode ? [timecode] : [],
          tags: [tag],
        });
      }
    });

    // Convert to GroupedTagEntry format
    return groups.map((group, index) => {
      const firstTag = group.tags[0];

      // Use the first non-empty text and timecode as representative
      const representativeText = group.texts.find(t => t) || "";
      const representativeTimecode = group.timecodes.find(t => t) || "";

      // Filter out empty strings
      const allTexts = group.texts.filter(t => t);
      const allTimecodes = group.timecodes.filter(t => t);

      return {
        groupKey: representativeText && representativeTimecode
          ? `${representativeText}|${representativeTimecode}`
          : `unique_group_${index}`,
        detected_text: representativeText,
        detected_timecode: representativeTimecode,
        tags: group.tags,
        all_detected_texts: allTexts.length > 1 ? allTexts : undefined,
        all_detected_timecodes: allTimecodes.length > 1 ? allTimecodes : undefined,
      };
    });
  }, [filteredTags]);

  const mainTagCount = flattenedTags.filter(t => !t.isSubTag).length;
  const subTagCount = flattenedTags.filter(t => t.isSubTag).length;

  // Grade counts
  const gradeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      A: 0, B: 0, C: 0, D: 0, E: 0
    };
    flattenedTags.forEach(tag => {
      if (counts[tag.grade] !== undefined) {
        counts[tag.grade]++;
      }
    });
    return counts;
  }, [flattenedTags]);

  const handleTagActionChange = (tagName: string, tag: FlattenedTag, action: FeedbackAction) => {
    const newEdits = new Map(tagEdits);

    if (action === "keep") {
      // Remove from edits if keeping unchanged
      newEdits.delete(tagName);
    } else {
      // Add or update edit
      const existing = newEdits.get(tagName);
      newEdits.set(tagName, {
        tagName,
        originalGrade: tag.grade as GradeLevel,
        correctedGrade: existing?.correctedGrade || (tag.grade as GradeLevel),
        action,
        correctionReason: existing?.correctionReason || "",
        detectedText: tag.detected_text || "",
        detectedTimecode: tag.detected_timecode || "",
        isSubTag: tag.isSubTag,
        parentTag: tag.parentTag,
      });
    }

    setTagEdits(newEdits);
  };

  const handleGradeChange = (tagName: string, newGrade: GradeLevel) => {
    const newEdits = new Map(tagEdits);
    const existing = newEdits.get(tagName);

    if (existing) {
      newEdits.set(tagName, {
        ...existing,
        correctedGrade: newGrade,
      });
      setTagEdits(newEdits);
    }
  };

  const handleReasonChange = (tagName: string, reason: string) => {
    const newEdits = new Map(tagEdits);
    const existing = newEdits.get(tagName);

    if (existing) {
      newEdits.set(tagName, {
        ...existing,
        correctionReason: reason,
      });
      setTagEdits(newEdits);
    }
  };

  const handleAddManualTag = () => {
    if (!newManualTag.tagName.trim()) {
      alert("タグ1を選択してください");
      return;
    }

    const newEdits = new Map(tagEdits);
    const isSubTag = !!newManualTag.subTagName;
    const displayName = isSubTag ? newManualTag.subTagName : newManualTag.tagName;
    const uniqueKey = `manual_${Date.now()}_${displayName}`;

    newEdits.set(uniqueKey, {
      tagName: displayName,
      originalGrade: newManualTag.grade,
      correctedGrade: newManualTag.grade,
      action: "add",
      correctionReason: newManualTag.reason,
      detectedText: newManualTag.detectedText,
      detectedTimecode: newManualTag.detectedTimecode,
      isSubTag: isSubTag,
      parentTag: isSubTag ? newManualTag.tagName : undefined,
      isManuallyAdded: true,
    });

    setTagEdits(newEdits);

    // Reset form
    setNewManualTag({
      tagName: "",
      subTagName: "",
      grade: "C",
      reason: "",
      detectedText: "",
      detectedTimecode: "",
      isSubTag: false,
      parentTag: "",
    });
    setShowAddTagForm(false);
  };

  const handleDeleteManualTag = (tagKey: string) => {
    const newEdits = new Map(tagEdits);
    newEdits.delete(tagKey);
    setTagEdits(newEdits);
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      // Get token from localStorage
      const token = localStorage.getItem("access_token");
      if (!token) {
        alert("ログインが必要です");
        return;
      }

      // Prepare tag feedbacks
      const tagFeedbacks: TagFeedbackRequest[] = Array.from(tagEdits.values()).map(edit => ({
        tag_name: edit.tagName,
        original_grade: edit.originalGrade,
        corrected_grade: edit.action === "modify" ? edit.correctedGrade : undefined,
        action: edit.action,
        correction_reason: edit.correctionReason || undefined,
        detected_text: edit.detectedText || undefined,
        detected_timecode: edit.detectedTimecode || undefined,
      }));

      console.log("Submitting feedback:", {
        project_id: projectId,
        feedback_type: feedbackType,
        overall_comment: overallComment || undefined,
        quality_score: qualityScore,
        tag_feedbacks: tagFeedbacks.length > 0 ? tagFeedbacks : undefined,
      });

      // Submit feedback
      const response = await createAnalysisFeedback(
        {
          project_id: projectId,
          feedback_type: feedbackType,
          overall_comment: overallComment || undefined,
          quality_score: qualityScore,
          tag_feedbacks: tagFeedbacks.length > 0 ? tagFeedbacks : undefined,
        },
        token
      );

      console.log("Feedback submitted successfully:", response);
      alert("フィードバックを送信しました");

      // Reset state
      setOverallComment("");
      setQualityScore(5);
      setTagEdits(new Map());
      setFeedbackType("approve");

      if (onFeedbackSubmitted) {
        onFeedbackSubmitted();
      }
    } catch (error) {
      console.error("Failed to submit feedback:", error);

      // Show more detailed error message
      let errorMessage = "フィードバックの送信に失敗しました";
      if (error instanceof Error) {
        errorMessage += `\n詳細: ${error.message}`;
      }

      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isExpanded) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🛠️</div>
            <div>
              <h3 className="font-bold text-gray-800">管理者用フィードバック</h3>
              <p className="text-sm text-gray-600">分析結果を修正して精度を向上</p>
            </div>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            フィードバックを開く
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🛠️</div>
          <div>
            <h3 className="font-bold text-gray-800 text-lg">管理者用フィードバック</h3>
            <p className="text-sm text-gray-600">分析結果の評価と修正</p>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-gray-500 hover:text-gray-700 text-2xl"
        >
          ×
        </button>
      </div>

      {/* Overall Feedback Type */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          総合評価
        </label>
        <div className="flex gap-3">
          <button
            onClick={() => setFeedbackType("approve")}
            className={`px-4 py-2 rounded-lg border-2 transition-colors ${
              feedbackType === "approve"
                ? "bg-green-100 border-green-500 text-green-800"
                : "bg-gray-50 border-gray-300 text-gray-600 hover:border-gray-400"
            }`}
          >
            ✅ 承認
          </button>
          <button
            onClick={() => setFeedbackType("modify")}
            className={`px-4 py-2 rounded-lg border-2 transition-colors ${
              feedbackType === "modify"
                ? "bg-yellow-100 border-yellow-500 text-yellow-800"
                : "bg-gray-50 border-gray-300 text-gray-600 hover:border-gray-400"
            }`}
          >
            ✏️ 修正
          </button>
          <button
            onClick={() => setFeedbackType("reject")}
            className={`px-4 py-2 rounded-lg border-2 transition-colors ${
              feedbackType === "reject"
                ? "bg-red-100 border-red-500 text-red-800"
                : "bg-gray-50 border-gray-300 text-gray-600 hover:border-gray-400"
            }`}
          >
            ❌ 却下
          </button>
        </div>
      </div>

      {/* Quality Score */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          品質スコア: {qualityScore}/10
        </label>
        <input
          type="range"
          min="1"
          max="10"
          value={qualityScore}
          onChange={(e) => setQualityScore(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>低品質</span>
          <span>高品質</span>
        </div>
      </div>

      {/* Overall Comment */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          総合コメント
        </label>
        <textarea
          value={overallComment}
          onChange={(e) => setOverallComment(e.target.value)}
          placeholder="この分析結果についての全体的なフィードバックを記入..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
        />
      </div>

      {/* Tag-by-Tag Feedback */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-800">
            タグごとのフィードバック
          </h4>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-600">
              合計: {flattenedTags.length}件 | メイン: {mainTagCount} | サブ: {subTagCount}
            </span>
          </div>
        </div>

        {/* Tag Type Filter Buttons */}
        <div className="mb-2">
          <label className="text-xs font-medium text-gray-700 mb-1 block">タイプ</label>
          <div className="flex gap-2">
          <button
            onClick={() => {
              setShowMainTagsOnly(false);
              setShowSubTagsOnly(false);
            }}
            className={`px-3 py-1 rounded text-sm border transition-colors ${
              !showMainTagsOnly && !showSubTagsOnly
                ? "bg-blue-100 border-blue-500 text-blue-800"
                : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
            }`}
          >
            全て表示 ({flattenedTags.length})
          </button>
          <button
            onClick={() => {
              setShowMainTagsOnly(true);
              setShowSubTagsOnly(false);
            }}
            className={`px-3 py-1 rounded text-sm border transition-colors ${
              showMainTagsOnly
                ? "bg-blue-100 border-blue-500 text-blue-800"
                : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
            }`}
          >
            メインタグのみ ({mainTagCount})
          </button>
          <button
            onClick={() => {
              setShowMainTagsOnly(false);
              setShowSubTagsOnly(true);
            }}
            className={`px-3 py-1 rounded text-sm border transition-colors ${
              showSubTagsOnly
                ? "bg-blue-100 border-blue-500 text-blue-800"
                : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
            }`}
          >
            サブタグのみ ({subTagCount})
          </button>
          </div>
        </div>

        {/* Grade Filter Buttons */}
        <div className="mb-3">
          <label className="text-xs font-medium text-gray-700 mb-1 block">グレード</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setGradeFilter("all")}
              className={`px-3 py-1 rounded text-sm border transition-colors ${
                gradeFilter === "all"
                  ? "bg-gray-700 border-gray-700 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              全グレード ({flattenedTags.length})
            </button>
            <button
              onClick={() => setGradeFilter("A")}
              className={`px-3 py-1 rounded text-sm border transition-colors ${
                gradeFilter === "A"
                  ? "bg-green-600 border-green-600 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              A ({gradeCounts.A})
            </button>
            <button
              onClick={() => setGradeFilter("B")}
              className={`px-3 py-1 rounded text-sm border transition-colors ${
                gradeFilter === "B"
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              B ({gradeCounts.B})
            </button>
            <button
              onClick={() => setGradeFilter("C")}
              className={`px-3 py-1 rounded text-sm border transition-colors ${
                gradeFilter === "C"
                  ? "bg-yellow-600 border-yellow-600 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              C ({gradeCounts.C})
            </button>
            <button
              onClick={() => setGradeFilter("D")}
              className={`px-3 py-1 rounded text-sm border transition-colors ${
                gradeFilter === "D"
                  ? "bg-orange-600 border-orange-600 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              D ({gradeCounts.D})
            </button>
            <button
              onClick={() => setGradeFilter("E")}
              className={`px-3 py-1 rounded text-sm border transition-colors ${
                gradeFilter === "E"
                  ? "bg-red-600 border-red-600 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              E ({gradeCounts.E})
            </button>
          </div>
        </div>

        {/* Filtered Results Info */}
        {filteredTags.length !== flattenedTags.length && (
          <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 mb-3">
            <p className="text-sm text-blue-800">
              フィルター結果: {groupedTags.length}グループ ({filteredTags.length}タグ) / 全{flattenedTags.length}タグ
            </p>
          </div>
        )}

        {/* Add Manual Tag Button */}
        <div className="mb-3">
          <button
            onClick={() => setShowAddTagForm(!showAddTagForm)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            {showAddTagForm ? "✕ キャンセル" : "+ タグを手動追加"}
          </button>
        </div>

        {/* Manual Tag Addition Form */}
        {showAddTagForm && (
          <div className="mb-4 rounded-lg border border-indigo-300 bg-indigo-50 p-4">
            <h5 className="text-sm font-semibold text-slate-800 mb-3">新規タグを追加</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  メインタグ *
                </label>
                <select
                  value={newManualTag.tagName}
                  onChange={(e) => setNewManualTag({ ...newManualTag, tagName: e.target.value, subTagName: "" })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-slate-800 bg-white"
                >
                  <option value="">選択してください</option>
                  {Array.from(availableTags.keys()).map((tagName) => (
                    <option key={tagName} value={tagName}>{tagName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  細分化タグ
                </label>
                <select
                  value={newManualTag.subTagName}
                  onChange={(e) => setNewManualTag({ ...newManualTag, subTagName: e.target.value })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-slate-800 bg-white"
                  disabled={!newManualTag.tagName || availableSubTags.length === 0}
                >
                  <option value="">なし（メインタグのみ）</option>
                  {availableSubTags.map((subTagName) => (
                    <option key={subTagName} value={subTagName}>{subTagName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  グレード
                </label>
                <select
                  value={newManualTag.grade}
                  onChange={(e) => setNewManualTag({ ...newManualTag, grade: e.target.value as GradeLevel })}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-slate-800 bg-white"
                >
                  <option value="A">A - リスク極小</option>
                  <option value="B">B - リスク低</option>
                  <option value="C">C - リスク中</option>
                  <option value="D">D - リスク高</option>
                  <option value="E">E - リスク極大</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  検出文言
                </label>
                <input
                  type="text"
                  value={newManualTag.detectedText}
                  onChange={(e) => setNewManualTag({ ...newManualTag, detectedText: e.target.value })}
                  placeholder="例: 問題となる具体的な表現"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-slate-800 bg-white placeholder-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  タイムコード
                </label>
                <input
                  type="text"
                  value={newManualTag.detectedTimecode}
                  onChange={(e) => setNewManualTag({ ...newManualTag, detectedTimecode: e.target.value })}
                  placeholder="例: 1:23.5"
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-slate-800 bg-white placeholder-slate-400"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  理由・説明
                </label>
                <textarea
                  value={newManualTag.reason}
                  onChange={(e) => setNewManualTag({ ...newManualTag, reason: e.target.value })}
                  placeholder="このタグが必要な理由を説明してください..."
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-slate-800 bg-white placeholder-slate-400"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAddManualTag}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium"
              >
                追加
              </button>
              <button
                onClick={() => setShowAddTagForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-sm"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {groupedTags.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              該当するタグがありません
            </div>
          ) : (
            groupedTags.map((group) => {
            // Group card
            const hasMultipleTags = group.tags.length > 1;

            return (
              <div
                key={group.groupKey}
                className="border-2 rounded-lg p-4 bg-white border-gray-300"
              >
                {/* Detection Info Header */}
                {group.detected_text && (
                  <div className="mb-3 pb-3 border-b border-gray-200">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">📍</span>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 mb-1">検出文言</p>
                        <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                          {group.detected_text}
                        </p>

                        {/* Show all detected texts if multiple similar texts were grouped */}
                        {group.all_detected_texts && group.all_detected_texts.length > 1 && (
                          <div className="mt-2 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                            <p className="text-xs text-blue-800 font-medium mb-1">
                              🔗 類似する検出文言がまとめられています (類似度70%以上):
                            </p>
                            <div className="space-y-1">
                              {group.all_detected_texts.map((text, idx) => (
                                <p key={idx} className="text-xs text-blue-700 pl-2">
                                  • {text}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {group.detected_timecode && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-base">🕐</span>
                        <p className="text-sm text-gray-600">
                          タイムコード: <span className="font-mono font-semibold">{group.detected_timecode}</span>
                        </p>

                        {/* Show all timecodes if multiple nearby timecodes were grouped */}
                        {group.all_detected_timecodes && group.all_detected_timecodes.length > 1 && (
                          <span className="text-xs text-blue-600 ml-2">
                            (±2秒以内: {group.all_detected_timecodes.join(", ")})
                          </span>
                        )}
                      </div>
                    )}
                    {hasMultipleTags && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                        <p className="text-sm text-amber-800 font-medium">
                          ⚠️ この文言に対して {group.tags.length} 件のタグが該当しています
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Tags in this group */}
                <div className="space-y-3">
                  {group.tags.map((tag) => {
            // For manually added tags, find the corresponding key in tagEdits
            let tagKey = tag.name;
            if (tag.isManuallyAdded) {
              // Find the key in tagEdits that matches this manually added tag
              for (const [key, edit] of tagEdits.entries()) {
                if (edit.isManuallyAdded && edit.tagName === tag.name &&
                    edit.correctedGrade === tag.grade) {
                  tagKey = key;
                  break;
                }
              }
            }

            const editState = tagEdits.get(tagKey);
            const currentAction = editState?.action || "keep";

            return (
              <div
                key={tagKey}
                className={`border rounded-lg p-3 ${
                  tag.isManuallyAdded
                    ? "bg-purple-50 border-purple-300"
                    : tag.isSubTag
                    ? "bg-blue-50 border-blue-200"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {tag.isManuallyAdded && (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-200 text-purple-800">
                          手動追加
                        </span>
                      )}
                      {tag.isSubTag && tag.parentTag && (
                        <span className="text-xs text-blue-600 font-medium">
                          └ {tag.parentTag} の
                        </span>
                      )}
                      <span className="font-medium text-gray-800">{tag.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          tag.grade === "A"
                            ? "bg-green-100 text-green-800"
                            : tag.grade === "B"
                            ? "bg-blue-100 text-blue-800"
                            : tag.grade === "C"
                            ? "bg-yellow-100 text-yellow-800"
                            : tag.grade === "D"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        グレード: {tag.grade}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{tag.reason}</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mb-3">
                  {tag.isManuallyAdded ? (
                    // For manually added tags, only show delete button
                    <button
                      onClick={() => handleDeleteManualTag(tagKey)}
                      className="px-3 py-1 rounded text-sm border bg-red-100 border-red-500 text-red-800 hover:bg-red-200 transition-colors"
                    >
                      🗑️ 削除
                    </button>
                  ) : (
                    // For AI-detected tags, show normal action buttons
                    <>
                      <button
                        onClick={() => handleTagActionChange(tag.name, tag, "keep")}
                        className={`px-3 py-1 rounded text-sm border transition-colors ${
                          currentAction === "keep"
                            ? "bg-blue-100 border-blue-500 text-blue-800"
                            : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                        }`}
                      >
                        ✓ 保持
                      </button>
                      <button
                        onClick={() => handleTagActionChange(tag.name, tag, "modify")}
                        className={`px-3 py-1 rounded text-sm border transition-colors ${
                          currentAction === "modify"
                            ? "bg-yellow-100 border-yellow-500 text-yellow-800"
                            : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                        }`}
                      >
                        ✏️ 修正
                      </button>
                      <button
                        onClick={() => handleTagActionChange(tag.name, tag, "delete")}
                        className={`px-3 py-1 rounded text-sm border transition-colors ${
                          currentAction === "delete"
                            ? "bg-red-100 border-red-500 text-red-800"
                            : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                        }`}
                      >
                        🗑️ 削除
                      </button>
                    </>
                  )}
                </div>

                {/* Modification Fields */}
                {currentAction === "modify" && editState && (
                  <div className="space-y-3 pl-4 border-l-2 border-yellow-400">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        修正後のグレード
                      </label>
                      <select
                        value={editState.correctedGrade}
                        onChange={(e) =>
                          handleGradeChange(tag.name, e.target.value as GradeLevel)
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-slate-800 bg-white"
                      >
                        <option value="A">A - リスク極小</option>
                        <option value="B">B - リスク低</option>
                        <option value="C">C - リスク中</option>
                        <option value="D">D - リスク高</option>
                        <option value="E">E - リスク極大</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        修正理由
                      </label>
                      <textarea
                        value={editState.correctionReason}
                        onChange={(e) => handleReasonChange(tag.name, e.target.value)}
                        placeholder="なぜこの修正が必要か説明してください..."
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-slate-800 bg-white placeholder-slate-400"
                        rows={2}
                      />
                    </div>
                  </div>
                )}

                {currentAction === "delete" && (
                  <div className="pl-4 border-l-2 border-red-400">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      削除理由
                    </label>
                    <textarea
                      value={editState?.correctionReason || ""}
                      onChange={(e) => handleReasonChange(tag.name, e.target.value)}
                      placeholder="なぜこのタグを削除すべきか説明してください..."
                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-slate-800 bg-white placeholder-slate-400"
                      rows={2}
                    />
                  </div>
                )}
              </div>
            );
          })}
                </div>
              </div>
            );
          })
          )}
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSubmitting ? "送信中..." : "フィードバックを送信"}
        </button>
        <button
          onClick={() => {
            setOverallComment("");
            setQualityScore(5);
            setTagEdits(new Map());
            setFeedbackType("approve");
          }}
          className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          リセット
        </button>
      </div>

      {/* Info Text */}
      <p className="text-xs text-gray-500 mt-4 text-center">
        💡 このフィードバックはAIモデルの改善に使用されます
      </p>
    </div>
  );
}
