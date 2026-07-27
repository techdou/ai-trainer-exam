/**
 * 试卷组卷共享逻辑 — 供手动组卷(papers/route.ts)和一键智能组卷(auto-compose)复用。
 *
 * 核心职责:
 * - loadSourceItem: 从考试库加载单道题目/实操任务, 冻结快照
 * - allocateScores: 精确均分总分, 保证分值不丢失
 * - autoSelectQuestionIds / autoSelectTaskIds: 随机抽取已发布题目
 * - createPaper: 在事务中创建试卷 + 写入快照条目
 */
import { dbOne, dbQuery, dbTx } from './db';
import { graderIdForTaskType, gradeByType, parseFillInBlankAnswerKey, parsePromptDescriptionAnswerKey } from './grading';

// ============================================================
// 类型
// ============================================================

export interface PaperItemRequest {
  itemType: 'question' | 'task';
  itemId: string;
  score?: number;
  section?: string;
}

export interface SourceItem {
  id: string;
  itemType: 'question' | 'task';
  itemId: string;
  section: string;
  score?: number;
  snapshot: Record<string, unknown>;
  answerKey: unknown;
  gradingConfig: unknown;
  graderId: string;
  graderVersion: string;
  assetChecksum?: string | null;
}

export interface CreatePaperParams {
  organizationId: string;
  title: string;
  paperKind: string;
  totalScore: number;
  passScore: number;
  durationMinutes: number;
  sources: SourceItem[];
}

// ============================================================
// 辅助函数
// ============================================================

export function unwrapJsonScalar(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return text;
  try { return JSON.parse(text); } catch { return text; }
}

export function sectionForTask(taskType: string): string {
  if (['excel_delete_rows', 'file_classify', 'image_clean', 'dataset_quality'].includes(taskType)) return 'cleaning';
  if (['image_annotation', 'bounding_box', 'point_annotation', 'polyline_annotation', 'polygon_annotation'].includes(taskType)) return 'image_annotation';
  if (['text_sentiment', 'data_labeling'].includes(taskType)) return 'text_annotation';
  if (taskType === 'audio_transcription') return 'audio';
  if (taskType === 'stats_table') return 'statistics';
  return 'cleaning';
}

// ============================================================
// 加载题目快照
// ============================================================

export async function loadSourceItem(item: PaperItemRequest, organizationId: string): Promise<SourceItem | null> {
  if (item.itemType === 'question') {
    const row = await dbOne<{ id: string; question_type: string; stem: string; options: Record<string, string>; answer_key: unknown; explanation: string | null; knowledge_point: string | null; difficulty: number; published_version: number | null }>(
      `SELECT id, question_type, stem, options, answer_key, explanation, knowledge_point, difficulty, published_version
         FROM exam_question_items
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          AND review_status = 'published' AND eligible_for_formal_exam = true AND practice_only = false`,
      item.itemId, organizationId,
    );
    if (!row) return null;
    const graderId = row.question_type === 'true_false' ? 'true_false' : row.question_type === 'fill_in_blank' ? 'fill_in_blank' : row.question_type === 'prompt_description' ? 'prompt_description' : 'single_choice';
    const rawAnswer = unwrapJsonScalar(row.answer_key);
    const answerKey = row.question_type === 'true_false'
      ? { correctAnswer: typeof rawAnswer === 'boolean' ? rawAnswer : ['A','TRUE','正确','对'].includes(String(rawAnswer).trim().toUpperCase()) }
      : row.question_type === 'fill_in_blank'
        ? { acceptable: parseFillInBlankAnswerKey(rawAnswer) ?? [] }
        : row.question_type === 'prompt_description'
          ? (parsePromptDescriptionAnswerKey(rawAnswer) ?? { keywords: [] })
          : { correctOption: String((rawAnswer as { letter?: unknown } | null)?.letter ?? rawAnswer ?? '').trim().toUpperCase() };
    const probe = gradeByType(graderId, row.question_type === 'true_false' ? { answer: false } : row.question_type === 'fill_in_blank' ? { text: '' } : row.question_type === 'prompt_description' ? { text: '' } : { selectedOption: 'A' }, answerKey);
    return { id: row.id, itemType: 'question', itemId: row.id, section: 'theory', score: item.score, snapshot: { sourceItemId: row.id, questionType: row.question_type, stem: row.stem, options: row.options, explanation: row.explanation, knowledgePoint: row.knowledge_point, difficulty: row.difficulty, sourceVersion: row.published_version }, answerKey, gradingConfig: {}, graderId, graderVersion: probe.graderVersion };
  }

  const row = await dbOne<{ id: string; task_type: string; title: string; instructions: string | null; difficulty: number; config: Record<string, unknown>; answer_key: unknown; grading_config: unknown; published_version: number | null }>(
    `SELECT id, task_type, title, instructions, difficulty, config, answer_key, grading_config, published_version
       FROM exam_task_templates
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        AND review_status = 'published' AND eligible_for_formal_exam = true AND practice_only = false`,
    item.itemId, organizationId,
  );
  if (!row) return null;
  const graderId = graderIdForTaskType(row.task_type);
  if (!graderId) return null;
  const probe = gradeByType(graderId, {}, row.answer_key);
  return { id: row.id, itemType: 'task', itemId: row.id, section: item.section ?? sectionForTask(row.task_type), score: item.score, snapshot: { sourceItemId: row.id, taskType: row.task_type, title: row.title, instructions: row.instructions, difficulty: row.difficulty, config: row.config, sourceVersion: row.published_version }, answerKey: row.answer_key, gradingConfig: row.grading_config, graderId, graderVersion: probe.graderVersion, assetChecksum: typeof row.config?.assetChecksum === 'string' ? row.config.assetChecksum : null };
}

