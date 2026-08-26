#!/usr/bin/env node
/**
 * 生成自部署 Supabase 全套密钥(纯 node 内置模块, 零依赖)。
 * 用法: node utils/generate-keys.mjs   → 输出一段 .env, 贴进 .env 的密钥区即可。
 *
 * anon/service_role key 是用 JWT_SECRET 签的 HS256 JWT(与 GoTrue 同 secret),
 * payload 与 Supabase 官方 .env.example 的示例 key 保持同构({role, iss, iat, exp})。
 */
import { randomBytes, createHmac } from 'node:crypto';

const b64url = (buf) => buf.toString('base64url');

function signJwt(secret, role, exp) {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const iat = Math.floor(Date.now() / 1000);
  const payload = b64url(Buffer.from(JSON.stringify({ role, iss: 'supabase-demo', iat, exp })));
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const jwtSecret = randomBytes(48).toString('base64');
const farFuture = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600; // 10 年

const lines = [
  `# ── 由 utils/generate-keys.mjs 生成, 首次部署时生成一次并妥善保管 ──`,
  `POSTGRES_PASSWORD=${randomBytes(18).toString('base64url')}`,
  `JWT_SECRET=${jwtSecret}`,
  `ANON_KEY=${signJwt(jwtSecret, 'anon', farFuture)}`,
  `SERVICE_ROLE_KEY=${signJwt(jwtSecret, 'service_role', farFuture)}`,
  `MINIO_ROOT_USER=exam-minio`,
  `MINIO_ROOT_PASSWORD=${randomBytes(24).toString('base64url')}`,
  `# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 请填 MinIO_ROOT_USER / MINIO_ROOT_PASSWORD 同值`,
];

console.log(lines.join('\n'));
