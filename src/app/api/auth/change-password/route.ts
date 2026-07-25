import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { getSupabaseClient, loadEnv } from '@/storage/database/supabase-client';
import { handler, ok, fail, parseBody } from '@/lib/api';
import { insertAudit } from '@/server/audit';

/**
 * POST /api/auth/change-password — 修改自己的密码。
 *
 * 使用初始密码/被重置密码的账号(must_change_password=true)唯一能调用的写接口:
 * requireUser 的 428 门控对它放行(allowPasswordChange), 改密成功前门控拦截一切业务 API。
 * 校验旧密码是行业标准动作, 防止"借用他人已登录会话直接改密"。
 */
const schema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(8, '新密码至少 8 位').max(72, '新密码过长'),
});

export const POST = handler(async (request: Request) => {
  const user = await requireUser(request, { allowPasswordChange: true });
  const body = await parseBody(request, schema);
  if (body.newPassword === body.currentPassword) return fail(400, '新密码不能与当前密码相同');

  loadEnv();
  const client = getSupabaseClient();
  // 先验证旧密码: 用其尝试登录, 失败说明当前密码不对。
  const { error: verifyError } = await client.auth.signInWithPassword({ email: user.email, password: body.currentPassword });
  if (verifyError) return fail(400, '当前密码不正确');

  const { error } = await client.auth.admin.updateUserById(user.id, { password: body.newPassword });
  if (error) return fail(500, `修改密码失败：${error.message}`);
  await dbQuery('UPDATE profiles SET must_change_password = false, updated_at = now() WHERE id = $1', user.id);
  await insertAudit({
    actorId: user.id, actorRole: user.roles[0], action: 'user.change_password',
    entityType: 'user', entityId: user.id, details: '本人修改密码',
    organizationId: user.organizationId,
  });
  return ok({ changed: true });
});
