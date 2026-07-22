import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import pg from 'pg';

loadEnv();
const url = await getDbUrl();
console.log('host:', new URL(url).host, 'db:', new URL(url).pathname);
const client = new pg.Client({ connectionString: url });
await client.connect();
const dbs = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
console.log('databases:', dbs.rows.map((r) => r.datname).join(', '));
const sch = await client.query(
  "SELECT table_schema, count(*) AS n FROM information_schema.tables GROUP BY table_schema ORDER BY n DESC"
);
console.log('schemas:', JSON.stringify(sch.rows));
const pub = await client.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
);
console.log('public tables:', pub.rows.map((r) => r.table_name).join(', '));
await client.end();
