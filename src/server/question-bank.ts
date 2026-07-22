/**
 * 题库服务层 — 练习库与考试库严格分离
 * 所有函数均在服务端调用，使用 service-role 客户端。
 *
 * 架构约定：
 * - 读操作使用 `question_items` VIEW（UNION ALL 两个表，带 bank_type 列）
 * - 写操作（INSERT/UPDATE/DELETE）直接路由到 `practice_question_items` 或 `exam_question_items`
 * - 通过 `findQuestionBankType(id)` 确定题目所属表
 */
import { dbQuery, dbOne, dbExec } from './db';
import type { Role } from '@/lib/constants';

// ============================================================
// 类型定义
// ============================================================

export interface QuestionRow {
  id: string;
  bank_type: 'practice' | 'exam';
  organization_id: string | null;
  question_type: 'single_choice' | 'true_false';
  stem: string;
  options: Record<string, string> | null;  // JSONB → JS object
  answer_key: string;                      // JSONB → string (single_choice) or boolean (true_false)
  explanation: string | null;
  knowledge_point: string | null;
  difficulty: number;
  source: string | null;
  source_version: string | null;
  review_status: string;
  reviewer_id: string | null;
  published_version: number;
  practice_only: boolean;
  legal_review_required: boolean;
  eligible_for_formal_exam: boolean;
  created_by: string | null;
  import_job_id: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface QuestionSearchParams {
  bankType?: 'practice' | 'exam';
  questionType?: string;
  reviewStatus?: string;
  knowledgePoint?: string;
  keyword?: string;
  difficulty?: number;
  practiceOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface QuestionListResult {
  items: QuestionRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================
// 内部辅助
// ============================================================

function tableNameFor(bankType: string): string {
  return bankType === 'exam' ? 'exam_question_items' : 'practice_question_items';
}

/**
 * 根据 ID 查找题目所属的 bank_type。
 * 优先查练习库，再查考试库。
 */
export async function findQuestionBankType(id: string): Promise<'practice' | 'exam' | null> {
  const p = await dbOne<{ id: string }>(
    'SELECT id FROM practice_question_items WHERE id = $1',
    id,
  );
  if (p) return 'practice';
  const e = await dbOne<{ id: string }>(
    'SELECT id FROM exam_question_items WHERE id = $1',
    id,
  );
  if (e) return 'exam';
  return null;
}

// ============================================================
// 读操作（使用 question_items VIEW）
// ============================================================

/**
 * 分页查询题目（通过 VIEW）
 */
export async function searchQuestions(params: QuestionSearchParams): Promise<QuestionListResult> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const args: unknown[] = [];
  let argIdx = 1;

  if (params.bankType) {
    conditions.push(`bank_type = $${argIdx++}`);
    args.push(params.bankType);
  }
  if (params.questionType) {
    conditions.push(`question_type = $${argIdx++}`);
    args.push(params.questionType);
  }
  if (params.reviewStatus) {
    conditions.push(`review_status = $${argIdx++}`);
    args.push(params.reviewStatus);
  }
  if (params.knowledgePoint) {
    conditions.push(`knowledge_point = $${argIdx++}`);
    args.push(params.knowledgePoint);
  }
  if (params.difficulty !== undefined) {
    conditions.push(`difficulty = $${argIdx++}`);
    args.push(params.difficulty);
  }
  if (params.practiceOnly !== undefined) {
    conditions.push(`practice_only = $${argIdx++}`);
    args.push(params.practiceOnly);
  }
  if (params.keyword) {
    conditions.push(`(stem ILIKE $${argIdx} OR explanation ILIKE $${argIdx})`);
    args.push(`%${params.keyword}%`);
    argIdx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await dbOne<{ count: string }>(
    `SELECT count(*)::text as count FROM question_items ${where}`,
    ...args,
  );
  const total = parseInt(countRes?.count ?? '0', 10);

  const items = await dbQuery<QuestionRow>(
    `SELECT * FROM question_items ${where} ORDER BY created_at DESC LIMIT $${argIdx++} OFFSET $${argIdx++}`,
    ...args,
    pageSize,
    offset,
  );

  return { items, total, page, pageSize };
}

/**
 * 根据 ID 获取题目（通过 VIEW）
 */
export async function getQuestionById(id: string): Promise<QuestionRow | null> {
  return dbOne<QuestionRow>('SELECT * FROM question_items WHERE id = $1', id);
}

// ============================================================
// 写操作（直接路由到实际表）
// ============================================================

/** bulkInsertQuestions 的输入行类型，仅包含 INSERT 语句实际使用的字段 */
export interface QuestionInsertRow {
  question_type: 'single_choice' | 'true_false';
  stem: string;
  options: string[] | Record<string, string> | null;
  answer_key: string;  // Raw answer: 'A'/'B'/'C'/'D' for single_choice, 'true'/'false' for true_false
  explanation: string | null;
  knowledge_point: string | null;
  difficulty: number;
  source: string | null;
  source_version: string | null;
  practice_only: boolean;
  legal_review_required: boolean;
  organization_id: string | null;
}

export async function bulkInsertQuestions(
  rows: QuestionInsertRow[],
  bankType: string = 'practice',
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  const table = tableNameFor(bankType);
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  for (const row of rows) {
    try {
      // Convert string[] options → {A: text, B: text} for JSONB storage
      let optionsJson: string | null = null;
      if (row.options && Array.isArray(row.options) && row.options.length > 0) {
        const optsMap: Record<string, string> = {};
        for (let i = 0; i < row.options.length && i < OPTION_LETTERS.length; i++) {
          const text = (row.options[i] || '').trim();
          if (text) optsMap[OPTION_LETTERS[i]] = text;
        }
        optionsJson = JSON.stringify(optsMap);
      } else if (row.options && typeof row.options === 'object' && !Array.isArray(row.options)) {
        optionsJson = JSON.stringify(row.options);
      }

      // answer_key: single_choice → JSON string like "C", true_false → JSON boolean
      let answerKeyJson: string;
      if (row.question_type === 'true_false') {
        const val = row.answer_key?.toString().trim().toLowerCase();
        answerKeyJson = JSON.stringify(val === 'true' || val === '正确' || val === '对' || val === 'a');
      } else {
        answerKeyJson = JSON.stringify(row.answer_key);
      }

      await dbExec(
        `INSERT INTO ${table}
          (id, question_type, stem, options, answer_key, explanation,
           knowledge_point, difficulty, source, source_version, review_status,
           published_version, practice_only, legal_review_required,
           organization_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9,
                 'imported_unreviewed', 0, $10, $11, $12)`,
        row.question_type,
        row.stem,
        optionsJson,
        answerKeyJson,
        row.explanation,
        row.knowledge_point,
        row.difficulty,
        row.source,
        row.source_version,
        row.practice_only,
        row.legal_review_required,
        row.organization_id,
      );
      inserted++;
    } catch (err) {
      skipped++;
      errors.push(`题号 ${row.source}: ${(err as Error).message}`);
    }
  }

  return { inserted, skipped, errors };
}

/**
 * 更新题目（自动路由到实际表）
 */
export async function updateQuestion(
  id: string,
  updates: Partial<Pick<QuestionRow,
    'stem' | 'options' | 'answer_key' | 'explanation' |
    'knowledge_point' | 'difficulty' | 'practice_only' |
    'legal_review_required' | 'eligible_for_formal_exam'
  >>,
  actorId: string,
): Promise<QuestionRow | null> {
  const bankType = await findQuestionBankType(id);
  if (!bankType) return null;

  const table = tableNameFor(bankType);
  const fields: string[] = [];
  const args: unknown[] = [];
  let idx = 1;

  if (updates.stem !== undefined) { fields.push(`stem = $${idx++}`); args.push(updates.stem); }
  if (updates.options !== undefined) { fields.push(`options = $${idx++}`); args.push(updates.options); }
  if (updates.answer_key !== undefined) { fields.push(`answer_key = $${idx++}`); args.push(updates.answer_key); }
  if (updates.explanation !== undefined) { fields.push(`explanation = $${idx++}`); args.push(updates.explanation); }
  if (updates.knowledge_point !== undefined) { fields.push(`knowledge_point = $${idx++}`); args.push(updates.knowledge_point); }
  if (updates.difficulty !== undefined) { fields.push(`difficulty = $${idx++}`); args.push(updates.difficulty); }
  if (updates.practice_only !== undefined) { fields.push(`practice_only = $${idx++}`); args.push(updates.practice_only); }
  if (updates.legal_review_required !== undefined) { fields.push(`legal_review_required = $${idx++}`); args.push(updates.legal_review_required); }
  if (updates.eligible_for_formal_exam !== undefined) { fields.push(`eligible_for_formal_exam = $${idx++}`); args.push(updates.eligible_for_formal_exam); }

  if (fields.length === 0) return getQuestionById(id);

  args.push(id);
  await dbExec(
    `UPDATE ${table} SET ${fields.join(', ')} WHERE id = $${idx}`,
    ...args,
  );

  // 审计日志
  await dbExec(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, details)
     VALUES (gen_random_uuid(), $1, 'update_question', $2, $3, $4)`,
    actorId,
    table,
    id,
    JSON.stringify({ fields: Object.keys(updates) }),
  );

  return getQuestionById(id);
}

/**
 * 审核题目：通过、退回或发布（自动路由到实际表）
 */
export async function reviewQuestion(
  id: string,
  action: 'approve' | 'reject' | 'publish' | 'retire',
  reviewerId: string,
  note?: string,
): Promise<QuestionRow | null> {
  const bankType = await findQuestionBankType(id);
  if (!bankType) return null;

  const table = tableNameFor(bankType);
  const statusMap: Record<string, string> = {
    approve: 'reviewed',
    reject: 'needs_revision',
    publish: 'published',
    retire: 'retired',
  };

  const newStatus = statusMap[action];
  const newVersion = action === 'publish' ? 1 : undefined;

  if (newVersion !== undefined) {
    await dbExec(
      `UPDATE ${table}
       SET review_status = $1, reviewer_id = $2, published_version = $3, updated_at = now()
       WHERE id = $4`,
      newStatus,
      reviewerId,
      newVersion,
      id,
    );
  } else {
    await dbExec(
      `UPDATE ${table}
       SET review_status = $1, reviewer_id = $2, updated_at = now()
       WHERE id = $3`,
      newStatus,
      reviewerId,
      id,
    );
  }

  // 审计日志
  await dbExec(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, details)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
    reviewerId,
    `review_${action}`,
    table,
    id,
    JSON.stringify({ note }),
  );

  return getQuestionById(id);
}

/**
 * 获取题库统计（通过 VIEW）
 */
export async function getQuestionBankStats(bankType?: 'practice' | 'exam') {
  const where = bankType ? `WHERE bank_type = $1` : '';
  const args = bankType ? [bankType] : [];

  const byStatus = await dbQuery<{ review_status: string; count: string }>(
    `SELECT review_status, count(*)::text as count FROM question_items ${where} GROUP BY review_status ORDER BY count DESC`,
    ...args,
  );

  const byType = await dbQuery<{ question_type: string; count: string }>(
    `SELECT question_type, count(*)::text as count FROM question_items ${where} GROUP BY question_type`,
    ...args,
  );

  return {
    byStatus: byStatus.map((r) => ({ status: r.review_status, count: parseInt(r.count, 10) })),
    byType: byType.map((r) => ({ type: r.question_type, count: parseInt(r.count, 10) })),
  };
}

/**
 * 从练习库复制为考试库题目（创建全新独立版本）。
 * 绝不共享原记录。直接写入 exam_question_items。
 */
export async function copyToExamBank(
  practiceQuestionId: string,
  reviewerId: string,
): Promise<string | null> {
  const src = await getQuestionById(practiceQuestionId);
  if (!src) return null;

  const row = await dbOne<{ id: string }>(
    `INSERT INTO exam_question_items
      (id, question_type, stem, options, answer_key, explanation,
       knowledge_point, difficulty, source, source_version, review_status,
       published_version, practice_only, legal_review_required,
       eligible_for_formal_exam, organization_id, created_by)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9,
             'imported_unreviewed', 0, false, $10, true, $11, $12)
     RETURNING id`,
    src.question_type,
    src.stem,
    src.options ? JSON.stringify(src.options) : null,
    src.answer_key,
    src.explanation,
    src.knowledge_point,
    src.difficulty,
    `copy_from_practice:${src.id}`,
    '1',
    src.legal_review_required,
    src.organization_id,
    reviewerId,
  );

  if (row) {
    await dbExec(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, details)
       VALUES (gen_random_uuid(), $1, 'copy_to_exam', 'exam_question_items', $2, $3)`,
      reviewerId,
      row.id,
      JSON.stringify({ sourceId: practiceQuestionId }),
    );
  }

