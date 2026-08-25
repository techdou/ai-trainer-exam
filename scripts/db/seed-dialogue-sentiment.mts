/**
 * 对话情绪判读题种子: dialogue_sentiment 题型(带对话素材的单选题,复用 single_choice 判分)。
 * 运行: pnpm tsx scripts/db/seed-dialogue-sentiment.mts
 * 数据与 /api/admin/seed-dialogue-questions 共用同一来源(从 route 导入),双写 practice+exam。
 */
import pg from 'pg';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
import { DIALOGUE_QUESTIONS } from '../../src/app/api/admin/seed-dialogue-questions/route';
loadEnv(); loadEnvLocal();

const url = await getDbUrl();
const client = new pg.Client({ connectionString: url });
await client.connect();

const org = await client.query<{ id: string }>("SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1");
if (!org.rows.length) throw new Error('没有可用机构，请先初始化系统');
const organizationId = org.rows[0].id;

let practiceInserted = 0, examInserted = 0, skipped = 0;
try {
  await client.query('BEGIN');
  for (const q of DIALOGUE_QUESTIONS) {
    const options = { dialogue: q.dialogue, target: q.target, ...q.options };
    const answerKey = JSON.stringify({ letter: q.answer });
    const contentHash = q.stem.replace(/\s+/g, '').toLowerCase();
    const existing = await client.query(
      `SELECT 1 FROM practice_question_items WHERE organization_id=$1 AND regexp_replace(lower(stem),'\\s+','','g')=$2 LIMIT 1`,
      [organizationId, contentHash],
    );
    if (existing.rowCount) { skipped++; continue; }
    await client.query(
      `INSERT INTO practice_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,legal_review_required,created_at,updated_at)
       VALUES($1,'dialogue_sentiment',$2,$3,$4,$5,$6,$7,'dialogue_seed','published',1,true,false,NOW(),NOW())`,
      [organizationId, q.stem, options, answerKey, q.explanation, q.kp, q.difficulty],
    );
    practiceInserted++;
    await client.query(
      `INSERT INTO exam_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,eligible_for_formal_exam,legal_review_required,created_at,updated_at)
       VALUES($1,'dialogue_sentiment',$2,$3,$4,$5,$6,$7,'dialogue_seed','published',1,false,true,false,NOW(),NOW())`,
      [organizationId, q.stem, options, answerKey, q.explanation, q.kp, q.difficulty],
    );
    examInserted++;
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
}

console.log(`total=${DIALOGUE_QUESTIONS.length} practice=${practiceInserted} exam=${examInserted} skipped=${skipped}`);
await client.end();
