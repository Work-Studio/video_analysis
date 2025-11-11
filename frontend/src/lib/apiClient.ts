/**
 * バックエンド FastAPI との通信ラッパー.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export type AnalysisStepStatus = "pending" | "running" | "completed" | "failed";

export interface AnalysisStepPayload {
  preview?: string;
}

export interface AnalysisStep {
  name: string;
  status: AnalysisStepStatus;
  payload?: AnalysisStepPayload;
}

export interface ProjectCreatedResponse {
  id: string;
  company_name: string;
  product_name: string;
  title: string;
  model: string;
  file_name: string;
  media_type: string;
  media_url: string;
  status: string;
  analysis_progress: number;
  created_at: string;
}

export interface ProjectStatusResponse {
  id: string;
  company_name: string;
  product_name: string;
  title: string;
  model: string;
  media_type: string;
  media_url: string;
  status: string;
  analysis_progress: number;
  analysis_started_at?: string;
  analysis_completed_at?: string;
  analysis_duration_seconds?: number;
  steps: AnalysisStep[];
  logs: string[];
}

export interface ProjectReportResponse {
  id: string;
  company_name: string;
  product_name: string;
  title: string;
  model: string;
  media_type: string;
  media_url: string;
  final_report: {
    summary: string;
    sections: {
      transcription: string;
      ocr: string;
      video_analysis: string;
    };
    files: {
      transcription: string;
      ocr: string;
      video_analysis: string;
      risk_assessment: string;
    };
    metadata?: Record<string, unknown>;
    risk: {
      social: {
        grade: string;
        reason: string;
        summary?: string;
        findings?: Array<{
          timecode: string;
          detail: string;
        }>;
      };
      legal: {
        grade: string;
        reason: string;
        summary?: string;
        recommendations?: string;
        violations?: Array<{
          reference?: string;
          expression: string;
          severity?: string;
        }>;
        findings?: Array<{
          timecode: string;
          detail: string;
        }>;
      };
      matrix: {
        x_axis: string;
        y_axis: string;
        position: number[];
      };
      note?: string;
      burn_risk?: {
        count: number;
        average?: number;
        grade?: string;
        label?: string;
        min?: number;
        max?: number;
        details?: Array<{
          name: string;
          risk: number;
          label?: string;
          type?: string;
        }>;
      };
      tags?: Array<{
        name: string;
        grade: string;
        detected_text?: string;
        detected_timecode?: string;
        reason: string;
        related_sub_tags?: Array<{
          name: string;
          grade?: string;
          detected_text?: string;
          detected_timecode?: string;
          reason?: string;
        }>;
      }>;
    };
    recommendation?: {
      action_plan?: string;
      [key: string]: unknown;
    };
    generated_at?: string;
  };
}

export interface ProjectSummary {
  id: string;
  company_name: string;
  product_name: string;
  title: string;
  model: string;
  media_type: string;
  media_url: string;
  status: string;
  analysis_progress: number;
  created_at: string;
  updated_at: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "API request failed");
  }
  return (await response.json()) as T;
}

export async function createProject(formData: FormData): Promise<ProjectCreatedResponse> {
  const response = await fetch(`${API_BASE_URL}/projects`, {
    method: "POST",
    body: formData
  });
  return handleResponse<ProjectCreatedResponse>(response);
}

export async function startAnalysis(projectId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/analyze`, {
    method: "POST"
  });
  await handleResponse(response);
}

export async function fetchAnalysisStatus(
  projectId: string
): Promise<ProjectStatusResponse> {
  const response = await fetch(
    `${API_BASE_URL}/projects/${projectId}/analysis-status`,
    {
      cache: "no-cache"
    }
  );
  return handleResponse<ProjectStatusResponse>(response);
}

export async function fetchProjectReport(
  projectId: string
): Promise<ProjectReportResponse> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/report`, {
    cache: "no-cache"
  });
  return handleResponse<ProjectReportResponse>(response);
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const response = await fetch(`${API_BASE_URL}/projects`, {
    cache: "no-cache"
  });
  return handleResponse<ProjectSummary[]>(response);
}
