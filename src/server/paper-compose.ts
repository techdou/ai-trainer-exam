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
import { graderIdForTaskType, gradeByType, parseFillInBlankAnswerKey, parsePromptDescriptionAnswerKey, parseTrueFalseAnswerKey } from './grading';

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
    // true_false 推断与 practice/check 路径共用 parseTrueFalseAnswerKey, 脏 answer_key 一致报错而非静默 false。
    if (row.question_type === 'true_false') {
      const correct = parseTrueFalseAnswerKey(rawAnswer);
      if (correct === null) return null;
      const answerKey = { correctAnswer: correct };
      const probe = gradeByType('true_false', { answer: false }, answerKey);
      return { id: row.id, itemType: 'question', itemId: row.id, section: 'theory', score: item.score, snapshot: { sourceItemId: row.id, questionType: row.question_type, stem: row.stem, options: row.options, explanation: row.explanation, knowledgePoint: row.knowledge_point, difficulty: row.difficulty, sourceVersion: row.published_version }, answerKey, gradingConfig: {}, graderId, graderVersion: probe.graderVersion };
    }
    const answerKey = row.question_type === 'fill_in_blank'
        ? { acceptable: parseFillInBlankAnswerKey(rawAnswer) ?? [] }
        : row.question_type === 'prompt_description'
          ? (parsePromptDescriptionAnswerKey(rawAnswer) ?? { keywords: [] })
          : { correctOption: String((rawAnswer as { letter?: unknown } | null)?.letter ?? rawAnswer ?? '').trim().toUpperCase() };
    const probe = gradeByType(graderId, row.question_type === 'fill_in_blank' ? { text: '' } : row.question_type === 'prompt_description' ? { text: '' } : { selectedOption: 'A' }, answerKey);
    // probe 判 invalid 说明 answer_key 配置缺陷,静默入卷会导致考试时该题全员 0 分,必须拒入。
    if (probe.details?.invalid === true) return null;
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
  // answer_key 配置缺陷的任务同样拒入,避免考试时该题全员 0 分。
  if (probe.details?.invalid === true) return null;
  return { id: row.id, itemType: 'task', itemId: row.id, section: item.section ?? sectionForTask(row.task_type), score: item.score, snapshot: { sourceItemId: row.id, taskType: row.task_type, title: row.title, instructions: row.instructions, difficulty: row.difficulty, config: row.config, sourceVersion: row.published_version }, answerKey: row.answer_key, gradingConfig: row.grading_config, graderId, graderVersion: probe.graderVersion, assetChecksum: typeof row.config?.assetChecksum === 'string' ? row.config.assetChecksum : null };
}

