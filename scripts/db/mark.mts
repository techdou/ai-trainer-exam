import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import pg from 'pg';
loadEnv();
const url = await getDbUrl();
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("INSERT INTO __migrations (filename) VALUES ('0000_medical_roland_deschain.sql') ON CONFLICT DO NOTHING");
console.log('marked 0000 applied');
await c.end();
