import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbExec, dbQuery, dbOne } from '@/server/db';
import { handler, ok, fail, parseBody } from '@/lib/api';

/**
 * 题库开放制管理（机构级共享 + 三态可见性切换）。
 * 三态: organization_id=NULL 全局开放 / =机构 私有 / question_bank_shares 开放给指定机构。
 */
const schema = z.object({
  action: z.enum(['share', 'unshare', 'set_visibility']),
  resourceType: z.enum(['practice_question', 'exam_question', 'practice_task', 'exam_task']),
  resourceIds: z.array(z.string().uuid()).min(1).max(500),
  organizationId: z.string().uuid().optional(),       // share/unshare 必填
  visibility: z.enum(['global', 'private']).optional(), // set_visibility 必填
});

const TABLE_FOR: Record<string, string> = {
  practice_question: 'practice_question_items',
  exam_question: 'exam_question_items',
  practice_task: 'practice_task_templates',
  exam_task: 'exam_task_templates',
};

export const GET = handler(async (request: NextRequest) => {
  const user = await requireRole(request, ['super_admin', 'school_admin']);
  const p = new URL(request.url).searchParams;
  const resourceType = p.get('resource_type') ?? '';
  const resourceId = p.get('resource_id') ?? '';
  if (!TABLE_FOR[resourceType] || !z.string().uuid().safeParse(resourceId).success) {
    return fail(400, '资源参数不正确');
  }
  const rows = await dbQuery<{ organization_id: string; name: string }>(
    `SELECT s.organization_id, o.name FROM question_bank_shares s
      JOIN organizations o ON o.id = s.organization_id
     WHERE s.resource_type = $1 AND s.resource_id = $2 ORDER BY o.name`,
    resourceType, resourceId,
  );
  const table = TABLE_FOR[resourceType];
  const res = await dbOne<{ organization_id: string | null }>(
    `SELECT organization_id FROM ${table} WHERE id = $1`, resourceId,
  );
  return ok({
    visibility: res?.organization_id == null ? 'global' : 'private',
    ownerOrganizationId: res?.organization_id ?? null,
    sharedOrganizations: rows,
  });
});

export const POST = handler(async (request: NextRequest) => {
  const user = await requireRole(request, ['super_admin']);
  const body = await parseBody(request, schema);
  const { action, resourceType, resourceIds } = body;
  const table = TABLE_FOR[resourceType];

  if (action === 'set_visibility') {
    if (!body.visibility) return fail(400, '缺少 visibility 参数');
    const orgId = body.visibility === 'private' ? user.organizationId : null;
    if (body.visibility === 'private' && !orgId) return fail(400, '当前账号未绑定机构，无法设为机构私有');
    for (const id of resourceIds) {
      await dbExec(`UPDATE ${table} SET organization_id = $1 WHERE id = $2`, orgId, id);
    }
    return ok({ updated: resourceIds.length, visibility: body.visibility });
  }

  if (!body.organizationId) return fail(400, '缺少 organizationId 参数');
  const org = await dbOne<{ id: string }>('SELECT id FROM organizations WHERE id = $1 AND deleted_at IS NULL', body.organizationId);
  if (!org) return fail(404, '目标机构不存在');

  if (action === 'share') {
    for (const id of resourceIds) {
      await dbExec(
        `INSERT INTO question_bank_shares (id, resource_type, resource_id, organization_id, created_by)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
         ON CONFLICT (resource_type, resource_id, organization_id) DO NOTHING`,
        resourceType, id, body.organizationId, user.id,
      );
    }
    return ok({ shared: resourceIds.length, organizationId: body.organizationId });
  }

  // unshare
  for (const id of resourceIds) {
    await dbExec(
      `DELETE FROM question_bank_shares WHERE resource_type = $1 AND resource_id = $2 AND organization_id = $3`,
      resourceType, id, body.organizationId,
    );
  }
  return ok({ unshared: resourceIds.length, organizationId: body.organizationId });
});