  return row?.id ?? null;
}

// ============================================================
// 列表查询
// ============================================================

/**
 * 分页列表查询（简化版，用于管理端表格）
 */
export async function listQuestions(params: {
  bankType?: 'practice' | 'exam';
  questionType?: string | null;
  status?: string | null;
  keyword?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<QuestionListResult> {
  return searchQuestions({
    bankType: params.bankType,
    questionType: params.questionType ?? undefined,
    reviewStatus: params.status ?? undefined,
    keyword: params.keyword ?? undefined,
    page: params.page,
    pageSize: params.pageSize,
  });
}

// ============================================================
// 权限检查
// ============================================================

export function canManageQuestionBank(role: Role | string): boolean {
  return ['super_admin', 'school_admin', 'question_editor', 'question_reviewer'].includes(role);
}

export function canReviewQuestions(role: Role | string): boolean {
  return ['super_admin', 'school_admin', 'question_reviewer'].includes(role as string);
}

// ============================================================
// 删除 / 退役
// ============================================================

/**
 * 软删除题目（标记为 retired）
 */
export async function deleteQuestion(questionId: string): Promise<void> {
  const bankType = await findQuestionBankType(questionId);
  if (!bankType) return;
  await dbExec(
    `UPDATE ${tableNameFor(bankType)} SET review_status = 'retired', updated_at = now() WHERE id = $1`,
    questionId,
  );
}

/**
 * 退役题目
 */
export async function retireQuestion(questionId: string): Promise<void> {
  const bankType = await findQuestionBankType(questionId);
  if (!bankType) return;
  await dbExec(
    `UPDATE ${tableNameFor(bankType)} SET review_status = 'retired', updated_at = now() WHERE id = $1`,
    questionId,
  );
}

// ============================================================
// 学员端
// ============================================================

/**
 * 学员端获取练习题（仅已发布，不返回答案）
 */
export async function listPracticeQuestionsForStudent(opts: { module?: string; limit?: number; offset?: number }): Promise<StudentQuestionRow[]> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;
  return dbQuery<StudentQuestionRow>(
    `SELECT id, question_type, stem, options, difficulty, knowledge_point
     FROM practice_question_items
     WHERE review_status = 'published'
     ORDER BY created_at ASC
     LIMIT $1 OFFSET $2`,
    limit,
    offset,
  );
}

export interface StudentQuestionRow {
  id: string;
  question_type: string;
  stem: string;
  options: Record<string, string>;
  difficulty: string;
  knowledge_point: string | null;
}

/**
 * 获取标准答案（仅服务端调用，不暴露给学员端）
 */
export async function getAnswerKey(questionIds: string[]): Promise<AnswerKeyRow[]> {
  if (questionIds.length === 0) return [];
  const placeholders = questionIds.map((_, i) => `$${i + 1}`).join(', ');
  return dbQuery<AnswerKeyRow>(
    `SELECT id, answer_key, explanation, knowledge_point, stem, question_type
     FROM practice_question_items
     WHERE id IN (${placeholders})`,
    ...questionIds,
  );
}

export interface AnswerKeyRow {
  id: string;
  answer_key: string;
  explanation: string | null;
  knowledge_point: string | null;
  stem: string;
  question_type: string;
}

/**
 * 创建新题目（写入对应题库表）
 */
export async function createQuestion(data: {
  bankType: 'practice' | 'exam';
  questionType: 'single_choice' | 'true_false';
  stem: string;
  options: Record<string, string>;
  answerKey: string;
  explanation?: string;
  knowledgePoint?: string;
  difficulty?: number;
  legalReviewRequired?: boolean;
  createdBy: string;
}): Promise<string> {
  const table = data.bankType === 'exam' ? 'exam_question_items' : 'practice_question_items';
  const row = await dbOne<{ id: string }>(
    `INSERT INTO ${table}
     (id, question_type, stem, options, answer_key, explanation, knowledge_point, difficulty, source, review_status)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'manual', 'draft')
     RETURNING id`,
    data.questionType,
    data.stem,
    JSON.stringify(data.options),
    data.answerKey,
    data.explanation ?? null,
    data.knowledgePoint ?? null,
    data.difficulty ?? 2,
  );
  return row?.id ?? '';
}
