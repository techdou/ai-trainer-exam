/**
 * 初级理论考试题种子：50 单选 + 40 判断 + 10 填空。
 * 来源：人工智能训练师（初级）理论考试题（100分）DOCX
 * 运行：pnpm tsx scripts/db/seed-exam-theory.mts
 * 所有题目同时写入 practice_question_items 和 exam_question_items。
 * 脚本会先清除旧理论题，再导入新题目。
 *
 * 注意：此脚本仅操作开发环境数据库。
 * 生产环境请部署后调用 POST /api/admin/seed-theory（需 super_admin 权限）
 */
import pg from 'pg';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
import { THEORY_QUESTIONS, type TheoryQuestion } from '../../src/server/exam-theory-questions';
loadEnv(); loadEnvLocal();

const questions: TheoryQuestion[] = THEORY_QUESTIONS;

// ─── 执行 ───
const client = new pg.Client({ connectionString: await getDbUrl() });
await client.connect();
try {
  const orgResult = await client.query<{ id: string }>("SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1");
  const organizationId = orgResult.rows[0]?.id;
  if (!organizationId) throw new Error('没有可用机构，请先运行 seed-core.mts');

  // 清除所有旧的理论题
  await client.query('BEGIN');
  const oldSources = ['docx_import', 'manual', 'batch_seed', 'practice_copy', 'exam_theory_v1'];
  const deletedPractice = await client.query(
    `DELETE FROM practice_question_items WHERE source = ANY($1::text[])`,
    [oldSources]
  );
  const deletedExam = await client.query(
    `DELETE FROM exam_question_items WHERE source = ANY($1::text[])`,
    [oldSources]
  );
  console.log(`清除旧题: practice ${deletedPractice.rowCount} 条, exam ${deletedExam.rowCount} 条`);

  let practiceInserted = 0, examInserted = 0, skipped = 0;
  for (const q of questions) {
    const options: Record<string, string> = {};
    let answerKey: unknown;
    if (q.type === 'single_choice') {
      q.options.forEach((text, i) => { options[String.fromCharCode(65 + i)] = text; });
      answerKey = q.answer;
    } else if (q.type === 'true_false') {
      answerKey = q.answer;
    } else {
      answerKey = { acceptable: q.acceptable };
    }
    const contentHash = q.stem.replace(/\s+/g, '').toLowerCase();

    // practice
    const pExisting = await client.query("SELECT 1 FROM practice_question_items WHERE organization_id=$1 AND regexp_replace(lower(stem),'\\s+','','g')=$2 LIMIT 1",
      [organizationId, contentHash]);
    if (pExisting.rowCount) { skipped++; continue; }
    await client.query(
      `INSERT INTO practice_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,legal_review_required,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,NULL,$6,$7,'exam_theory_v1','published',1,true,false,NOW(),NOW())`,
      [organizationId, q.type, q.stem, Object.keys(options).length ? options : {}, JSON.stringify(answerKey), q.kp, q.difficulty],
    );
    practiceInserted++;

    // exam (same content, eligible_for_formal_exam=true)
    await client.query(
      `INSERT INTO exam_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,eligible_for_formal_exam,legal_review_required,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,NULL,$6,$7,'exam_theory_v1','published',1,false,true,false,NOW(),NOW())`,
      [organizationId, q.type, q.stem, Object.keys(options).length ? options : {}, JSON.stringify(answerKey), q.kp, q.difficulty],
    );
    examInserted++;
  }
  await client.query('COMMIT');

  console.log(`\n✅ 导入完成: 练习库 ${practiceInserted} 条, 考试库 ${examInserted} 条, 跳过(重复) ${skipped} 条`);
  console.log(`   总计 ${questions.length} 题 (50 单选 + 40 判断 + 10 填空)`);
} catch (err) {
  console.error('导入失败:', err);
  process.exit(1);
} finally {
  await client.end();
}
