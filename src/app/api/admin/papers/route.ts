import { z } from 'zod';
import { requireRole, requireSameOrg } from '@/server/auth';
import { dbQuery, dbOne, dbTx } from '@/server/db';
import { ok, fail, handler, parseBody } from '@/lib/api';
import { graderIdForTaskType, gradeByType, parseFillInBlankAnswerKey, parsePromptDescriptionAnswerKey } from '@/server/grading';

const itemSchema = z.object({
  itemType: z.enum(['question', 'task']),
  itemId: z.string().min(1).max(100),
  score: z.number().positive().max(100).optional(),
  section: z.enum(['theory', 'cleaning', 'image_annotation', 'text_annotation', 'audio', 'statistics']).optional(),
});
const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  organizationId: z.string().uuid().optional(),
  paperKind: z.string().max(20).default('formal'),
  durationMinutes: z.number().int().min(5).max(300).default(90),
  totalScore: z.number().positive().max(1000).default(100),
  passScore: z.number().min(0).max(1000).default(60),
  items: z.array(itemSchema).max(300).optional(),
  questionIds: z.array(z.string()).max(300).optional(),
});
const patchSchema = z.object({ paperId: z.string().min(1), action: z.enum(['publish', 'retire']) });

type SourceItem = {
  id: string; itemType: 'question' | 'task'; itemId: string; section: string; score?: number;
  snapshot: Record<string, unknown>; answerKey: unknown; gradingConfig: unknown; graderId: string; graderVersion: string; assetChecksum?: string | null;
};


function unwrapJsonScalar(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return text;
  try { return JSON.parse(text); } catch { return text; }
}

function sectionForTask(taskType: string): string {
  if (['excel_delete_rows', 'file_classify', 'image_clean', 'dataset_quality'].includes(taskType)) return 'cleaning';
  if (['image_annotation', 'bounding_box', 'point_annotation', 'polyline_annotation', 'polygon_annotation'].includes(taskType)) return 'image_annotation';
  if (['text_sentiment', 'data_labeling'].includes(taskType)) return 'text_annotation';
  if (taskType === 'audio_transcription') return 'audio';
  if (taskType === 'stats_table') return 'statistics';
  return 'cleaning';
}

async function loadSourceItem(item: z.infer<typeof itemSchema>, organizationId: string): Promise<SourceItem | null> {
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

function allocateScores(items: SourceItem[], totalScore: number): number[] {
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

export const GET = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin', 'question_editor']);
  const url = new URL(request.url);
  const paperId = url.searchParams.get('paperId');
  const params: unknown[] = [];
  let where = 'p.deleted_at IS NULL';
  if (!user.roles.includes('super_admin')) { params.push(user.organizationId); where += ` AND p.organization_id = $${params.length}`; }
  if (paperId) { params.push(paperId); where += ` AND p.id = $${params.length}`; }
  const papers = await dbQuery<{
    id: string; organization_id: string; title: string; paper_kind: string; total_score: number; pass_score: number; duration_minutes: number; status: string; version: number; item_count: string; created_at: string;
  }>(`SELECT p.id, p.organization_id, p.title, p.paper_kind, p.total_score, p.pass_score, p.duration_minutes, p.status, p.version, p.created_at,
      (SELECT COUNT(*)::text FROM exam_paper_items i WHERE i.paper_id = p.id) AS item_count
      FROM exam_papers p WHERE ${where} ORDER BY p.created_at DESC`, ...params);
  const result = await Promise.all(papers.map(async p => ({
    id: p.id, organizationId: p.organization_id, title: p.title, paperKind: p.paper_kind,
    totalScore: Number(p.total_score), passScore: Number(p.pass_score), durationMinutes: p.duration_minutes,
    status: p.status, version: p.version, itemCount: Number(p.item_count), createdAt: p.created_at,
    items: paperId ? await dbQuery(`SELECT id, item_type AS "itemType", item_id AS "itemId", sort_order AS "sortOrder", score, section, item_snapshot AS snapshot, grader_id AS "graderId", grader_version AS "graderVersion" FROM exam_paper_items WHERE paper_id = $1 ORDER BY sort_order`, p.id) : undefined,
  })));
  return ok(result);
});

export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin', 'question_editor']);
  const body = await parseBody(request, createSchema);
  if (body.passScore > body.totalScore) return fail(400, '及格分不能高于总分');
  const organizationId = user.roles.includes('super_admin') ? body.organizationId : user.organizationId;
  if (!organizationId) return fail(400, '必须选择所属机构');
  requireSameOrg(user, organizationId);
  const requested = body.items ?? (body.questionIds ?? []).map(itemId => ({ itemType: 'question' as const, itemId }));
  const sources: SourceItem[] = [];
  for (const item of requested) {
    const source = await loadSourceItem(item, organizationId);
    if (!source) return fail(400, `题目或实操任务不可用于正式考试：${item.itemId}`);
    sources.push(source);
  }
  const scores = sources.length ? allocateScores(sources, body.totalScore) : [];
  const paperId = await dbTx(async client => {
    const paper = await client.query<{ id: string }>(
      `INSERT INTO exam_papers (organization_id, title, paper_kind, total_score, pass_score, duration_minutes, status, version, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'draft',1,NOW(),NOW()) RETURNING id`,
      [organizationId, body.title, body.paperKind, body.totalScore, body.passScore, body.durationMinutes],
    );
    const id = paper.rows[0].id;
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      await client.query(
        `INSERT INTO exam_paper_items
          (paper_id,item_type,item_id,sort_order,score,section,item_snapshot,answer_key_snapshot,grading_config_snapshot,grader_id,grader_version,asset_checksum,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
        [id, source.itemType, source.itemId, index + 1, scores[index], source.section, source.snapshot, source.answerKey, source.gradingConfig ?? {}, source.graderId, source.graderVersion, source.assetChecksum ?? null],
      );
    }
    return id;
  });
  return ok({ id: paperId, itemCount: sources.length });
});

export const PATCH = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin']);
  const body = await parseBody(request, patchSchema);
  const paper = await dbOne<{ id: string; organization_id: string | null; status: string; total_score: number; item_count: string; item_total: number }>(
    `SELECT p.id,p.organization_id,p.status,p.total_score,
      COUNT(i.id)::text AS item_count, COALESCE(SUM(i.score),0)::numeric AS item_total
      FROM exam_papers p LEFT JOIN exam_paper_items i ON i.paper_id=p.id
      WHERE p.id=$1 AND p.deleted_at IS NULL GROUP BY p.id`, body.paperId,
  );
  if (!paper) return fail(404, '试卷不存在');
  requireSameOrg(user, paper.organization_id);
  if (body.action === 'publish') {
    if (paper.status !== 'draft') return fail(409, '只有草稿试卷可以发布');
    if (Number(paper.item_count) === 0) return fail(400, '空试卷不能发布');
    if (Math.abs(Number(paper.item_total) - Number(paper.total_score)) > 0.01) return fail(400, '题目分值合计与试卷总分不一致');
    await dbQuery(`UPDATE exam_papers SET status='published',version=version+1,updated_at=NOW() WHERE id=$1`, body.paperId);
  } else {
    if (paper.status === 'retired') return fail(409, '试卷已退役');
    await dbQuery(`UPDATE exam_papers SET status='retired',updated_at=NOW() WHERE id=$1`, body.paperId);
  }
  return ok({ id: body.paperId, status: body.action === 'publish' ? 'published' : 'retired' });
});
