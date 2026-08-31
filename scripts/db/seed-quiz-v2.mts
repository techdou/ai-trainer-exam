/**
 * seed-quiz-v2.mts — 导入 200 道理论题库 v2（讲义 68 + 新设计 132）。
 * 语义: 旧 v1 题全部下架(retired)保留在库;新题全局机构。
 * 幂等: 按 source 判重;--force 先清理本 source 存量再重导。
 * 2026-08-31 修复:
 *   1) 路径 data/ → seed-data/(原路径 ENOENT,无法复现);
 *   2) 导入前全量质检(单选 >=2 选项且 answerKey 在范围内;判断 answerKey 可归一),
 *      不合格打印明细并整体回滚——杜绝 0 选项/答案越界脏题入库(本次事故根因之一);
 *   3) 遵循 QUESTION_BANK_GUIDE:默认 imported_unreviewed,需显式 --publish 才直接发布;
 *   4) --force 支持清掉旧 v2 存量后重导(修复脏数据用)。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';

loadEnv(); loadEnvLocal();

const FORCE = process.argv.includes('--force');
const PUBLISH = process.argv.includes('--publish');

interface BankItem {
  question_type: 'single_choice' | 'true_false';
  stem: string;
  options: string[];
  answerKey: string;
  explanation: string | null;
  knowledge_point: string;
}

const bank: BankItem[] = JSON.parse(readFileSync(resolve(process.cwd(), 'seed-data/quiz-bank-v2.json'), 'utf8'));

// ---- 质检:不合格整体拒绝 ----
const invalid: string[] = [];
bank.forEach((q, i) => {
  const where = `第 ${i + 1} 题「${(q.stem || '').slice(0, 24)}…」`;
  if (q.question_type === 'single_choice') {
    const nValid = (q.options ?? []).filter((t) => (t ?? '').trim().length > 0).length;
    const a = typeof q.answerKey === 'string' ? q.answerKey.trim().toUpperCase() : '';
    const code = a.charCodeAt(0);
    if (nValid < 2 || a.length !== 1 || code < 65 || code - 65 >= nValid) {
      invalid.push(`${where}单选异常(有效选项 ${nValid}/答案 ${JSON.stringify(q.answerKey)})`);
    }
  } else if (q.question_type === 'true_false') {
    if (!q.answerKey?.toString().trim()) invalid.push(`${where}判断题答案为空`);
  } else {
    invalid.push(`${where}未知题型 ${q.question_type}`);
  }
});
if (invalid.length) {
  console.error(`质检未通过 ${invalid.length} 条,已拒绝导入(可修复 seed-data/quiz-bank-v2.json 后重跑):`);
  for (const line of invalid) console.error('  ' + line);
  process.exit(1);
}
console.log(`质检通过: ${bank.length} 题`);

const client = new pg.Client({ connectionString: await getDbUrl() });
await client.connect();
try {
  await client.query('BEGIN');

  if (FORCE) {
    const del = await client.query(`DELETE FROM practice_question_items WHERE source = 'l5-quiz-v2'`);
    console.log(`--force: 已清理 v2 存量 ${del.rowCount} 题`);
  }

  const dup = await client.query<{ n: string }>(
    `SELECT count(*)::text n FROM practice_question_items WHERE source = 'l5-quiz-v2'`);
  if (Number(dup.rows[0].n) > 0) {
    console.log(`v2 已导入 ${dup.rows[0].n} 题,跳过(重导请加 --force)`);
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
         VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,1,'l5-quiz-v2','v2',$7,${PUBLISH ? '1' : '0'},true,false,NULL)`,
        [q.question_type, q.stem, optionsJson, answerJson, q.explanation, q.knowledge_point,
         PUBLISH ? 'published' : 'imported_unreviewed'],
      );
      n++;
    }
    console.log(`新题导入: ${n} → ${PUBLISH ? 'published(显式 --publish)' : 'imported_unreviewed(需审核后发布)'}`);
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
