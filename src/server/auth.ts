/** 服务端 Supabase 会话验证与多租户 RBAC。 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseCredentials, loadEnv } from '@/storage/database/supabase-client';
import { dbOne, dbQuery } from '@/server/db';
import type { Role } from '@/lib/constants';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  organizationId: string | null;
  cohortIds: string[];
  mustChangePassword: boolean;
}

let anonClient: SupabaseClient | null = null;
function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    loadEnv();
    const { url, anonKey } = getSupabaseCredentials();
    anonClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return anonClient;
}

async function loadBusinessUser(userId: string, email: string): Promise<SessionUser | null> {
  const profile = await dbOne<{ display_name: string; organization_id: string | null; status: string; must_change_password: boolean }>(
    'SELECT display_name, organization_id, status, must_change_password FROM profiles WHERE id = $1',
    userId,
  );
  if (!profile || profile.status !== 'active') return null;
  const roleRows = await dbQuery<{ role: Role }>('SELECT role FROM user_roles WHERE user_id = $1', userId);
  if (!roleRows.length) return null;
  const cohortRows = await dbQuery<{ cohort_id: string }>(
    `SELECT cohort_id FROM enrollments WHERE user_id = $1 AND status = 'active'`,
    userId,
  );
  return {
    id: userId,
    email,
    displayName: profile.display_name || email || '用户',
    roles: roleRows.map(row => row.role),
    organizationId: profile.organization_id,
    cohortIds: cohortRows.map(row => row.cohort_id),
    mustChangePassword: profile.must_change_password,
  };
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await getAnonClient().auth.getUser(token);
  if (error || !data.user) return null;
  return loadBusinessUser(data.user.id, data.user.email ?? '');
}

export interface CreatedSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: SessionUser;
}

function toCreatedSession(session: { access_token: string; refresh_token: string; expires_at?: number | null }, user: SessionUser): CreatedSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: (session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
    user,
  };
}

export async function createSession(email: string, password: string): Promise<CreatedSession | null> {
  const { data, error } = await getAnonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) return null;
  const user = await loadBusinessUser(data.user.id, data.user.email ?? '');
  if (!user) return null;
  return toCreatedSession(data.session, user);
}

export async function refreshSession(refreshToken: string): Promise<CreatedSession | null> {
  if (!refreshToken) return null;
  const { data, error } = await getAnonClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) return null;
  const user = await loadBusinessUser(data.user.id, data.user.email ?? '');
  if (!user) return null;
  return toCreatedSession(data.session, user);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new ApiError(401, '请先登录');
  return user;
}
export async function requireRole(request: Request, roles: Role[]): Promise<SessionUser> {
  const user = await requireUser(request);
  if (!user.roles.includes('super_admin') && !user.roles.some(role => roles.includes(role))) throw new ApiError(403, '没有权限执行此操作');
  return user;
}
export function requireSameOrg(user: SessionUser, organizationId: string | null): void {
  if (user.roles.includes('super_admin')) return;
  if (!organizationId || user.organizationId !== organizationId) throw new ApiError(403, '不能访问其他机构的数据');
}
export const ADMIN_ROLES: Role[] = ['super_admin', 'school_admin'];
export const STAFF_ROLES: Role[] = ['super_admin', 'school_admin', 'teacher'];
export const QUESTION_EDIT_ROLES: Role[] = ['super_admin', 'school_admin', 'question_editor'];
export const QUESTION_REVIEW_ROLES: Role[] = ['super_admin', 'school_admin', 'question_reviewer'];
