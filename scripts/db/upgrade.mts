import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import { execSync } from 'node:child_process';
loadEnv();
const url = await getDbUrl();
console.log('URL host:', new URL(url).host);
execSync('npx coze-coding-ai db upgrade -v', {
  stdio: 'inherit',
  env: { ...process.env, PGDATABASE_URL: url },
});
