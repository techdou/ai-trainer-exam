/**
 * 从 DOCX 导入理论题到练习库。
 * 用法：pnpm tsx scripts/db/seed-questions.mts /absolute/path/questions.docx
 * 导入结果全部为 imported_unreviewed，不会直接进入正式考试。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import { loadEnvLocal } from './_env.mjs';
import { parseDocx } from '../../src/server/docx-importer';

loadEnv(); loadEnvLocal();
const file = process.argv[2];
if (!file) throw new Error('请提供 DOCX 路径：pnpm tsx scripts/db/seed-questions.mts <questions.docx>');
const buffer = readFileSync(resolve(file));
if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new Error('文件不是有效 DOCX');
const parsed = await parseDocx(buffer);
if (!parsed.questions.length) throw new Error('未解析到题目');

const client = new pg.Client({ connectionString: await getDbUrl() });
await client.connect();
try {
  const orgResult = await client.query<{ id:string }>("SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1");
  const organizationId = orgResult.rows[0]?.id;
  if (!organizationId) throw new Error('没有可用机构，请先运行 seed-core.mts');
  let inserted = 0, skipped = 0;
  await client.query('BEGIN');
  for (const question of parsed.questions) {
    const options: Record<string,string> = {};
    question.options.forEach((text,index)=>{ if(text?.trim()) options[String.fromCharCode(65+index)] = text.trim(); });
    const answer = question.questionType === 'true_false'
      ? ['A','TRUE','正确','对'].includes(String(question.answerKey).trim().toUpperCase())
      : String(question.answerKey).trim().toUpperCase();
    const existing = await client.query('SELECT 1 FROM practice_question_items WHERE organization_id=$1 AND regexp_replace(lower(stem),\'\\s+\',\'\',\'g\')=regexp_replace(lower($2),\'\\s+\',\'\',\'g\') LIMIT 1',[organizationId,question.stem]);
    if (existing.rowCount) { skipped++; continue; }
    await client.query(`INSERT INTO practice_question_items
      (organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,legal_review_required,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,NULL,NULL,1,$6,'imported_unreviewed',0,true,$7,NOW(),NOW())`,[
      organizationId,question.questionType,question.stem,options,JSON.stringify(answer),resolve(file),
      /劳动法|劳动合同法|网络安全法|数据安全法|个人信息保护法|反不正当竞争法/.test(question.stem),
    ]);
    inserted++;
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ parsed:parsed.questions.length,inserted,skipped,issues:parsed.issues.length },null,2));
} catch (error) {
  await client.query('ROLLBACK'); throw error;
} finally { await client.end(); }
