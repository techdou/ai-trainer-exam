/**
 * 题库种子与评分器契约一致性实测 — 直接对库里的每道实操题:
 * 1. 用 answer_key 构造"满分提交", gradeTaskByType 必须判 correct/score=1
 *    (答案和评分器契约不一致时, 学员永远拿不到满分, 这是最隐蔽的题库 bug)
 * 2. 提交空内容, 不得被判对(防"空卷满分")
 *
 * 用法: pnpm tsx scripts/db/verify-tasks.mts
 */
import { loadEnv } from 'coze-coding-dev-sdk';
import { readFileSync } from 'node:fs';

loadEnv();
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { gradeTaskByType } = await import('../../src/server/grading/index');
const pg = (await import('pg')).default;
const db = new pg.Client({ connectionString: process.env.PGDATABASE_URL });
await db.connect();

let passed = 0;
let failed = 0;
const failures: string[] = [];

/** 按题型从 answer_key 构造满分提交(与 UI 组件产出的 submission 结构一致) */
function perfectSubmission(taskType: string, answer: Record<string, unknown>): unknown {
  switch (taskType) {
    case 'excel_delete_rows': return { retainedRowIds: answer.correctRetainedRowIds ?? answer.correctRetainedRowIndexes };
    case 'stats_table': return { cells: answer.correctCells };
    case 'file_classify': return { classifications: answer.correctClassifications };
    case 'image_clean': return { decisions: answer.correctDecisions };
    case 'image_annotation': case 'bounding_box': return { boxes: answer.boxes };
    case 'point_annotation': return { points: answer.points };
    case 'polyline_annotation': return { lines: answer.lines };
    case 'polygon_annotation': return { polygons: answer.polygons };
    case 'text_sentiment': return { sentiments: answer.correctSentiments };
    case 'audio_transcription': return { transcript: answer.correctTranscript };
    case 'data_labeling': return { labels: answer.correctLabels };
    case 'dataset_quality': return { flaggedItems: answer.correctFlaggedItems };
    case 'composite_task': {
      const sub: Record<string, unknown> = {};
      for (const [id, cfg] of Object.entries(answer.subtasks as Record<string, { graderId: string; answerKey: Record<string, unknown> }>)) {
        sub[id] = perfectSubmission(cfg.graderId, cfg.answerKey);
      }
      return { subtasks: sub };
    }
    default: return null;
  }
}

for (const bank of ['practice_task_templates', 'exam_task_templates'] as const) {
  const rows = (await db.query<{ id: string; task_type: string; title: string; answer_key: Record<string, unknown> }>(
    `SELECT id, task_type, title, answer_key FROM ${bank} WHERE deleted_at IS NULL ORDER BY task_type`)).rows;
  console.log(`\n===== ${bank}(${rows.length} 题)=====`);
  for (const row of rows) {
    const tag = `${row.task_type.padEnd(20)} ${row.title}`;
    const perfect = perfectSubmission(row.task_type, row.answer_key);
    if (perfect === null) {
      failed++; failures.push(`${tag}: 未支持的题型 ${row.task_type}`);
      console.log(`FAIL ${tag}: 未支持的题型`);
      continue;
    }
    const full = gradeTaskByType(row.task_type, perfect, row.answer_key);
    if (!full.correct || full.score !== 1) {
      failed++; failures.push(`${tag}: 满分提交被判 score=${full.score} feedback=${full.feedback}`);
      console.log(`FAIL ${tag}: 满分提交得 ${full.score} 分(${full.feedback})`);
      continue;
    }
    const empty = gradeTaskByType(row.task_type, {}, row.answer_key);
    if (empty.correct || empty.score >= 1) {
      failed++; failures.push(`${tag}: 空提交竟被判对 score=${empty.score}`);
      console.log(`FAIL ${tag}: 空提交得 ${empty.score} 分`);
      continue;
    }
    passed++;
    console.log(`OK   ${tag}`);
  }
}

await db.end();
console.log(`\n===== 题库契约实测: ${passed} 通过 / ${failed} 失败 =====`);
if (failures.length) {
  failures.forEach(f => console.log(` - ${f}`));
  process.exit(1);
}
