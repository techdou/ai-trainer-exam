import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import {ok, fail, catchError} from '@/lib/api';

/**
 * GET /api/admin/settings — 获取系统设置
 * PATCH /api/admin/settings — 更新系统设置
 *
 * 系统设置存储在 key-value 表中。
 * 目前以 exam_schedules 的默认值等作为"系统设置"展示。
 * 真正的 key-value 配置可后续扩展。
 */

// 设置项定义
interface SettingItem {
  key: string;
  label: string;
  value: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: string[];
  description: string;
}

const DEFAULT_SETTINGS: SettingItem[] = [
  {
    key: 'exam_submit_grace_seconds',
    label: '考试交卷宽限时间（秒）',
    value: '300',
    type: 'number',
    description: '考试结束后允许继续交卷的秒数',
  },
  {
    key: 'exam_late_entry_minutes',
    label: '考试迟到入场时间（分钟）',
    value: '15',
    type: 'number',
    description: '考试开始后允许入场的分钟数',
  },
  {
    key: 'exam_pass_score',
    label: '考试及格线（分）',
    value: '60',
    type: 'number',
    description: '考试通过的最低分数',
  },
  {
    key: 'practice_show_answer',
    label: '练习模式显示答案',
    value: 'true',
    type: 'boolean',
    description: '练习时是否立即显示正确答案',
  },
  {
    key: 'practice_max_attempts',
    label: '练习最大尝试次数',
    value: '3',
    type: 'number',
    description: '每道练习题最多可尝试次数（0=不限）',
  },
  {
    key: 'password_min_length',
    label: '密码最小长度',
    value: '8',
    type: 'number',
    description: '用户密码的最小长度要求',
  },
  {
    key: 'session_timeout_minutes',
    label: '会话超时时间（分钟）',
    value: '120',
    type: 'number',
    description: '用户无操作后自动登出的时间',
  },
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

    const settings = DEFAULT_SETTINGS.map(s => ({
      ...s,
      value: savedSettings[s.key] ?? s.value,
    }));

    return ok({ settings });
  } catch (e: unknown) {
    return catchError(e);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireRole(request as unknown as Request, ['super_admin']);

    const body = await request.json() as { key?: string; value?: string };
    if (!body.key || body.value === undefined) {
      return fail(400, '需要 key 和 value 参数');
    }

    // 验证 key 是否合法
    const allowedKeys = DEFAULT_SETTINGS.map(s => s.key);
    if (!allowedKeys.includes(body.key)) {
      return fail(400, `不支持的设置项: ${body.key}`);
    }

    // 保存设置
    try {
      await dbExec(
        `INSERT INTO system_settings (key, value) VALUES ($1, $2)
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
        `INSERT INTO system_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        body.key,
        body.value,
      );
    }

    return ok({ key: body.key, value: body.value });
  } catch (e: unknown) {
    return catchError(e);
  }
}
