import { z } from 'zod';
import { organizationScope, requireRole, requireSameOrg } from '@/server/auth';
import { dbQuery, dbOne, dbExec } from '@/server/db';
import { handler, ok, fail, parseBody } from '@/lib/api';
import { graderIdForTaskType } from '@/server/grading';
import { reviewTransition, statusAfterContentEdit } from '@/server/content-workflow';
import { insertAudit } from '@/server/audit';
import { resolveImageUrl } from '@/server/object-storage';

const createSchema = z.object({
  bankType: z.enum(['practice', 'exam']),
  organizationId: z.string().uuid().optional(),
  taskType: z.string().min(1).max(48),
  title: z.string().trim().min(1).max(300),
  instructions: z.string().max(5000).optional(),
  difficulty: z.number().int().min(1).max(5).default(1),
  config: z.record(z.string(), z.unknown()).default({}),
  answerKey: z.unknown(),
  gradingConfig: z.record(z.string(), z.unknown()).default({}),
});

export const GET = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin', 'question_editor', 'question_reviewer', 'teacher']);
  const url = new URL(request.url);
  const bankType = url.searchParams.get('bankType') === 'practice' ? 'practice' : 'exam';
  const includeAnswerKey = url.searchParams.get('includeAnswerKey') === 'true';
  if (
    includeAnswerKey
    && !user.roles.some(role => ['super_admin', 'school_admin', 'question_editor', 'question_reviewer'].includes(role))
  ) {
    return fail(403, '没有权限查看标准答案');
  }
  const status = includeAnswerKey ? null : url.searchParams.get('status') ?? 'published';
  const table = bankType === 'exam' ? 'exam_task_templates' : 'practice_task_templates';
  const annotationTypes = ['image_annotation', 'bounding_box', 'point_annotation', 'polyline_annotation', 'polygon_annotation'];
  const onlyAnnotation = url.searchParams.get('annotationOnly') === 'true';
  const params: unknown[] = [];
  const conditions: string[] = ['deleted_at IS NULL'];
  if (status) { params.push(status); conditions.push(`review_status = $${params.length}`); }
  if (onlyAnnotation) {
    const placeholders = annotationTypes.map((_, i) => `$${params.length + i + 1}`).join(',');
    params.push(...annotationTypes);
    conditions.push(`task_type IN (${placeholders})`);
  }
  const scopedOrg = organizationScope(user);
  if (scopedOrg) { params.push(scopedOrg); conditions.push(`organization_id = $${params.length}`); }
  const whereClause = conditions.join(' AND ');
  const answerKeySelect = includeAnswerKey ? ', answer_key AS "answerKey"' : '';
  const rows = await dbQuery(
    `SELECT id, organization_id AS "organizationId", task_type AS "taskType", title, instructions, difficulty,
            config, grading_config AS "gradingConfig", review_status AS "reviewStatus",
            practice_only AS "practiceOnly", ${bankType === 'exam' ? 'eligible_for_formal_exam' : 'false'} AS "eligibleForFormalExam"${answerKeySelect}
       FROM ${table}
      WHERE ${whereClause}
      ORDER BY difficulty, title`,
    ...params,
  );
  // Resolve asset:UUID references in config.imageUrl to proxy URLs (synchronous)
  for (const row of rows) {
    const config = (row as Record<string, unknown>).config as Record<string, unknown> | undefined;
    if (config?.imageUrl && typeof config.imageUrl === 'string') {
      config.imageUrl = resolveImageUrl(config.imageUrl);
    }
  }
  return ok(rows);
});

export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin', 'question_editor']);
  const body = await parseBody(request, createSchema);
  const graderId = graderIdForTaskType(body.taskType);
  if (!graderId) return fail(400, `不支持的实操类型：${body.taskType}`);
  const organizationId = user.roles.includes('super_admin') ? body.organizationId : user.organizationId;
  if (!organizationId) return fail(400, '必须选择机构');
  requireSameOrg(user, organizationId);
  const table = body.bankType === 'exam' ? 'exam_task_templates' : 'practice_task_templates';
  const row = await dbOne<{ id: string }>(
    `INSERT INTO ${table}
      (organization_id,task_type,title,instructions,difficulty,config,answer_key,grading_config,practice_only${body.bankType === 'exam' ? ',eligible_for_formal_exam' : ''},review_status,published_version,created_by,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9${body.bankType === 'exam' ? ',$10' : ''},'draft',NULL,$${body.bankType === 'exam' ? 11 : 10},NOW(),NOW()) RETURNING id`,
    ...([organizationId, body.taskType, body.title, body.instructions ?? '', body.difficulty, body.config, body.answerKey, body.gradingConfig, body.bankType === 'practice', ...(body.bankType === 'exam' ? [true] : []), user.id] as unknown[]),
  );
  return ok({ id: row!.id, graderId });
});

