/**
 * 标注任务套题入库(20 套, 程序化生成、答案与绘制同源):
 * 方框 10 + 点 5 + 折线 3 + 轮廓 2, 图片 public/training/annot2/, 数据 .media-gen/annot2/answers.json。
 * 幂等: 按 config->>'imageUrl' 查重。全布置示例班级 + MinIO 登记。
 * 用法: tsx scripts/db/seed-annotation-sets.mts
 */
import { loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
import { S3Storage } from 'coze-coding-dev-sdk';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

loadEnv();
loadEnvLocal();

interface Box { x: number; y: number; width: number; height: number; label: string }
interface Pt { x: number; y: number; label: string; attributes?: Record<string, string> }
interface Line { label: string; points: Array<{ x: number; y: number }> }
interface SetDef {
  id: string; task_type: string; title: string; instructions: string;
  config: Record<string, unknown>; answer_key: Record<string, unknown>;
}

const sets = JSON.parse(readFileSync('.media-gen/annot2/answers.json', 'utf8')) as SetDef[];

const db = new pg.Client({ connectionString: process.env.PGDATABASE_URL });
await db.connect();
const organizationId = (await db.query(`SELECT organization_id FROM profiles WHERE email='admin@exam.local'`)).rows[0]?.organization_id;
if (!organizationId) throw new Error('未找到组织');
const cohort = (await db.query(`SELECT c.id, (SELECT id FROM profiles WHERE email='teacher01@exam.local') AS teacher FROM cohorts c LIMIT 1`)).rows[0];
if (!cohort?.id || !cohort?.teacher) throw new Error('未找到班级/教师');

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: process.env.AWS_ACCESS_KEY_ID ?? '',
  secretKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: process.env.AWS_REGION || 'cn-beijing',
});

let inserted = 0, skipped = 0;
for (const s of sets) {
  const imageUrl = `/training/annot2/${s.id}.png`;
  const dup = await db.query(`SELECT id FROM practice_task_templates WHERE config->>'imageUrl'=$1`, [imageUrl]);
  if (dup.rowCount && dup.rowCount > 0) { skipped++; continue; }
  const config = { ...s.config, imageUrl };
  const id = randomUUID();
  await db.query(
    `INSERT INTO practice_task_templates(id, organization_id, task_type, title, instructions, difficulty, config, answer_key, grading_config, practice_only, review_status, published_version, created_at, updated_at)
     VALUES($1,$2,$3,$4,$5,2,$6,$7,'{}'::jsonb,true,'published',1,NOW(),NOW())`,
    [id, organizationId, s.task_type, s.title, s.instructions, JSON.stringify(config), JSON.stringify(s.answer_key)],
  );
  await db.query(
    `INSERT INTO practice_assignments(id, cohort_id, item_type, item_id, title, assigned_by, created_at)
     VALUES(gen_random_uuid(),$1,'task_template',$2,$3,$4,NOW()) ON CONFLICT DO NOTHING`,
    [cohort.id, id, s.title, cohort.teacher],
  );
  const buf = readFileSync(`public${imageUrl}`);
  const key = `media/${organizationId}/image/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.png`;
  const stored = await storage.uploadFile({ fileContent: buf, fileName: key, contentType: 'image/png' });
  await db.query(
    `INSERT INTO asset_manifests(organization_id, media_kind, object_key, checksum, version, status, category, meta, created_at, updated_at)
     VALUES($1,'image',$2,$3,1,'published','generated',$4,NOW(),NOW())`,
    [organizationId, stored, createHash('sha256').update(buf).digest('hex'), JSON.stringify({ label: `training/annot2/${s.id}.png`, source: 'ai-generated', generator: 'procedural-annotation' })],
  );
  inserted++;
  console.log('inserted:', s.id, `(${s.task_type})`);
}
console.log(`\n标注套题入库: 新增 ${inserted} / 跳过 ${skipped}`);
await db.end();
