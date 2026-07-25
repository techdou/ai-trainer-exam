/**
 * 脚本环境变量加载公共入口。
 * coze SDK 的 loadEnv() 只读 .env; 数据库连接串等私密配置在 .env.local, 需手动补齐。
 * 所有 scripts/db 下的脚本统一用此 helper, 避免各自内联导致行为不一致。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadEnvLocal() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // .env.local 不存在时静默(平台注入环境变量的部署形态)。
  }
}
