/**
 * Seed theory questions from DOCX into practice_question_items table.
 * Usage: npx tsx scripts/db/seed-questions.mts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mammoth from 'mammoth';
const { parseDocx } = await import('/workspace/projects/src/server/docx-importer.ts');
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import pg from 'pg';

loadEnv();

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const COHORT_ID = '00000000-0000-0000-0000-000000000002';

async function main() {
  const docxPath = resolve(import.meta.dirname, '../../data/raw/theory-questions.docx');
  const buffer = readFileSync(docxPath);

  // Parse questions
  const result = await parseDocx(buffer);

  console.log('=== DOCX Import Result ===');
  console.log(`Total parsed: ${result.questions.length}`);
  const qt = (q: { questionType?: string; question_type?: string }) => q.questionType || q.question_type || 'unknown';
  console.log(`Single choice: ${result.questions.filter(q => qt(q) === 'single_choice').length}`);
  console.log(`True/false: ${result.questions.filter(q => qt(q) === 'true_false').length}`);
  const issues = result.issues ?? result.qualityIssues ?? [];
  console.log(`Quality issues: ${issues.length}`);

  // Connect to DB
  const url = await getDbUrl();
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  let inserted = 0;
  let deduped = 0;
  const seenStems = new Set<string>();

  for (const q of result.questions) {
    // Deduplicate by stem normalized
    const stemKey = q.stem.trim().replace(/\s+/g, '').toLowerCase().slice(0, 100);
    if (seenStems.has(stemKey)) {
      deduped++;
      continue;
    }
    seenStems.add(stemKey);

    const qType = (q.questionType || q.question_type) as string;
    const qStem = (q.stem || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
    // Normalize options to {A: text, B: text, ...} object for JSONB
    // q.options is string[] from ParsedQuestion (e.g. ['选项A文本', '选项B文本', ...])
    const rawOpts = q.options ?? [];
    const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
    let optsRecord: Record<string, string>;
    if (Array.isArray(rawOpts)) {
      optsRecord = {};
      for (let i = 0; i < rawOpts.length && i < optionLetters.length; i++) {
        const text = (rawOpts[i] || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
        if (text) optsRecord[optionLetters[i]] = text;
      }
    } else if (typeof rawOpts === 'object' && rawOpts !== null) {
      optsRecord = {};
      for (const [k, v] of Object.entries(rawOpts as Record<string, string>)) {
        optsRecord[k] = (v || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
      }
    } else {
      optsRecord = {};
    }
    const qAnswerRaw = (q.answerKey || q.answer_key || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
    // answer_key is JSONB — store as object for single_choice, boolean for true_false
    const answerKeyJson = qType === 'true_false'
      ? JSON.stringify(qAnswerRaw === 'A' || qAnswerRaw === 'true' || qAnswerRaw === '正确' || qAnswerRaw === '对')
      : JSON.stringify(qAnswerRaw);
    const qKp = (q.knowledgePoint || q.knowledge_point || '综合').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
    const diffMap: Record<string, number> = { easy: 1, low: 1, medium: 2, normal: 2, hard: 3, high: 3 };
    const diffStr = String(q.difficulty || 'medium').trim().toLowerCase();
    const qDiff = diffMap[diffStr] ?? (isNaN(Number(diffStr)) ? 2 : Number(diffStr));

    const questionId = crypto.randomUUID();
    const optionsJson = JSON.stringify(optsRecord);
    const explanation = (q.explanation || `本题考查${qKp}知识点。`).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();

    await client.query(
      `INSERT INTO practice_question_items
       (id, organization_id, question_type, stem, options, answer_key,
        explanation, knowledge_point, difficulty, source, review_status, practice_only, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'docx_import', 'published', false, now(), now())
       ON CONFLICT DO NOTHING`,
      [
        questionId,
        ORG_ID,
        qType,
        qStem,
        optionsJson,
        answerKeyJson,
        explanation,
        qKp,
        qDiff,
      ]
    );
    inserted++;
  }

  console.log(`\nInserted: ${inserted} (deduped: ${deduped})`);

  // Verify count
  const countRes = await client.query(
    `SELECT review_status, count(*) as n FROM practice_question_items WHERE organization_id = $1 GROUP BY review_status`,
    [ORG_ID]
  );
  console.log('DB question counts by status:');
  countRes.rows.forEach((r: { review_status: string; n: string }) =>
    console.log(`  ${r.review_status}: ${r.n}`)
  );

  await client.end();
  console.log('Done.');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