export const PATCH = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin', 'question_editor', 'question_reviewer']);
  const body = await parseBody(request, z.object({ bankType: z.enum(['practice','exam']), id: z.string().min(1), action: z.enum(['approve','reject','publish','retire']) }));
  const table = body.bankType === 'exam' ? 'exam_task_templates' : 'practice_task_templates';
  const row = await dbOne<{ organization_id: string | null; review_status: string; created_by: string | null }>(`SELECT organization_id,review_status,created_by FROM ${table} WHERE id=$1 AND deleted_at IS NULL`, body.id);
  if (!row) return fail(404, '任务不存在');
  requireSameOrg(user, row.organization_id);
  const isReviewer = user.roles.some(role => ['super_admin', 'school_admin', 'question_reviewer'].includes(role));
  const isEditor = user.roles.some(role => ['super_admin', 'school_admin', 'question_editor'].includes(role));
  if (body.action === 'retire' && !isEditor) return fail(403, '只有编辑员或管理员可以退役任务');
  if (body.action !== 'retire' && !isReviewer) return fail(403, '只有审核员或管理员可以审核任务');
  if (body.action !== 'retire' && row.created_by === user.id) return fail(403, '不能审核自己提交的任务');
  const status = reviewTransition(row.review_status, body.action);
  if (!status) return fail(409, `任务当前状态不允许执行 ${body.action}`);
  const changed = await dbExec(
    `UPDATE ${table}
        SET review_status=$1,
            reviewer_id=$2,
            published_version=CASE WHEN $3::boolean THEN COALESCE(published_version,0)+1 ELSE published_version END,
            updated_at=NOW()
      WHERE id=$4 AND review_status=$5`,
    status,
    user.id,
    body.action === 'publish',
    body.id,
    row.review_status,
  );
  if (changed === 0) return fail(409, '任务状态已变化，请刷新后重试');
  await insertAudit({ actorId:user.id, actorRole:user.roles[0], organizationId:row.organization_id, action:`task_${body.action}`, entityType:'task_template', entityId:body.id });
  return ok({ id: body.id, status });
});

/** PUT /api/admin/task-templates — 更新任务的标准答案 (answer_key)、评分参数和图片 */
const updateAnswerKeySchema = z.object({
  bankType: z.enum(['practice', 'exam']),
  id: z.string().min(1),
  answerKey: z.unknown().optional(),
  gradingConfig: z.record(z.string(), z.unknown()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const PUT = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin', 'question_editor']);
  const body = await parseBody(request, updateAnswerKeySchema);
  const table = body.bankType === 'exam' ? 'exam_task_templates' : 'practice_task_templates';
  const row = await dbOne<{ organization_id: string | null; task_type: string; review_status: string; config: Record<string, unknown> }>(
    `SELECT organization_id, task_type, review_status, config FROM ${table} WHERE id=$1 AND deleted_at IS NULL`,
    body.id,
  );
  if (!row) return fail(404, '任务不存在');
  requireSameOrg(user, row.organization_id);
  const nextStatus = statusAfterContentEdit(row.review_status);
  if (!nextStatus) return fail(409, '已退役任务不能编辑');

  // Build dynamic SET clause
  const sets: string[] = ['review_status=$1', 'reviewer_id=NULL', 'updated_at=NOW()'];
  const params: unknown[] = [nextStatus];
  let paramIdx = 2;

  if (body.config) {
    sets.push(`config=$${paramIdx}`);
    params.push(JSON.stringify({ ...row.config, ...body.config }));
    paramIdx++;
  }
  if (body.answerKey !== undefined) {
    sets.push(`answer_key=$${paramIdx}`);
    params.push(JSON.stringify(body.answerKey));
    paramIdx++;
  }
  if (body.gradingConfig !== undefined) {
    sets.push(`grading_config=$${paramIdx}`);
    params.push(JSON.stringify(body.gradingConfig));
    paramIdx++;
  }

  params.push(body.id, row.review_status);
  const changed = await dbExec(
    `UPDATE ${table} SET ${sets.join(', ')} WHERE id=$${paramIdx} AND review_status=$${paramIdx + 1}`,
    ...params,
  );
  if (changed === 0) return fail(409, '任务状态已变化，请刷新后重试');
  return ok({ id: body.id, updated: true });
});
