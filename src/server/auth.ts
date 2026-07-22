/**
 * 服务端认证与 RBAC。
 * - 会话验证：客户端在 Authorization: Bearer <access_token> 中携带 Supabase JWT，
 *   服务端用 anon client 调 auth.getUser(token) 验证（每次请求都验证，不信任前端声明）。
 * - 角色与组织：从 user_roles / profiles 表读取，缓存于请求内。
 */
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
}

let anonClient: SupabaseClient | null = null;

function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    loadEnv();
    const { url, anonKey } = getSupabaseCredentials();
    anonClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonClient;
}

/** 从请求头提取并验证会话；无效返回 null */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const client = getAnonClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  const userId = data.user.id;
  const profile = await dbOne<{ display_name: string; organization_id: string | null }>(
    'SELECT display_name, organization_id FROM profiles WHERE id = $1',
    userId,
  );
  const roleRows = await dbQuery<{ role: Role }>(
    'SELECT role FROM user_roles WHERE user_id = $1',
    userId,
  );
  const cohortRows = await dbQuery<{ cohort_id: string }>(
    'SELECT cohort_id FROM enrollments WHERE user_id = $1',
    userId,
  );

  return {
    id: userId,
    email: data.user.email ?? '',
    displayName: profile?.display_name ?? data.user.email ?? '用户',
    roles: roleRows.map((r) => r.role),
    organizationId: profile?.organization_id ?? null,
    cohortIds: cohortRows.map((r) => r.cohort_id),
  };
}

/** 邮箱+密码登录，返回 access_token 和用户信息 */
export async function createSession(email: string, password: string): Promise<{
  accessToken: string;
  user: SessionUser;
} | null> {
  loadEnv();
  const { url, anonKey } = getSupabaseCredentials();
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;

  const userId = data.user.id;
  const profile = await dbOne<{ display_name: string; organization_id: string | null }>(
    'SELECT display_name, organization_id FROM profiles WHERE id = $1',
    userId,
  );
  const roleRows = await dbQuery<{ role: Role }>(
    'SELECT role FROM user_roles WHERE user_id = $1',
    userId,
  );
  const cohortRows = await dbQuery<{ cohort_id: string }>(
    'SELECT cohort_id FROM enrollments WHERE user_id = $1',
    userId,
  );

  return {
    accessToken: data.session.access_token,
    user: {
      id: userId,
      email: data.user.email ?? '',
      displayName: profile?.display_name ?? data.user.email ?? '用户',
      roles: roleRows.map((r) => r.role),
      organizationId: profile?.organization_id ?? null,
      cohortIds: cohortRows.map((r) => r.cohort_id),
    },
  };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 要求登录 */
export async function requireUser(request: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new ApiError(401, '请先登录');
  return user;
}

/** 要求具备任一指定角色 */
export async function requireRole(request: Request, roles: Role[]): Promise<SessionUser> {
  const user = await requireUser(request);
  const ok = user.roles.some((r) => roles.includes(r)) || user.roles.includes('super_admin');
  if (!ok) throw new ApiError(403, '没有权限执行此操作');
  return user;
}

/** 要求属于指定组织（super_admin 不受限） */
export function requireSameOrg(user: SessionUser, organizationId: string | null): void {
  if (user.roles.includes('super_admin')) return;
  if (!organizationId || user.organizationId !== organizationId) {
    throw new ApiError(403, '不能访问其他机构的数据');
  }
}

export const ADMIN_ROLES: Role[] = ['super_admin', 'school_admin'];
export const STAFF_ROLES: Role[] = ['super_admin', 'school_admin', 'teacher'];
export const QUESTION_EDIT_ROLES: Role[] = ['super_admin', 'school_admin', 'question_editor'];
export const QUESTION_REVIEW_ROLES: Role[] = ['super_admin', 'school_admin', 'question_reviewer'];
