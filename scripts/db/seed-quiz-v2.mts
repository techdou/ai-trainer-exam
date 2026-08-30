/**
 * seed-quiz-v2.mts — 导入 200 道理论题库 v2（讲义 68 + 新设计 132）。
 * 语义: 旧 v1 题全部下架(retired)保留在库;新题全局机构+published。幂等:按 source 判重。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';

loadEnv(); loadEnvLocal();

interface BankItem {
  question_type: 'single_choice' | 'true_false';
  stem: string;
  options: string[];
  answerKey: string;
  explanation: string | null;
  knowledge_point: string;
}

const bank: BankItem[] = JSON.parse(readFileSync(resolve(process.cwd(), 'data/quiz-bank-v2.json'), 'utf8'));
if (bank.length !== 200) throw new Error(`期望 200 题,实际 ${bank.length}`);

const client = new pg.Client({ connectionString: await getDbUrl() });
await client.connect();
try {
  await client.query('BEGIN');

  const dup = await client.query<{ n: string }>(
    `SELECT count(*)::text n FROM practice_question_items WHERE source = 'l5-quiz-v2'`);
  if (Number(dup.rows[0].n) > 0) {
    console.log(`v2 已导入 ${dup.rows[0].n} 题,跳过`);
    await client.query('COMMIT');
  } else {
    // 旧题(v1)全部下架,保留在库可随时恢复(review_status 改回 published)
    const retired = await client.query(
      `UPDATE practice_question_items SET review_status='retired', updated_at=NOW()
        WHERE source <> 'l5-quiz-v2' AND review_status IN ('published','imported_unreviewed')`);
    console.log(`旧题下架: ${retired.rowCount}`);

    let n = 0;
    for (const q of bank) {
      const optionsJson = q.question_type === 'single_choice'
        ? JSON.stringify(Object.fromEntries(q.options.map((t: string, i: number) => [String.fromCharCode(65 + i), t])))
        : '[]';
      const answerJson = q.question_type === 'true_false' ? String(q.answerKey === 'true') : JSON.stringify(q.answerKey);
      await client.query(
        `INSERT INTO practice_question_items
           (id, question_type, stem, options, answer_key, explanation, knowledge_point, difficulty,
            source, source_version, review_status, published_version, practice_only, legal_review_required, organization_id)
         VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,1,'l5-quiz-v2','v1','published',1,true,false,NULL)`,
        [q.question_type, q.stem, optionsJson, answerJson, q.explanation, q.knowledge_point],
      );
      n++;
    }
    console.log(`新题导入: ${n}`);
    await client.query('COMMIT');
  }

  const stat = await client.query(
    `SELECT review_status, count(*) FROM practice_question_items GROUP BY 1 ORDER BY 2 DESC`);
  for (const r of stat.rows) console.log(`  ${r.review_status}: ${r.count}`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  await client.end();
}
