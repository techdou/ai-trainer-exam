/**
 * 旧库(扣子平台 Supabase) → 自部署库 内容资产迁移。
 * 搬运范围(与用户关联的数据一律不搬, 用户在新库重新 seed/导入):
 *   organizations / training_projects / cohorts          (组织结构, by id upsert)
 *   practice_question_items / exam_question_items        (题库, by id upsert)
 *   practice_task_templates / exam_task_templates        (实操任务模板, by id upsert)
 *   asset_manifests / practice_asset_versions / exam_asset_versions (素材元数据, by id upsert)
 *   [可选] MinIO 对象搬运: --with-assets, 需在旧 COZE_BUCKET_* 凭证可用的环境执行
 *
 * 幂等: 全部 ON CONFLICT (id) DO UPDATE, 可重复执行。
 * 用法: tsx scripts/db/migrate-from-coze.mts <旧库PG连接串> [--with-assets]
 * 注意: 新库需先跑完 drizzle 迁移(含 0005/0006, 保证 VIEW 与 created_by 列存在)。
 */
import { loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
import pg from 'pg';

loadEnv();
loadEnvLocal();

const SRC_URL = process.argv[2];
const WITH_ASSETS = process.argv.includes('--with-assets');
if (!SRC_URL) {
  console.error('用法: tsx scripts/db/migrate-from-coze.mts <旧库PG连接串> [--with-assets]');
  process.exit(1);
}

const src = new pg.Client({ connectionString: SRC_URL });
const dst = new pg.Client({ connectionString: process.env.PGDATABASE_URL });
await src.connect();
await dst.connect();

type Cols = string[];
const colCache = new Map<string, Cols>();
async function columnsOf(client: pg.Client, table: string): Promise<Cols> {
  if (!colCache.has(table)) {
    const r = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [table],
    );
    colCache.set(table, r.rows.map((x) => x.column_name as string));
  }
  return colCache.get(table)!;
}

/** 全列 by-id upsert: 源有的列才写(目标多出的列如本地新增不受影响) */
async function copyTable(table: string, orderBy = 'created_at'): Promise<number> {
  const srcCols = await columnsOf(src, table);
  const dstCols = new Set(await columnsOf(dst, table));
  const cols = srcCols.filter((c) => dstCols.has(c));
  // jsonb 列的 JS 标量(string/number/boolean)必须显式 JSON.stringify:
  // pg 读出 JSON 标量是原生 JS 值, 回传时驱动按文本发送, 服务器无法把裸 `A`/`true` 解析回 jsonb。
  const typeRows = await dst.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [table],
  );
  const jsonCols = new Set(typeRows.rows.filter((r) => /json/.test(r.data_type)).map((r) => r.column_name as string));
  const { rows } = await src.query(`SELECT ${cols.map((c) => `"${c}"`).join(',')} FROM ${table} ORDER BY ${orderBy}`);
  let n = 0;
  for (const row of rows) {
    const vals = cols.map((c) => {
      const v = row[c];
      // jsonb 列所有非 null 值统一 stringify: 标量(JSON string/bool/number)必须转回 JSON 文本,
      // 否则服务器把裸 `A`/`true` 当 jsonb 解析直接报错; object 的 stringify 是幂等安全。
      return jsonCols.has(c) && v !== null && v !== undefined ? JSON.stringify(v) : v;
    });
    const ph = cols.map((_, i) => `$${i + 1}`);
    const updates = cols.filter((c) => c !== 'id').map((c) => `"${c}"=EXCLUDED."${c}"`);
    await dst.query(
      `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')})
       VALUES (${ph.join(',')})
       ON CONFLICT (id) DO UPDATE SET ${updates.join(',')}`,
      vals,
    );
    n++;
  }
  return n;
}

async function copyTableNoId(table: string, pk: string[]): Promise<number> {
  const srcCols = await columnsOf(src, table);
  const dstCols = new Set(await columnsOf(dst, table));
  const cols = srcCols.filter((c) => dstCols.has(c));
  const { rows } = await src.query(`SELECT ${cols.map((c) => `"${c}"`).join(',')} FROM ${table}`);
  let n = 0;
  for (const row of rows) {
    const vals = cols.map((c) => row[c]);
    const ph = cols.map((_, i) => `$${i + 1}`);
    const keyPh = pk.map((c) => `"${c}"=$${cols.indexOf(c) + 1}`).join(' AND ');
    const updates = cols.filter((c) => !pk.includes(c)).map((c) => `"${c}"=EXCLUDED."${c}"`);
    const conflictTarget = pk.join(',');
    await dst.query(
      `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')})
       VALUES (${ph.join(',')})
       ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updates.join(',')}`,
      vals,
    );
    n++;
    void keyPh;
  }
  return n;
}

const report: Array<[string, number | string]> = [];

const plan: Array<[string, string?]> = [
  ['organizations', 'created_at'],
  ['training_projects', 'created_at'],
  ['cohorts', 'created_at'],
  ['practice_question_items', 'created_at'],
  ['exam_question_items', 'created_at'],
  ['practice_task_templates', 'created_at'],
  ['exam_task_templates', 'created_at'],
  ['asset_manifests', 'created_at'],
  ['practice_asset_versions'],
  ['exam_asset_versions'],
];

for (const [table, order] of plan) {
  try {
    const hasId = (await columnsOf(src, table)).includes('id');
    const n = hasId ? await copyTable(table, order ?? 'created_at') : await copyTableNoId(table, (await columnsOf(src, table)).slice(0, 2));
    report.push([table, n]);
    console.log(`copied ${table}: ${n}`);
  } catch (e) {
    report.push([table, 'FAIL']);
    console.error(`FAILED ${table}:`, (e as Error).message);
  }
}

// [可选] 素材对象搬运: 需要旧 COZE_BUCKET_* 凭证(仅在能访问平台 S3 代理的环境可用)
if (WITH_ASSETS) {
  const { S3Storage } = await import('coze-coding-dev-sdk');
  const old = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL_OLD ?? process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: '', secretKey: '',
    bucketName: process.env.COZE_BUCKET_NAME_OLD ?? process.env.COZE_BUCKET_NAME,
    region: process.env.AWS_REGION || 'cn-beijing',
  });
  const neo = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    bucketName: process.env.COZE_BUCKET_NAME,
    region: process.env.AWS_REGION || 'cn-beijing',
  });
  const { rows } = await dst.query(`SELECT object_key FROM asset_manifests WHERE object_key IS NOT NULL`);
  let ok = 0, skip = 0, fail = 0;
  for (const { object_key } of rows) {
    try {
      const buf = await old.readFile({ fileKey: object_key });
      await neo.uploadFile({ fileContent: Buffer.from(buf), fileName: object_key, contentType: 'application/octet-stream' });
      ok++;
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (/NoSuchKey|not found|404/i.test(msg)) skip++; else { fail++; console.error(`asset ${object_key}: ${msg.slice(0, 120)}`); }
    }
  }
  console.log(`assets copied: ok=${ok} missing=${skip} failed=${fail}`);
  report.push(['minio objects', ok]);
} else {
  console.log('素材对象未搬运(加 --with-assets 且在持有旧桶凭证的环境执行)');
}

console.log('\n==== 迁移汇总 ====');
for (const [t, n] of report) console.log(`${t}: ${n}`);
await src.end();
await dst.end();