// ============================================================
// 分值分配
// ============================================================

export function allocateScores(items: SourceItem[], totalScore: number): number[] {
  const explicit = items.every(item => typeof item.score === 'number');
  if (explicit) {
    const values = items.map(item => Number(item.score));
    const sum = values.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - totalScore) > 0.01) throw new Error(`题目分值合计 ${sum} 与试卷总分 ${totalScore} 不一致`);
    return values;
  }
  const cents = Math.round(totalScore * 100);
  const base = Math.floor(cents / items.length);
  let remainder = cents - base * items.length;
  return items.map(() => (base + (remainder-- > 0 ? 1 : 0)) / 100);
}

// ============================================================
// 创建试卷(事务)
// ============================================================

export async function createPaper(params: CreatePaperParams): Promise<{ id: string; itemCount: number }> {
  const scores = params.sources.length ? allocateScores(params.sources, params.totalScore) : [];
  const paperId = await dbTx(async client => {
    const paper = await client.query<{ id: string }>(
      `INSERT INTO exam_papers (organization_id, title, paper_kind, total_score, pass_score, duration_minutes, status, version, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'draft',1,NOW(),NOW()) RETURNING id`,
      [params.organizationId, params.title, params.paperKind, params.totalScore, params.passScore, params.durationMinutes],
    );
    const id = paper.rows[0].id;
    for (let index = 0; index < params.sources.length; index++) {
      const source = params.sources[index];
      await client.query(
        `INSERT INTO exam_paper_items
          (paper_id,item_type,item_id,sort_order,score,section,item_snapshot,answer_key_snapshot,grading_config_snapshot,grader_id,grader_version,asset_checksum,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
        [id, source.itemType, source.itemId, index + 1, scores[index], source.section, source.snapshot, source.answerKey, source.gradingConfig ?? {}, source.graderId, source.graderVersion, source.assetChecksum ?? null],
      );
    }
    return id;
  });
  return { id: paperId, itemCount: params.sources.length };
}

// ============================================================
// 智能随机选题
// ============================================================

/**
 * 从考试题库随机抽取指定题型的 N 道理论题 ID。
 * 仅从 review_status='published' 且 eligible_for_formal_exam=true 的题目中抽取。
 * 返回的 ID 列表保证唯一(数据库层面 DISTINCT + ORDER BY RANDOM())。
 */
export async function autoSelectQuestionIds(organizationId: string, questionType: string, count: number): Promise<string[]> {
  const rows = await dbQuery<{ id: string }>(
    `SELECT id FROM exam_question_items
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND review_status = 'published' AND eligible_for_formal_exam = true AND practice_only = false
        AND question_type = $2
      ORDER BY RANDOM()
      LIMIT $3`,
    organizationId, questionType, count,
  );
  return rows.map(r => r.id);
}

/**
 * 统计考试库中指定题型的可用题目数量(用于前端预览)。
 */
export async function countAvailableQuestions(organizationId: string, questionType: string): Promise<number> {
  const row = await dbOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM exam_question_items
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND review_status = 'published' AND eligible_for_formal_exam = true AND practice_only = false
        AND question_type = $2`,
    organizationId, questionType,
  );
  return row ? Number(row.count) : 0;
}

/**
 * 从考试实操库随机抽取指定类型的 N 道实操任务 ID。
 */
export async function autoSelectTaskIds(organizationId: string, taskType: string, count: number): Promise<string[]> {
  const rows = await dbQuery<{ id: string }>(
    `SELECT id FROM exam_task_templates
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND review_status = 'published' AND eligible_for_formal_exam = true AND practice_only = false
        AND task_type = $2
      ORDER BY RANDOM()
      LIMIT $3`,
    organizationId, taskType, count,
  );
  return rows.map(r => r.id);
}

/**
 * 统计考试库中指定实操类型的可用任务数量(用于前端预览)。
 */
export async function countAvailableTasks(organizationId: string, taskType: string): Promise<number> {
  const row = await dbOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM exam_task_templates
      WHERE organization_id = $1 AND deleted_at IS NULL
        AND review_status = 'published' AND eligible_for_formal_exam = true AND practice_only = false
        AND task_type = $2`,
    organizationId, taskType,
  );
  return row ? Number(row.count) : 0;
}
