/**
 * 用户与组织管理服务端逻辑。
 * 账号创建使用 Supabase Auth Admin API（service role），同时在 profiles/user_roles 落库。
 */
import { getSupabaseClient, loadEnv } from '@/storage/database/supabase-client';
import { dbOne, dbQuery, dbTx } from '@/server/db';
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
    user_metadata: { display_name: input.displayName },
  });
  if (error) {
    if (error.message.toLowerCase().includes('already')) {
      throw new Error('该账号已存在，请换一个账号名');
    }
    throw new Error(`创建账号失败：${error.message}`);
  }
  const userId = data.user.id;

  // Auth 建号不可回滚: DB 落库必须放进一个事务, 任一步失败整体回滚并补偿删除 Auth 账号,
  // 否则会留下"Auth 存在但 profiles/user_roles 缺失"的孤儿账号, 且该邮箱永远无法再创建。
  try {
    await dbTx(async (tx) => {
      // must_change_password=true: 管理员代设的初始密码, 首次登录必须修改(对齐 seed-core 行为)。
      await tx.query(
        `INSERT INTO profiles (id, organization_id, display_name, email, must_change_password, status)
         VALUES ($1, $2, $3, $4, true, 'active')
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, organization_id = EXCLUDED.organization_id, email = EXCLUDED.email, updated_at = now()`,
        [userId, input.organizationId, input.displayName, input.email],
      );
      for (const role of input.roles) {
        await tx.query(
          'INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [userId, role, input.organizationId],
        );
      }
    });
  } catch (dbError) {
    const { error: cleanupError } = await client.auth.admin.deleteUser(userId);
    if (cleanupError) {
      throw new Error(`创建账号失败且清理 Auth 账号失败, 请联系管理员手动删除 Auth 用户 ${userId}: ${cleanupError.message}`);
    }
    throw dbError;
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

/**
 * 重设用户在某机构维度的角色。
 * 整个"校验+删旧+插新"在一个事务里完成: 先对 profiles 行加锁防止并发 set_roles 互相覆盖;
 * DELETE 限定到当前机构维度, 不会误删该用户在其他机构的角色。
 * 防御: requireNonSuperAdmin 为 true 时, 事务内重查目标当前角色, 若已是 super_admin 则拒绝
 * (防止基于陈旧快照的越权操作在并发窗口内命中)。
 */
export async function setUserRoles(
  userId: string,
  roles: Role[],
  organizationId: string | null,
  opts?: { requireNonSuperAdmin?: boolean },
) {
  await dbTx(async (tx) => {
    await tx.query('SELECT id FROM profiles WHERE id = $1 FOR UPDATE', [userId]);
    if (opts?.requireNonSuperAdmin) {
      const current = await tx.query<{ role: string }>(
        'SELECT role FROM user_roles WHERE user_id = $1', [userId],
      );
      if (current.rows.some(r => r.role === 'super_admin')) {
        throw new Error('目标用户当前已是超级管理员，无权操作');
      }
    }
    await tx.query(
      'DELETE FROM user_roles WHERE user_id = $1 AND organization_id IS NOT DISTINCT FROM $2',
      [userId, organizationId],
    );
    for (const role of roles) {
      await tx.query(
        'INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [userId, role, organizationId],
      );
    }
  });
}

export async function resetUserPassword(userId: string, newPassword: string) {
  loadEnv();
  const client = getSupabaseClient();
  const { error } = await client.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) throw new Error(`重置密码失败：${error.message}`);
}

/**
 * 停用账号。先落库再封 Auth: 若 Auth 步骤失败, 业务库 status='disabled' 仍会拦截登录
 * (getSessionUser 每次校验 profile.status), 重试本操作即可最终一致, 无安全窗口。
 */
export async function deactivateUser(userId: string) {
  loadEnv();
  const client = getSupabaseClient();
  await dbQuery("UPDATE profiles SET status = 'disabled', updated_at = now() WHERE id = $1", userId);
  const { error } = await client.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  if (error) throw new Error(`停用账号失败(业务库已停用, Auth 封禁失败, 请重试): ${error.message}`);
}

/** 重新启用被停用的账号（解除封禁 + 恢复 status）。 */
export async function activateUser(userId: string) {
  loadEnv();
  const client = getSupabaseClient();
  await dbQuery("UPDATE profiles SET status = 'active', updated_at = now() WHERE id = $1", userId);
  const { error } = await client.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  if (error) throw new Error(`启用账号失败(业务库已启用, Auth 解封失败, 请重试): ${error.message}`);
}

/** 重置密码后强制下次登录修改。 */
export async function markMustChangePassword(userId: string) {
  await dbQuery('UPDATE profiles SET must_change_password = true, updated_at = now() WHERE id = $1', userId);
}

export async function findUserByEmail(email: string) {
  return dbOne<{ id: string; email: string; display_name: string }>(
    'SELECT id, email, display_name FROM profiles WHERE email = $1',
    email,
  );
}
