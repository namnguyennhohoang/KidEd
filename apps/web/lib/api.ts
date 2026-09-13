/** Client gọi API qua proxy cùng-origin `/api/*`. Cookie phiên do trình duyệt tự gửi. */

export interface ApiError {
  error: string;
  reason?: string;
}

/** Đọc CSRF token từ cookie non-HttpOnly `tiny_csrf` (double-submit — AUDIT_PHASE1 SEC-6). */
export function csrfToken(): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)tiny_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body != null) headers['content-type'] = 'application/json';
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const t = csrfToken();
    if (t) headers['x-csrf-token'] = t;
  }
  const res = await fetch(`/api/${path}`, { ...init, headers });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error((json as ApiError).error ?? `HTTP ${res.status}`);
    Object.assign(err, { status: res.status, body: json });
    throw err;
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => call<T>(path),
  post: <T>(path: string, body?: unknown) =>
    call<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    call<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    call<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
};

/** Gọi các endpoint /shared/* bằng token chia sẻ (không cần phiên đăng nhập). */
export const shared = {
  get: <T>(path: string, token: string) => call<T>(path, { headers: { 'x-share-token': token } }),
};

export interface Me {
  userId: string;
  role: string;
  familyId: string | null;
  kind: 'PARENT' | 'CHILD' | 'TEACHER' | 'MENTOR';
  childProfileId: string | null;
  pinVerified: boolean;
}

export interface ChildContext {
  ageYears: number;
  screenSessionMinutes: number;
  stage: string;
}

export interface ChildProfile {
  id: string;
  displayName: string;
  birthMonth: number;
  birthYear: number;
  currentStage: string;
  screenSessionMinutes: number;
}

export interface UnitChoice {
  id: string;
  label: string;
}

export interface UnitHintRaw {
  level: number;
  type: 'REPHRASE' | 'QUESTION' | 'VISUAL' | 'STRATEGY_CHOICE' | 'WORKED_EXAMPLE';
  content?: string;
  content_ref?: string;
}

export interface LearningUnit {
  id: string;
  title: string;
  stage?: string;
  choices: UnitChoice[];
  hints: UnitHintRaw[];
  questFlow: {
    hook?: string;
    plan_prompt?: string;
    explain_prompt?: string;
    reflection_prompt?: string;
    attempt_requirement?: { minimum_attempts_before_solution?: number };
    /** Đáp án trắc nghiệm cho bước "thử làm" (tuỳ chọn) — bấm chọn thay vì gõ chữ. */
    attempt_options?: Array<{ id: string; label: string }>;
    [k: string]: unknown;
  };
}

export interface StartSessionResult {
  id: string;
  unit: LearningUnit;
  minimumAttempts: number;
  idempotent?: boolean;
}

export interface CoachResponse {
  intent: string;
  child_message: string;
  hint_level: number;
  wait_seconds: number;
}

export interface HintResult {
  coach: CoachResponse;
  maxHelpLadderLevel: number;
  rulesFired: number;
}

export interface Dashboard {
  independence: { completedSessions: number; independentCompletionRate: number | null };
  initiation: { medianLatencySeconds: number | null };
  hints: { medianLevel: number | null; trend: 'down' | 'flat' | 'up' | null; totalRequested: number };
  strategies: { averagePerSession: number | null };
  explanation: { reflectionsCompleted: number; artifactsWithTranscript: number };
  skillEvidence: { count: number; distinctSkills: number };
  recentObservations: Array<{ text: string; createdAt: string; tags: string[] }>;
  suggestedNextAction: string;
}

/** id ngẫu nhiên cho idempotency offline. */
export function cgid(prefix = 'c'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
