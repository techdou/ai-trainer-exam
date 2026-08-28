/**
 * 批量练习数据集入库(第二批 AI 生成素材):
 *   音频 20 段 → 20 个 audio_transcription 转写任务(文案即判分答案, 语气词自动抽取)
 *   图片 30 张 → 30 道 prompt_description 提示词描述题(manifest 携带判分关键词)
 * 部署: 图片转 webp 到 public/training/batch2/, 音频复制到 public/training/audio/;
 *       全部布置给学员班级(practice_assignments) + 上传 MinIO 登记 asset_manifests。
 * 幂等: 题目按 options.image 查重, 任务按 config.audioUrl 查重, 可重复执行。
 * 用法: tsx scripts/db/seed-batch2-media.mts
 */
import { loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
import { S3Storage } from 'coze-coding-dev-sdk';
import pg from 'pg';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

loadEnv();
loadEnvLocal();

const GEN = '.media-gen/batch2';
const FILLERS = ['嗯', '啊', '哦', '呀', '呢', '啦', '咦', '哇', '哎'];
const ORG_SQL = `SELECT organization_id FROM profiles WHERE email='admin@exam.local'`;

const db = new pg.Client({ connectionString: process.env.PGDATABASE_URL });
await db.connect();
const organizationId = (await db.query(ORG_SQL)).rows[0]?.organization_id ?? null;
if (!organizationId) throw new Error('未找到组织(先跑 seed-core)');
const cohortRow = await db.query(`SELECT c.id, (SELECT id FROM profiles WHERE email='teacher01@exam.local') AS teacher FROM cohorts c LIMIT 1`);
const cohort = cohortRow.rows[0];
if (!cohort?.id || !cohort?.teacher) throw new Error('未找到班级或教师(先跑 seed-core + 迁移)');

const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: process.env.AWS_ACCESS_KEY_ID ?? '',
  secretKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: process.env.AWS_REGION || 'cn-beijing',
});

async function uploadMinio(buf: Buffer, kind: 'image' | 'audio', ext: string, meta: Record<string, unknown>): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `media/${organizationId}/${kind}/${day}/${randomUUID()}.${ext}`;
  const stored = await storage.uploadFile({ fileContent: buf, fileName: key, contentType: kind === 'image' ? 'image/webp' : 'audio/wav' });
  await db.query(
    `INSERT INTO asset_manifests(organization_id, media_kind, object_key, checksum, version, status, category, meta, created_at, updated_at)
     VALUES($1,$2,$3,$4,1,'published','generated',$5,NOW(),NOW())`,
    [organizationId, kind, stored, createHash('sha256').update(buf).digest('hex'), JSON.stringify({ ...meta, source: 'ai-generated' })],
  );
  return stored;
}

async function assign(itemId: string, itemType: string, title: string): Promise<void> {
  await db.query(
    `INSERT INTO practice_assignments(id, cohort_id, item_type, item_id, title, assigned_by, created_at)
     VALUES(gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
     ON CONFLICT DO NOTHING`,
    [cohort.id, itemType, itemId, title, cohort.teacher],
  );
}

// ─── 1. 音频转写任务 ───────────────────────────────────────────
const segDoc = JSON.parse(readFileSync(`${GEN}/audio-segments.json`, 'utf8')) as {
  segments: Array<{ index: number; title: string; filename: string; voice: string; speech_text: string }>;
};
mkdirSync('public/training/audio', { recursive: true });
let audioNew = 0;
for (const s of segDoc.segments) {
  const src = `${GEN}/audio-out/${s.filename}`;
  if (!existsSync(src)) { console.log(`skip audio ${s.filename} (文件缺失)`); continue; }
  const audioUrl = `/training/audio/${s.filename}`;
  const dup = await db.query(`SELECT id FROM practice_task_templates WHERE config->>'audioUrl'=$1 LIMIT 1`, [audioUrl]);
  if (dup.rowCount && dup.rowCount > 0) { console.log(`skip ${s.title} (已存在)`); continue; }
  const buf = readFileSync(src);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`public${audioUrl}`, buf);
  const requiredFillers = FILLERS.filter((f) => s.speech_text.includes(f));
  const id = randomUUID();
  await db.query(
    `INSERT INTO practice_task_templates(id, organization_id, task_type, title, instructions, difficulty, config, answer_key, grading_config, practice_only, review_status, published_version, created_at, updated_at)
     VALUES($1,$2,'audio_transcription',$3,$4,1,$5,$6,'{}'::jsonb,true,'published',1,NOW(),NOW())`,
    [id, organizationId, `音频转写：${s.title}`, '播放音频，把听到的全部内容写下来。“嗯、啊、哦”等语气助词也要写上。',
     JSON.stringify({ audioUrl }),
     JSON.stringify({ requiredFillers, correctTranscript: s.speech_text, similarityThreshold: 0.82 })],
  );
  await assign(id, 'task_template', `音频转写：${s.title}`);
  await uploadMinio(buf, 'audio', 'wav', { label: `training/audio/${s.filename}`, generator: 'mimo-v2.5-tts', voice: s.voice });
  audioNew++;
}
console.log(`音频任务: 新增 ${audioNew}`);

// ─── 2. 提示词描述题(图片) ─────────────────────────────────────
const manifest = JSON.parse(readFileSync(`${GEN}/image-manifest.json`, 'utf8')) as Array<{ id: string; keywords: string[][] }>;
mkdirSync('public/training/batch2', { recursive: true });
let imgNew = 0;
for (const item of manifest) {
  const webp = `public/training/batch2/${item.id}.webp`;
  if (!existsSync(webp)) { console.log(`skip ${item.id} (webp 未部署)`); continue; }
  const imageUrl = `/training/batch2/${item.id}.webp`;
  const dup = await db.query(`SELECT id FROM practice_question_items WHERE options->>'image'=$1 LIMIT 1`, [imageUrl]);
  if (dup.rowCount && dup.rowCount > 0) { console.log(`skip ${item.id} (已存在)`); continue; }
  const stem = '请仔细观察下图，用自然语言撰写一段提示词（Prompt），描述图片中能够看到的场景和内容。描述应包含画面中的主要元素、颜色、环境等关键信息。';
  await db.query(
    `INSERT INTO practice_question_items(id, organization_id, question_type, stem, options, answer_key, explanation, knowledge_point, difficulty, source, source_version, review_status, published_version, practice_only, legal_review_required, content_hash, created_at, updated_at)
     VALUES(gen_random_uuid(),$1,'prompt_description',$2,$3,$4,'','提示词撰写',2,'batch2_gen','1','published',1,true,false,$5,NOW(),NOW())`,
    [organizationId, stem, JSON.stringify({ image: imageUrl }),
     JSON.stringify({ keywords: item.keywords.flat(), passThreshold: 0.6 }),
     createHash('sha256').update(imageUrl).digest('hex')],
  );
  const buf = readFileSync(webp);
  await uploadMinio(buf, 'image', 'webp', { label: `training/batch2/${item.id}.webp`, generator: 'gpt-image-2' });
  imgNew++;
}
console.log(`提示词描述题: 新增 ${imgNew}`);

// 汇总
const q = await db.query(`SELECT count(*)::int AS n FROM practice_question_items WHERE source='batch2_gen'`);
const t = await db.query(`SELECT count(*)::int AS n FROM practice_task_templates WHERE config->>'audioUrl' LIKE '/training/audio/%'`);
console.log(`\n库内合计: batch2 题 ${q.rows[0].n} 道 / 转写任务 ${t.rows[0].n} 个`);
await db.end();
