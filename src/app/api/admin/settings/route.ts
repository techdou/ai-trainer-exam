import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import { ok, fail, catchError, parseBody } from '@/lib/api';
import { invalidateSettingsCache, SETTINGS_DEFAULTS } from '@/server/settings';
import { insertAudit } from '@/server/audit';

/**
 * GET /api/admin/settings — 获取系统设置
 * PATCH /api/admin/settings — 更新系统设置
 *
 * 系统设置存储在 key-value 表中。
 * 默认值统一来自 src/server/settings.ts 的 SETTINGS_DEFAULTS(运行时消费方同源),
 * 不在此处另写一份, 避免页面显示与实际生效不一致。
 */

// 设置项定义(value 不在此硬编码, 运行时从 SETTINGS_DEFAULTS/DB 取)
interface SettingDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: string[];
  description: string;
  min?: number;
  max?: number;
}

const SETTING_DEFS: SettingDef[] = [
  { key: 'exam_submit_grace_seconds', label: '考试交卷宽限时间（秒）', type: 'number', min: 0, max: 1800, description: '考试结束后允许继续交卷的秒数' },
  { key: 'exam_late_entry_minutes', label: '考试迟到入场时间（分钟）', type: 'number', min: 0, max: 120, description: '考试开始后允许入场的分钟数' },
  { key: 'exam_pass_score', label: '考试及格线（分）', type: 'number', min: 0, max: 1000, description: '考试通过的最低分数' },
  { key: 'exam_max_score', label: '考试满分（分）', type: 'number', min: 1, max: 1000, description: '考试总分上限' },
  { key: 'practice_show_answer', label: '练习模式显示答案', type: 'boolean', description: '练习时是否立即显示正确答案' },
  { key: 'practice_max_attempts', label: '练习最大尝试次数', type: 'number', min: 0, max: 100, description: '每道练习题最多可尝试次数（0=不限）' },
  { key: 'practice_pass_score', label: '练习及格线（分）', type: 'number', min: 0, max: 1000, description: '练习通过的最低分数' },
  { key: 'practice_max_score', label: '练习满分（分）', type: 'number', min: 1, max: 1000, description: '练习总分上限' },
  { key: 'password_min_length', label: '密码最小长度', type: 'number', min: 6, max: 64, description: '用户密码的最小长度要求' },
  { key: 'session_timeout_minutes', label: '会话超时时间（分钟）', type: 'number', min: 5, max: 1440, description: '用户无操作后自动登出的时间' },
];

export async function GET(request: NextRequest) {
  try {
    await requireRole(request as unknown as Request, ['super_admin']);

    // 尝试从数据库读取已保存的设置值
    let savedSettings: Record<string, string> = {};
    try {
      const rows = await dbQuery<{ key: string; value: string }>(
        'SELECT key, value FROM system_settings'
      );
      savedSettings = rows.reduce<Record<string, string>>((acc, r) => {
        acc[r.key] = r.value;
        return acc;
      }, {});
    } catch {
      // 表可能不存在，使用默认值
    }

    const settings = SETTING_DEFS.map(s => ({
      ...s,
      value: savedSettings[s.key] ?? SETTINGS_DEFAULTS[s.key] ?? '',
    }));

    return ok({ settings });
  } catch (e: unknown) {
    return catchError(e);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireRole(request as unknown as Request, ['super_admin']);

    const body = await parseBody(request, z.object({ key: z.string().min(1).max(100), value: z.string().max(1000) }));

    // 验证 key 合法且 value 符合该项类型/范围(历史上只验 key, 'abc' 也能写进数字配置)。
    const def = SETTING_DEFS.find(s => s.key === body.key);
    if (!def) {
      return fail(400, `不支持的设置项: ${body.key}`);
    }
    if (def.type === 'number') {
      const n = Number(body.value);
      if (!Number.isFinite(n)) return fail(400, `${def.label} 必须是数字`);
      if (def.min !== undefined && n < def.min) return fail(400, `${def.label} 不能小于 ${def.min}`);
      if (def.max !== undefined && n > def.max) return fail(400, `${def.label} 不能大于 ${def.max}`);
    }
    if (def.type === 'boolean' && !['true', 'false'].includes(body.value)) {
      return fail(400, `${def.label} 只能是 true 或 false`);
    }

    // 保存设置(INSERT 分支同样写 updated_at, 避免首次写入该列恒 NULL)
    try {
      await dbExec(
        `INSERT INTO system_settings (key, value, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        body.key,
        body.value,
      );
    } catch {
      // 表不存在则创建
      await dbExec(
        `CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ
        )`
      );
      await dbExec(
        `INSERT INTO system_settings (key, value, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        body.key,
        body.value,
      );
    }

    invalidateSettingsCache();
    // 系统配置变更属高敏操作, 必须留审计(auditor 依赖)。
    await insertAudit({ actorId: user.id, actorRole: user.roles[0], action: 'settings.update', entityType: 'system', entityId: body.key, details: body.value });
    return ok({ key: body.key, value: body.value });
  } catch (e: unknown) {
    return catchError(e);
  }
}
