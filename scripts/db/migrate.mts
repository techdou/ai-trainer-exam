/**
 * 数据库迁移执行器：按顺序应用 drizzle/*.sql 中尚未应用的迁移。
 * 通过 __migrations 表记录已应用文件，幂等。
 * 用法：npx tsx scripts/db/migrate.mts
 */
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

loadEnv();
const url = await getDbUrl();
const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS __migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const dir = path.resolve(process.cwd(), 'drizzle');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  const done = await client.query('SELECT 1 FROM __migrations WHERE filename = $1', [file]);
  if (done.rowCount && done.rowCount > 0) {
    console.log('skip (already applied):', file);
    continue;
  }
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  console.log('applying:', file);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO __migrations (filename) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log('applied:', file);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

const res = await client.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'");
console.log('public tables:', res.rows[0].n);
await client.end();
