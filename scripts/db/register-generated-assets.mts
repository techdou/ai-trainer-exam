/**
 * 把 AI 生成的正式素材上传 MinIO 并登记 asset_manifests(素材工坊可见的正式库存)。
 * 图片: public/training/gen + public/task-images 中本次生成的 10 张
 * 音频: public/training/transcription-demo.wav
 * 幂等: 按 object_key 查重, 已登记则跳过。
 * 用法: tsx scripts/db/register-generated-assets.mts
 */
import { loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
import { S3Storage } from 'coze-coding-dev-sdk';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

loadEnv();
loadEnvLocal();

const ORG_ID = (process.env.PGDATABASE_URL ? undefined : undefined); // placeholder, 下方查询
import pg from 'pg';
const db = new pg.Client({ connectionString: process.env.PGDATABASE_URL });
await db.connect();
const orgRow = await db.query(`SELECT organization_id FROM profiles WHERE email='admin@exam.local'`);
const organizationId = orgRow.rows[0]?.organization_id ?? null;

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: process.env.AWS_ACCESS_KEY_ID ?? '',
  secretKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: process.env.AWS_REGION || 'cn-beijing',
});

const contentTypeByExt: Record<string, string> = {
  png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', wav: 'audio/wav', mp3: 'audio/mpeg',
};

const files: Array<{ local: string; label: string }> = [
  ...['cat-solo-1.png', 'basketball-1.png', 'plant-1.webp', 'mug-1.webp'].map((f) => ({
    local: `public/training/gen/${f}`, label: `training/gen/${f}`,
  })),
  ...['img1-product', 'img2-blurred', 'img3-street', 'img4-overexposed', 'img5-food', 'img6-watermark'].map((n) => ({
    local: `public/task-images/${n}.jpg`, label: `task-images/${n}.jpg`,
  })),
  { local: 'public/training/transcription-demo.wav', label: 'training/transcription-demo.wav' },
];

let inserted = 0, skipped = 0;
for (const { local, label } of files) {
  const buf = readFileSync(local);
  const checksum = createHash('sha256').update(buf).digest('hex');
  const existing = await db.query(`SELECT id FROM asset_manifests WHERE checksum=$1 AND media_kind=$2`, [
    checksum, local.endsWith('.wav') ? 'audio' : 'image',
  ]);
  if (existing.rowCount && existing.rowCount > 0) {
    skipped++;
    continue;
  }
  const ext = path.extname(local).slice(1).toLowerCase();
  const contentType = contentTypeByExt[ext] ?? 'application/octet-stream';
  const day = new Date().toISOString().slice(0, 10);
  const objectKey = `media/${organizationId ?? 'global'}/${local.endsWith('.wav') ? 'audio' : 'image'}/${day}/${randomUUID()}.${ext}`;
  const storedKey = await storage.uploadFile({ fileContent: buf, fileName: objectKey, contentType });
  await db.query(
    `INSERT INTO asset_manifests(organization_id, media_kind, object_key, checksum, version, status, category, meta, created_at, updated_at)
     VALUES($1,$2,$3,$4,1,'published','generated',$5,NOW(),NOW())`,
    [
      organizationId,
      local.endsWith('.wav') ? 'audio' : 'image',
      storedKey,
      checksum,
      JSON.stringify({ label, source: 'ai-generated', generator: local.endsWith('.wav') ? 'mimo-v2.5-tts' : 'gpt-image-2', deployedToPublic: local }),
    ],
  );
  inserted++;
  console.log('registered:', label, '→', storedKey);
}
console.log(`\ndone: inserted=${inserted} skipped=${skipped}`);
await db.end();
