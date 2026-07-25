import { dbQuery } from '@/server/db';

// 系统设置唯一默认值来源。管理端 settings API 与运行时消费方都必须从这里取,
// 历史上两处各自硬编码(300 vs 60 等)导致页面显示与实际生效不一致。
export const SETTINGS_DEFAULTS: Record<string, string> = {
  exam_submit_grace_seconds: '60',
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

const DEFAULTS = SETTINGS_DEFAULTS;

let cache: Record<string, string> = {};
let loadedAt = 0;
const TTL_MS = 30_000;

async function load(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  const next = { ...DEFAULTS };
  try {
    const rows = await dbQuery<{ key: string; value: string }>('SELECT key, value FROM system_settings');
    for (const row of rows) next[row.key] = row.value;
  } catch {
    // 初次迁移前使用默认值。
  }
  cache = next;
  loadedAt = Date.now();
}

export function invalidateSettingsCache(): void { loadedAt = 0; }
export async function getSetting(key: string): Promise<string> { await load(); return cache[key] ?? DEFAULTS[key] ?? ''; }
export async function getSettingNumber(key: string): Promise<number> {
  const value = Number(await getSetting(key));
  const fallback = Number(DEFAULTS[key] ?? 0);
  return Number.isFinite(value) ? value : fallback;
}
export async function getSettingBool(key: string): Promise<boolean> { return ['true', '1'].includes((await getSetting(key)).toLowerCase()); }
export const getPracticePassScore = () => getSettingNumber('practice_pass_score');
export const getPracticeMaxScore = () => getSettingNumber('practice_max_score');
export const getExamPassScore = () => getSettingNumber('exam_pass_score');
export const getExamMaxScore = () => getSettingNumber('exam_max_score');
