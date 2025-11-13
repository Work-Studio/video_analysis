/**
 * バックエンド FastAPI との通信ラッパー.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export const API_PATH = {
  PROJECTS: "/projects",
  PROJECT_MEDIA: (id: string) => `/projects/${id}/media`,
  ANALYZE: (id: string) => `/projects/${id}/analyze`,
  STATUS: (id: string) => `/projects/${id}/analysis-status`,
  REPORT: (id: string) => `/projects/${id}/report`,
  ANNOTATIONS: (id: string) => `/projects/${id}/annotations`,
  TAG_FRAMES_INFO: (id: string) => `/projects/${id}/tag-frames-info`,
  TAG_FRAME: (id: string, filename: string) => `/projects/${id}/tag-frames/${filename}`,
  LOGIN: "/auth/login",
  CHANGE_PASSWORD: "/auth/change-password",
  ME: "/auth/me",
  ADMIN_USERS: "/admin/users",
  DELETE_PROJECT: (id: string) => `/projects/${id}`,
} as const;

export type AnalysisStepStatus = "pending" | "running" | "completed" | "failed";
export type NodeStatus = "pending" | "running" | "success" | "failed";

export interface AnalysisStepPayload {
  preview?: string;
}

export interface AnalysisStep {
  name: string;
  status: AnalysisStepStatus;
  payload?: AnalysisStepPayload;
}

export interface ProcessFlowEdge {
  source: string;
  target: string;
}

export interface ProcessFlowNode {
  key: string;
  label: string;
  status: AnalysisStepStatus | NodeStatus;
  dependencies?: string[];
  step_name?: string | null;
}

export interface ProcessFlowState {
  nodes: ProcessFlowNode[];
  edges: ProcessFlowEdge[];
  current_iteration: number;
  total_iterations: number;
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
  current_iteration?: number;
  total_iterations?: number;
  steps: AnalysisStep[];
  logs: string[];
  process_flow?: ProcessFlowState;
}

export interface RiskRelatedSubTag {
  name: string;
  grade?: string;
  detected_text?: string;
  detected_timecode?: string;
  reason?: string;
}

export interface RiskTag {
  name: string;
  grade: string;
  detected_text?: string;
  detected_timecode?: string;
  reason: string;
  related_sub_tags?: RiskRelatedSubTag[];
}

export interface BurnRiskEntry {
  name: string;
  risk: number;
  label?: string;
  type?: string;
}

export interface BurnRiskProfile {
  count: number;
  average?: number;
  grade?: string;
  label?: string;
  min?: number;
  max?: number;
  details?: BurnRiskEntry[];
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
          timecode: string;
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
      burn_risk?: BurnRiskProfile;
      tags?: RiskTag[];
    };
    recommendation?: {
      action_plan?: string;
      [key: string]: unknown;
    };
    iterations?: Array<{
      index?: number;
      transcription?: string;
      ocr?: string;
      video_analysis?: Record<string, unknown>;
      risk?: Record<string, unknown>;
    }>;
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

export interface ExistingAnnotation {
  text: string;
  purpose: string;
  adequacy: "適切" | "不十分" | "不明確";
}

export interface MissingAnnotation {
  suggested_text: string;
  reason: string;
  severity: "必須" | "推奨" | "任意";
  suggested_timecode: string;
  legal_basis?: string;
}

export interface AnnotationAnalysisResponse {
  existing_annotations: ExistingAnnotation[];
  missing_annotations: MissingAnnotation[];
}

export interface TagFrameInfo {
  timecode: string;
  tag: string;
  sub_tag: string | null;
  filename: string;
}

export interface TagFramesInfoResponse {
  frames: TagFrameInfo[];
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-cache",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "API request failed");
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function createProject(formData: FormData): Promise<ProjectCreatedResponse> {
  return apiFetch<ProjectCreatedResponse>(API_PATH.PROJECTS, {
    method: "POST",
    body: formData,
  });
}

export async function startAnalysis(projectId: string): Promise<void> {
  await apiFetch<{ message: string; project_id: string }>(API_PATH.ANALYZE(projectId), {
    method: "POST",
  });
}

export async function fetchAnalysisStatus(
  projectId: string
): Promise<ProjectStatusResponse> {
  return apiFetch<ProjectStatusResponse>(API_PATH.STATUS(projectId));
}

export async function fetchProjectReport(
  projectId: string
): Promise<ProjectReportResponse> {
  return apiFetch<ProjectReportResponse>(API_PATH.REPORT(projectId));
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  return apiFetch<ProjectSummary[]>(API_PATH.PROJECTS);
}

export async function fetchAnnotationAnalysis(
  projectId: string
): Promise<AnnotationAnalysisResponse> {
  return apiFetch<AnnotationAnalysisResponse>(API_PATH.ANNOTATIONS(projectId));
}

export async function fetchTagFramesInfo(
  projectId: string
): Promise<TagFramesInfoResponse> {
  return apiFetch<TagFramesInfoResponse>(API_PATH.TAG_FRAMES_INFO(projectId));
}

export function getTagFrameUrl(projectId: string, filename: string): string {
  return `${API_BASE_URL}${API_PATH.TAG_FRAME(projectId, filename)}`;
}

// ========== Authentication APIs ==========

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  requires_password_change: boolean;
  user_id: number;
  email: string;
  company_name: string;
  is_admin: boolean;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface UserInfo {
  id: number;
  email: string;
  company_name: string;
  is_admin: boolean;
  requires_password_change: boolean;
  created_at: string;
}

export interface CreateUserRequest {
  email: string;
  company_name: string;
}

export interface CreateUserResponse {
  user_id: number;
  email: string;
  company_name: string;
  initial_password: string;
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}${API_PATH.LOGIN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("ログインに失敗しました");
  }

  return response.json();
}

export async function changePassword(
  data: ChangePasswordRequest,
  token: string
): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}${API_PATH.CHANGE_PASSWORD}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("パスワード変更に失敗しました");
  }

  return response.json();
}

export async function getCurrentUser(token: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}${API_PATH.ME}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("ユーザー情報の取得に失敗しました");
  }

  return response.json();
}

export async function createUser(
  data: CreateUserRequest,
  token: string
): Promise<CreateUserResponse> {
  const response = await fetch(`${API_BASE_URL}${API_PATH.ADMIN_USERS}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error("ユーザーの作成に失敗しました");
  }

  return response.json();
}

export async function fetchUsers(token: string): Promise<UserInfo[]> {
  const response = await fetch(`${API_BASE_URL}${API_PATH.ADMIN_USERS}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("ユーザー一覧の取得に失敗しました");
  }

  return response.json();
}

export async function deleteUser(userId: number, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${API_PATH.ADMIN_USERS}/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("ユーザーの削除に失敗しました");
  }
}

export async function deleteProject(projectId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${API_PATH.DELETE_PROJECT(projectId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("プロジェクトの削除に失敗しました");
  }
}
