import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import pg from 'pg';

loadEnv();
const url = await getDbUrl();
for (const db of ['aidb', 'postgres', '_supabase']) {
  const u = url.replace(/\/postgres(\?|$)/, `/${db}$1`);
  const client = new pg.Client({ connectionString: u });
  try {
    await client.connect();
    const r = await client.query(
      "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'"
    );
    const names = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name LIMIT 8"
    );
    console.log(`${db}: ${r.rows[0].n} tables ->`, names.rows.map((x) => x.table_name).join(', '));
    await client.end();
  } catch (e) {
    console.log(`${db}: FAIL ${(e as Error).message}`);
  }
}