/** loadSourceItem 拒绝时取人类可读标识(题干前 30 字/任务标题),供报错替代裸 UUID。 */
export async function describeSourceItem(item: { itemType: string; itemId: string }, organizationId: string): Promise<string | null> {
  if (item.itemType === 'question') {
    const row = await dbOne<{ stem: string }>(
      'SELECT stem FROM exam_question_items WHERE id=$1 AND organization_id=$2',
      item.itemId, organizationId,
    );
    return row?.stem ? row.stem.replace(/\s+/g, ' ').slice(0, 30) : null;
  }
  const row = await dbOne<{ title: string }>(
    'SELECT title FROM exam_task_templates WHERE id=$1 AND organization_id=$2',
    item.itemId, organizationId,
  );
  return row?.title ?? null;
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

// ============================================================
// 一键组卷: 批量抽取+构造快照+事务入库(无窗口期)
// ============================================================

/**
 * 单次组卷请求里的题型/任务类型选择。
 * 一次查询完成"按类型抽 N 道 + 加载快照字段", 避免逐条 loadSourceItem 的串行往返
 * 与"RANDOM() 抽中后题被改/下架"的窗口期(因为 WHERE 一次性包含 eligible=true)。
 */
export interface AutoComposeSelection {
  kind: 'question' | 'task';
  type: string;
  count: number;
}

/**
 * 批量抽取并构造快照。失败(题库不足/某道题无法构造快照)时返回 error 字符串。
 */
export async function loadAutoComposeSources(
  organizationId: string,
  selections: AutoComposeSelection[],
): Promise<{ sources: SourceItem[]; error?: { message: string; label?: string } }> {
  const sources: SourceItem[] = [];

  for (const sel of selections) {
    if (sel.kind === 'question') {
      // 一次查询: WHERE 含全部入库校验, ORDER BY RANDOM() 抽 N 道, 直接返回构造快照所需的全部字段
      const rows = await dbQuery<{ id: string; question_type: string; stem: string; options: Record<string, string>; answer_key: unknown; explanation: string | null; knowledge_point: string | null; difficulty: number; published_version: number | null }>(
        `SELECT id, question_type, stem, options, answer_key, explanation, knowledge_point, difficulty, published_version
           FROM exam_question_items
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND review_status = 'published' AND eligible_for_formal_exam = true AND practice_only = false
            AND question_type = $2
          ORDER BY RANDOM()
          LIMIT $3`,
        organizationId, sel.type, sel.count,
      );
      if (rows.length < sel.count) {
        return { sources, error: { message: `${QUESTION_TYPE_LABELS[sel.type] ?? sel.type}题库只有 ${rows.length} 道可用题目, 不足 ${sel.count} 道`, label: sel.type } };
      }
      for (const row of rows) {
        const built = buildQuestionSource(row);
        if (!built) return { sources, error: { message: `题目 ${row.id} 的答案键配置异常, 无法用于组卷` } };
        sources.push(built);
      }
    } else {
      const rows = await dbQuery<{ id: string; task_type: string; title: string; instructions: string | null; difficulty: number; config: Record<string, unknown>; answer_key: unknown; grading_config: unknown; published_version: number | null }>(
        `SELECT id, task_type, title, instructions, difficulty, config, answer_key, grading_config, published_version
           FROM exam_task_templates
          WHERE organization_id = $1 AND deleted_at IS NULL
            AND review_status = 'published' AND eligible_for_formal_exam = true AND practice_only = false
            AND task_type = $2
          ORDER BY RANDOM()
          LIMIT $3`,
        organizationId, sel.type, sel.count,
      );
      if (rows.length < sel.count) {
        return { sources, error: { message: `实操类型「${TASK_TYPE_LABELS[sel.type] ?? sel.type}」只有 ${rows.length} 道可用任务, 不足 ${sel.count} 道`, label: sel.type } };
      }
      for (const row of rows) {
        const built = buildTaskSource(row);
        if (!built) return { sources, error: { message: `实操任务 ${row.id} 缺评分器或答案键异常` } };
        sources.push(built);
      }
    }
  }

  return { sources };
}

/** 题型中文标签(供错误消息)。 */
export const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: '单选题',
  true_false: '判断题',
  fill_in_blank: '填空题',
  prompt_description: '提示词描述',
  dialogue_sentiment: '对话情绪判读',
};

/** 实操类型中文标签(供错误消息)。 */
export const TASK_TYPE_LABELS: Record<string, string> = {
  excel_delete_rows: 'Excel 删行',
  stats_table: '统计填表',
  file_classify: '文件分类',
  image_clean: '图片数据清洗',
  image_annotation: '矩形框标注',
  bounding_box: '矩形框标注',
  point_annotation: '点标注',
  polyline_annotation: '折线标注',
  polygon_annotation: '多边形标注',
  text_sentiment: '情感标注',
  data_labeling: '通用数据标注',
  audio_transcription: '音频转写',
  dataset_quality: '数据集质量体检',
  composite_task: '综合任务',
  excel_comprehensive: 'Excel 综合操作',
  fill_in_blank: '填空题',
  prompt_description: '提示词描述',
};

