import { z } from 'zod';
import { handler, ok, fail, parseBody } from '@/lib/api';
import { getSessionUser, createSession, refreshSession } from '@/server/auth';

export const GET = handler(async (request: Request) => {
  const user = await getSessionUser(request);
  return user ? ok(user) : fail(401, '未登录');
});

export const POST = handler(async (request: Request) => {
  const body = await parseBody(request, z.object({ email: z.string().email(), password: z.string().min(1).max(200) }));
  const result = await createSession(body.email, body.password);
  return result ? ok(result) : fail(401, '账号或密码不正确，或账号已停用');
});

export const PATCH = handler(async (request: Request) => {
  const body = await parseBody(request, z.object({ refreshToken: z.string().min(10).max(4096) }));
  const result = await refreshSession(body.refreshToken);
  return result ? ok(result) : fail(401, '会话已过期，请重新登录');
});

export const DELETE = handler(async () => ok({ message: '已登出' }));
