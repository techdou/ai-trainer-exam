/**
 * 服务端 PostgreSQL 连接池（单例）。
 * 通过 coze-coding-dev-sdk 的 getDbUrl() 获取连接串（Workload Identity 动态注入）。
 * 该连接为 service 级权限（绕过 RLS），因此所有 API 路由必须自行做 RBAC 校验。
 * RLS 已在库级启用，作为 anon/authenticated 直连时的纵深防御。
 */
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';

let poolPromise: Promise<Pool> | null = null;

async function createPool(): Promise<Pool> {
  loadEnv();
  const url = await getDbUrl();
  const pool = new Pool({
    connectionString: url,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err: Error) => {
    console.error('[db] idle client error:', err.message);
  });
  return pool;
}

export function getPool(): Promise<Pool> {
  if (!poolPromise) {
    poolPromise = createPool();
  }
  return poolPromise;
}

/** 普通查询，直接返回行数组 */
export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  ...params: unknown[]
): Promise<T[]> {
  const pool = await getPool();
  const res = await pool.query<T>(text, params.length > 0 ? params : undefined);
  return res.rows;
}

/** 查询单行，无结果返回 null */
export async function dbOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  ...params: unknown[]
): Promise<T | null> {
  const rows = await dbQuery<T>(text, ...params);
  return rows[0] ?? null;
}

/** 事务执行器 */
export async function dbTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** 执行写操作（INSERT/UPDATE/DELETE），返回影响行数 */
export async function dbExec(text: string, ...params: unknown[]): Promise<number> {
  const pool = await getPool();
  const res = await pool.query(text, params.length > 0 ? params : undefined);
  return res.rowCount ?? 0;
}

/** 服务端当前时间（数据库时间，考试计时以此为唯一权威） */
export async function dbNow(): Promise<Date> {
  const row = await dbOne<{ now: Date }>('SELECT now() AS now');
  return row!.now;
}
