/**
 * 标注套题答案更新(防重叠版素材): 按 config->>'imageUrl' 匹配, 用重新生成的
 * answers.json 更新 answer_key/config, 新图上传 MinIO 并登记 asset_manifests。
 * 幂等可重复执行。用法: tsx scripts/db/update-annotation-sets.mts
 */
import { loadEnv, S3Storage } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

loadEnv();
loadEnvLocal();

interface SetDef {
  id: string; task_type: string; title: string; instructions: string;
  config: Record<string, unknown>; answer_key: Record<string, unknown>;
}
const sets = JSON.parse(readFileSync('.media-gen/annot2/answers.json', 'utf8')) as SetDef[];

const db = new pg.Client({ connectionString: process.env.PGDATABASE_URL });
await db.connect();
const organizationId = (await db.query(`SELECT organization_id FROM profiles WHERE email='admin@exam.local'`)).rows[0]?.organization_id;
if (!organizationId) throw new Error('未找到组织');

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: process.env.AWS_ACCESS_KEY_ID ?? '',
  secretKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: process.env.AWS_REGION || 'cn-beijing',
});

const TABLES = ['practice_task_templates', 'exam_task_templates'] as const;
let updated = 0, missing = 0, assets = 0;
for (const s of sets) {
  const imageUrl = `/training/annot2/${s.id}.png`;
  const config = { ...s.config, imageUrl };
  let hit = false;
  for (const table of TABLES) {
    const r = await db.query(
      `UPDATE ${table} SET answer_key=$2::jsonb, config=$3::jsonb, updated_at=NOW()
        WHERE config->>'imageUrl'=$1 AND deleted_at IS NULL`,
      [imageUrl, JSON.stringify(s.answer_key), JSON.stringify(config)],
    );
    if (r.rowCount && r.rowCount > 0) { updated += r.rowCount; hit = true; }
  }
  if (!hit) { missing++; console.log('WARN 未匹配到:', imageUrl); continue; }
  // 新图登记对象存储(学员端实际读 public 静态路径,这里保持素材台账完整)
  const buf = readFileSync(`public${imageUrl}`);
  const key = `media/${organizationId}/image/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.png`;
  await storage.uploadFile({ fileContent: buf, fileName: key, contentType: 'image/png' });
  await db.query(
    `INSERT INTO asset_manifests(organization_id, media_kind, object_key, checksum, version, status, category, meta, created_at, updated_at)
     VALUES($1,'image',$2,$3,2,'published','generated',$4,NOW(),NOW())`,
    [organizationId, key, createHash('sha256').update(buf).digest('hex'),
      JSON.stringify({ label: `training/annot2/${s.id}.png`, source: 'ai-generated', generator: 'procedural-annotation-v2-no-overlap' })],
  );
  assets++;
}
console.log(`\n标注套题更新完成: 更新 ${updated} 行(练习+考试), 登记 ${assets} 个新素材, 未匹配 ${missing}`);
await db.end();
