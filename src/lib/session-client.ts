'use client';

/**
 * 客户端会话管理：
 * - 登录后把 Supabase access_token 存入 sessionStorage（仅存当前标签页，降低共享电脑上的残留风险）
 * - 所有业务 API 调用统一走 apiFetch，自动附带 Authorization 头
 */

const TOKEN_KEY = 'examsys.access_token';
const USER_KEY = 'examsys.user';

export interface ClientUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  organizationId: string | null;
}

export function saveSession(token: string, user: ClientUser): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): ClientUser | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClientUser;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

/** 统一业务 API 调用 */
export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, error: '网络连接失败，请检查网络后重试' };
  }
  let json: { success?: boolean; data?: T; error?: string };
  try {
    json = await res.json();
  } catch {
    return { ok: false, status: res.status, error: '服务响应异常' };
  }
  if (res.status === 401) {
    clearSession();
  }
  if (!res.ok || json.success === false) {
    return { ok: false, status: res.status, error: json.error ?? '操作失败' };
  }
  return { ok: true, status: res.status, data: json.data };
}

/** 角色默认首页 */
export function homeForRoles(roles: string[]): string {
  if (roles.includes('student')) return '/student/home';
  if (roles.includes('teacher')) return '/teacher/dashboard';
  if (
    roles.includes('super_admin') ||
    roles.includes('school_admin') ||
    roles.includes('question_editor') ||
    roles.includes('question_reviewer') ||
    roles.includes('invigilator') ||
    roles.includes('auditor')
  ) {
    return '/admin/dashboard';
  }
  return '/login';
}
