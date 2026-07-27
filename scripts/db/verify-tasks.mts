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
    case 'fill_in_blank': {
      // 填空题满分提交: 每空填入第一个 acceptable 答案
      const blanks: Record<string, string> = {};
      for (const [k, arr] of Object.entries(answer.acceptable as Record<string, string[]>)) {
        if (Array.isArray(arr) && arr.length) blanks[k] = arr[0];
      }
      return { blanks };
    }
    case 'prompt_description': {
      // 提示词描述题: 把所有 keyword 拼进一段文本即可命中
      const kws = (answer.keywords as string[]) ?? [];
      return { text: kws.join(' ') };
    }
    case 'excel_comprehensive': {
      // Excel 综合题满分: 套用全部 answer_key 期望值, 并把每行的"班级列"按 formulaResults 填上期望值
      // (评分器读 submission.rows[i].cells[classColumnIndex], 不是直接读 formulaResults)
      const classCol = (answer.classColumnIndex as number) ?? -1;
      const formulaResults = (answer.formulaResults as Record<string, string>) ?? {};
      const sortedRowOrder = (answer.sortedRowOrder as string[]) ?? [];
      const rows = sortedRowOrder.length
        ? sortedRowOrder.map(rowId => ({ id: rowId, cells: classCol >= 0 ? buildRowCells(rowId, classCol, formulaResults[rowId] ?? '') : [] }))
        : Object.entries(formulaResults).map(([rowId, val]) => ({ id: rowId, cells: classCol >= 0 ? buildRowCells(rowId, classCol, val) : [] }));
      const sub: Record<string, unknown> = {
        borderApplied: answer.borderRequired ?? true,
        headerColor: answer.headerColor ?? '',
        decimalPlaces: answer.decimalPlaces ?? 0,
        rows,
        rowOrder: sortedRowOrder,
      };
      if (Array.isArray(answer.summaryAverages)) sub.summaryGroups = answer.summaryAverages;
      return sub;
    }
    default: return null;
  }
}

/** 构造一行 cells: 在 classCol 位置填入 classVal, 其余位置留空字符串。 */
function buildRowCells(rowId: string, classCol: number, classVal: string): string[] {
  // 题目列数较多(11 列), 这里只填到 classCol+1, 评分器只读 classCol 列
  const cells: string[] = new Array(classCol + 1).fill('');
  cells[classCol] = classVal;
  return cells;
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