/** 已知实操类型集合(供 zod enum 与前端预览共用, 单一来源)。 */
export const KNOWN_TASK_TYPES = Object.freeze([
  'excel_delete_rows', 'stats_table', 'file_classify', 'image_clean',
  'image_annotation', 'bounding_box', 'point_annotation', 'polyline_annotation', 'polygon_annotation',
  'text_sentiment', 'data_labeling', 'audio_transcription', 'dataset_quality',
  'composite_task', 'excel_comprehensive',
]);

/** 已知理论题型集合。 */
export const KNOWN_QUESTION_TYPES = Object.freeze([
  'single_choice', 'true_false', 'fill_in_blank', 'prompt_description', 'dialogue_sentiment',
]);

/** 从一行考试题库数据构造 SourceItem(理论题)。返回 null 表示答案键配置异常。 */
function buildQuestionSource(row: { id: string; question_type: string; stem: string; options: Record<string, string>; answer_key: unknown; explanation: string | null; knowledge_point: string | null; difficulty: number; published_version: number | null }): SourceItem | null {
  const graderId = row.question_type === 'true_false' ? 'true_false'
    : row.question_type === 'fill_in_blank' ? 'fill_in_blank'
    : row.question_type === 'prompt_description' ? 'prompt_description'
    : 'single_choice';
  const rawAnswer = unwrapJsonScalar(row.answer_key);
  let answerKey: unknown;
  if (row.question_type === 'true_false') {
    const correct = parseTrueFalseAnswerKey(rawAnswer);
    if (correct === null) return null;
    answerKey = { correctAnswer: correct };
  } else if (row.question_type === 'fill_in_blank') {
    answerKey = { acceptable: parseFillInBlankAnswerKey(rawAnswer) ?? [] };
  } else if (row.question_type === 'prompt_description') {
    answerKey = parsePromptDescriptionAnswerKey(rawAnswer) ?? { keywords: [] };
  } else {
    answerKey = { correctOption: String((rawAnswer as { letter?: unknown } | null)?.letter ?? rawAnswer ?? '').trim().toUpperCase() };
  }
  const probeInput = graderId === 'true_false' ? { answer: false }
    : (graderId === 'fill_in_blank' || graderId === 'prompt_description') ? { text: '' }
    : { selectedOption: 'A' };
  const probe = gradeByType(graderId, probeInput, answerKey);
  // probe 判 invalid 说明 answer_key 配置缺陷(空 acceptable/空 keywords/非字母选项键等),
  // 静默入卷会导致考试时该题全员 0 分,必须拒入。
  if (probe.details?.invalid === true) return null;
  return {
    id: row.id, itemType: 'question', itemId: row.id, section: 'theory',
    snapshot: { sourceItemId: row.id, questionType: row.question_type, stem: row.stem, options: row.options, explanation: row.explanation, knowledgePoint: row.knowledge_point, difficulty: row.difficulty, sourceVersion: row.published_version },
    answerKey, gradingConfig: {}, graderId, graderVersion: probe.graderVersion,
  };
}

/** 从一行考试实操模板数据构造 SourceItem。返回 null 表示无对应评分器。 */
function buildTaskSource(row: { id: string; task_type: string; title: string; instructions: string | null; difficulty: number; config: Record<string, unknown>; answer_key: unknown; grading_config: unknown; published_version: number | null }): SourceItem | null {
  const graderId = graderIdForTaskType(row.task_type);
  if (!graderId) return null;
  const probe = gradeByType(graderId, {}, row.answer_key);
  return {
    id: row.id, itemType: 'task', itemId: row.id, section: sectionForTask(row.task_type),
    snapshot: { sourceItemId: row.id, taskType: row.task_type, title: row.title, instructions: row.instructions, difficulty: row.difficulty, config: row.config, sourceVersion: row.published_version },
    answerKey: row.answer_key, gradingConfig: row.grading_config, graderId, graderVersion: probe.graderVersion,
    assetChecksum: typeof row.config?.assetChecksum === 'string' ? row.config.assetChecksum : null,
  };
}
