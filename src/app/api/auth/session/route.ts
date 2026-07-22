/**
 * /api/auth/session — 会话管理
 * GET  验证当前 token 并返回用户信息
 * POST 邮箱+密码登录，返回 access_token + 用户信息
 * DELETE 登出
 */
import { handler, ok, fail } from '@/lib/api';
import { getSessionUser, createSession } from '@/server/auth';

/** GET — 获取当前登录用户 */
export const GET = handler(async (request: Request) => {
  const user = await getSessionUser(request);
  if (!user) {
    return Response.json({ success: false, error: '未登录' }, { status: 401 });
  }
  return ok({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    organizationId: user.organizationId,
  });
});

/** POST — 邮箱+密码登录 */
export const POST = handler(async (request: Request) => {
  const body = await request.json() as { email?: string; password?: string };
  if (!body.email || !body.password) {
    return fail(400, '请输入账号和密码');
  }

  const result = await createSession(body.email, body.password);
  if (!result) {
    return fail(401, '账号或密码不正确');
  }

  return ok(result);
});

/** DELETE — 登出（客户端自行丢弃 token 即可） */
export const DELETE = handler(async () => {
  return ok({ message: '已登出' });
});
