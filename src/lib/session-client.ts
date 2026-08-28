'use client';

/**
 * 浏览器会话管理。
 * - 全站只使用这一组 key，杜绝 localStorage/sessionStorage 混用。
 * - 共享机房默认使用 sessionStorage，关闭标签页即清除。
 * - access token 临近过期时，经服务端刷新接口换取新会话。
 */

const SESSION_KEY = 'examsys.session.v2';

export interface ClientUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  organizationId: string | null;
  mustChangePassword?: boolean;
}

export interface ClientSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: ClientUser;
}

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

export function saveSession(sessionOrToken: ClientSession | string, user?: ClientUser): void {
  const target = storage();
  if (!target) return;
  const session: ClientSession = typeof sessionOrToken === 'string'
    ? { accessToken: sessionOrToken, refreshToken: '', expiresAt: Date.now() + 55 * 60_000, user: user! }
    : sessionOrToken;
  target.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): ClientSession | null {
  const raw = storage()?.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ClientSession;
    if (!value.accessToken || !value.user) return null;
    return value;
  } catch {
    return null;
  }
}

export function getToken(): string | null { return getSession()?.accessToken ?? null; }
export function getStoredUser(): ClientUser | null { return getSession()?.user ?? null; }
export function clearSession(): void { storage()?.removeItem(SESSION_KEY); }

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

let refreshPromise: Promise<ClientSession | null> | null = null;
async function refreshSession(): Promise<ClientSession | null> {
  const current = getSession();
  if (!current?.refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/session', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    })
      .then(async res => {
        const json = await res.json().catch(() => null) as { success?: boolean; data?: ClientSession } | null;
        if (!res.ok || !json?.success || !json.data) return null;
        saveSession(json.data);
        return json.data;
      })
      .catch(() => null)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function accessToken(): Promise<string | null> {
  const session = getSession();
  if (!session) return null;
  if (session.expiresAt - Date.now() > 60_000) return session.accessToken;
  return (await refreshSession())?.accessToken ?? session.accessToken;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal; retryAuth?: boolean; keepalive?: boolean } = {},
): Promise<ApiResult<T>> {
  const token = await accessToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      cache: 'no-store',
      // keepalive: 页面卸载中发出的请求允许超出页面生命周期完成(用于关页前最后一次自动保存)。
      keepalive: options.keepalive,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { ok: false, status: 0, error: '请求已取消' };
    return { ok: false, status: 0, error: '网络连接失败，请检查网络后重试' };
  }

  if (response.status === 401 && options.retryAuth !== false) {
    const refreshed = await refreshSession();
    if (refreshed) return apiFetch<T>(path, { ...options, retryAuth: false });
    // 会话彻底失效:清掉残留会话并回登录页,避免用户停留在原页持续报"请先登录"。
    clearSession();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
      return { ok: false, status: 401, error: '登录已过期，请重新登录' };
    }
  }

  // 428: 服务端强制改密门控 —— 任何业务请求被拦截时, 统一跳改密页(改密页自身请求除外)。
  if (response.status === 428 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/change-password')) {
    window.location.assign('/change-password');
  }

  const json = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: string } | null;
  if (!json) return { ok: false, status: response.status, error: '服务响应格式异常' };
  if (!response.ok || json.success === false) return { ok: false, status: response.status, error: json.error ?? '操作失败' };
  return { ok: true, status: response.status, data: json.data };
}

export function homeForRoles(roles: string[]): string {
  if (roles.includes('student')) return '/student/home';
  if (roles.includes('teacher')) return '/teacher/dashboard';
  if (roles.some(role => ['super_admin', 'school_admin', 'question_editor', 'question_reviewer', 'invigilator', 'auditor'].includes(role))) return '/admin/dashboard';
  return '/login';
}

export async function apiBlob(path: string, retryAuth = true): Promise<{ ok: boolean; status: number; blob?: Blob; error?: string }> {
  const token = await accessToken();
  const response = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' }).catch(() => null);
  if (!response) return { ok: false, status: 0, error: '网络连接失败' };
  if (response.status === 401 && retryAuth) {
    const refreshed = await refreshSession();
    if (refreshed) return apiBlob(path, false);
    clearSession();
  }
  if (!response.ok) {
    const json = await response.json().catch(() => null) as { error?: string } | null;
    return { ok: false, status: response.status, error: json?.error ?? '素材读取失败' };
  }
  return { ok: true, status: response.status, blob: await response.blob() };
}
