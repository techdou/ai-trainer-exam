import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import pg from 'pg';
import { readFileSync } from 'node:fs';

loadEnv();
const url = await getDbUrl();
const file = process.argv[2];
if (!file) throw new Error('usage: tsx apply-sql.mts <file.sql>');
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(readFileSync(file, 'utf-8'));
console.log(`applied ${file}`);
const r = await client.query(
  "SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' LIMIT 5"
);
console.log('sample policies:', JSON.stringify(r.rows));
await client.end();
