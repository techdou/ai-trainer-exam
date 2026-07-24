/**
 * 用户与组织管理服务端逻辑。
 * 账号创建使用 Supabase Auth Admin API（service role），同时在 profiles/user_roles 落库。
 */
import { getSupabaseClient, loadEnv } from '@/storage/database/supabase-client';
import { dbOne, dbQuery } from '@/server/db';
import type { Role } from '@/lib/constants';

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  roles: Role[];
  organizationId: string | null;
}

/** 创建用户（Auth + profile + roles）。邮箱已存在时抛出带说明的错误。 */
export async function createUserWithRoles(input: CreateUserInput): Promise<{ userId: string }> {
  loadEnv();
  const client = getSupabaseClient();

  const { data, error } = await client.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (error) {
    if (error.message.toLowerCase().includes('already')) {
      throw new Error('该账号已存在，请换一个账号名');
    }
    throw new Error(`创建账号失败：${error.message}`);
  }
  const userId = data.user.id;

  await dbQuery(
    `INSERT INTO profiles (id, organization_id, display_name, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, organization_id = EXCLUDED.organization_id, email = EXCLUDED.email, updated_at = now()`,
    userId, input.organizationId, input.displayName, input.email,
  );
  for (const role of input.roles) {
    await dbQuery(
      'INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      userId, role, input.organizationId,
    );
  }
  return { userId };
}

export async function listUsersByOrg(organizationId: string | null) {
  if (organizationId) {
    return dbQuery(
      `SELECT p.id, p.display_name, p.email, p.status, p.organization_id, p.created_at,
              COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM profiles p LEFT JOIN user_roles ur ON ur.user_id = p.id
       WHERE p.organization_id = $1
       GROUP BY p.id ORDER BY p.created_at DESC`,
      organizationId,
    );
  }
  return dbQuery(
    `SELECT p.id, p.display_name, p.email, p.status, p.organization_id, p.created_at,
            COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
     FROM profiles p LEFT JOIN user_roles ur ON ur.user_id = p.id
     GROUP BY p.id ORDER BY p.created_at DESC`,
  );
}

export async function setUserRoles(userId: string, roles: Role[], organizationId: string | null) {
  await dbQuery('DELETE FROM user_roles WHERE user_id = $1', userId);
  for (const role of roles) {
    await dbQuery(
      'INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      userId, role, organizationId,
    );
  }
}

export async function resetUserPassword(userId: string, newPassword: string) {
  loadEnv();
  const client = getSupabaseClient();
  const { error } = await client.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) throw new Error(`重置密码失败：${error.message}`);
}

export async function deactivateUser(userId: string) {
  loadEnv();
  const client = getSupabaseClient();
  await client.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  await dbQuery("UPDATE profiles SET status = 'disabled', updated_at = now() WHERE id = $1", userId);
}

export async function findUserByEmail(email: string) {
  return dbOne<{ id: string; email: string; display_name: string }>(
    'SELECT id, email, display_name FROM profiles WHERE email = $1',
    email,
  );
}
