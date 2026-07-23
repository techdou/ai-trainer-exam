/**
 * 系统设置读取工具。
 * 从 system_settings 表读取 key-value 配置，支持默认值兜底。
 */
import { dbQuery } from '@/server/db';

const cache: Record<string, string> = {};
let cacheLoaded = false;

const DEFAULTS: Record<string, string> = {
  exam_submit_grace_seconds: '300',
  exam_late_entry_minutes: '15',
  exam_pass_score: '60',
  exam_max_score: '100',
  practice_show_answer: 'true',
  practice_max_attempts: '0',
  practice_pass_score: '60',
  practice_max_score: '100',
  password_min_length: '8',
  session_timeout_minutes: '120',
};

async function ensureCacheLoaded(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const rows = await dbQuery<{ key: string; value: string }>(
      'SELECT key, value FROM system_settings',
    );
    for (const r of rows) {
      cache[r.key] = r.value;
    }
  } catch {
    // 表可能不存在，使用默认值
  }
  cacheLoaded = true;
}

/** 获取单个设置值（带缓存，首次调用加载全部） */
export async function getSetting(key: string): Promise<string> {
  await ensureCacheLoaded();
  return cache[key] ?? DEFAULTS[key] ?? '';
}

/** 获取数字型设置值 */
export async function getSettingNumber(key: string): Promise<number> {
  const val = await getSetting(key);
  const num = parseFloat(val);
  return isNaN(num) ? parseFloat(DEFAULTS[key] ?? '0') : num;
}

/** 获取布尔型设置值 */
export async function getSettingBool(key: string): Promise<boolean> {
  const val = await getSetting(key);
  return val === 'true' || val === '1';
}

/** 获取练习及格分 */
export async function getPracticePassScore(): Promise<number> {
  return getSettingNumber('practice_pass_score');
}

/** 获取练习满分 */
export async function getPracticeMaxScore(): Promise<number> {
  return getSettingNumber('practice_max_score');
}

/** 获取考试及格分 */
export async function getExamPassScore(): Promise<number> {
  return getSettingNumber('exam_pass_score');
}

/** 获取考试满分 */
export async function getExamMaxScore(): Promise<number> {
  return getSettingNumber('exam_max_score');
}
