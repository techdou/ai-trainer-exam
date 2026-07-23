/** API 路由公共工具：统一 JSON 响应、Zod 校验、错误处理 */
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from '@/server/auth';

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ success: true, data }, init);
}

export function fail(status: number, message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ success: false, error: message, ...extra }, { status });
}

/** 解析并校验请求 JSON body */
export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, '请求格式不正确');
  }
  try {
    return schema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      throw new ApiError(400, `参数不正确：${first?.path.join('.') ?? ''} ${first?.message ?? ''}`);
    }
    throw err;
  }
}

/** 统一错误处理包装 */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return catchError(err);
    }
  };
}

/** 统一 catch 块错误处理，替代字符串匹配 */
export function catchError(e: unknown): Response {
  if (e instanceof ApiError) {
    return fail(e.status, e.message);
  }
  console.error('[api] unexpected error:', e);
  return fail(500, '服务器开小差了，请稍后再试');
}

/** 生成随机初始密码（易读、适合零基础学员抄写） */
export function genInitialPassword(): string {
  const digits = '23456789';
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  let pw = '';
  for (let i = 0; i < 4; i++) pw += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) pw += digits[Math.floor(Math.random() * digits.length)];
  return pw;
}

/** 学员伪邮箱（无真实邮箱时使用） */
export function studentPseudoEmail(username: string): string {
  return `${username}@student.exam.local`;
}

/** 稳定 hash（用于题目去重等），输出 hex */
export async function sha256Hex(text: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 规范化文本用于去重比较（去空白、全角转半角、统一大小写） */
export function normalizeForDedupe(text: string): string {
  return text
    .replace(/[　\s]+/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}
