import { z } from 'zod';
import { requireRole, requireSameOrg } from '@/server/auth';
import { dbQuery, dbOne } from '@/server/db';
import { ok, fail, handler, parseBody } from '@/lib/api';
import { loadSourceItem, describeSourceItem, createPaper, type SourceItem } from '@/server/paper-compose';

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
    if (!source) {
      // 报错带题干/标题而不是裸 UUID——组卷列表里看不到 UUID,无法定位是哪一条。
      const label = await describeSourceItem(item, organizationId);
      return fail(400, `题目或实操任务不可用于正式考试（未发布/不允许用于考试/答案配置缺陷）：${label ?? item.itemId}`);
    }
    sources.push(source);
  }
  const result = await createPaper({
    organizationId, title: body.title, paperKind: body.paperKind,
    totalScore: body.totalScore, passScore: body.passScore, durationMinutes: body.durationMinutes, sources,
  });
  return ok(result, { status: 201 });
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
