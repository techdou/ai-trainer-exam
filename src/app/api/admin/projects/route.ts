import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, organizationScope, requireRole } from '@/server/auth';
import { dbOne, dbQuery } from '@/server/db';
import { catchError, ok, parseBody } from '@/lib/api';
import { insertAudit } from '@/server/audit';

const createSchema = z.object({
  organizationId: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(3000).optional(),
  fundingSource: z.string().trim().max(100).optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
});
const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(3000).nullable().optional(),
  fundingSource: z.string().trim().max(100).nullable().optional(),
  status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
});

interface ProjectRow { id:string;organization_id:string;organization_name:string;name:string;description:string|null;funding_source:string|null;status:string;start_at:string|null;end_at:string|null;created_at:string;cohort_count:string;student_count:string }

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin', 'school_admin']);
    const rows = await dbQuery<ProjectRow>(
      `SELECT p.id, p.organization_id, o.name AS organization_name, p.name, p.description,
              p.funding_source, p.status, p.start_at, p.end_at, p.created_at,
              COUNT(DISTINCT c.id) FILTER (WHERE c.deleted_at IS NULL)::text AS cohort_count,
              COUNT(DISTINCT e.user_id) FILTER (WHERE e.status = 'active')::text AS student_count
         FROM training_projects p
         JOIN organizations o ON o.id = p.organization_id
         LEFT JOIN cohorts c ON c.project_id = p.id
         LEFT JOIN enrollments e ON e.cohort_id = c.id
        WHERE p.deleted_at IS NULL AND ($1::text IS NULL OR p.organization_id = $1)
        GROUP BY p.id, o.name
        ORDER BY p.created_at DESC`,
      organizationScope(user),
    );
    return ok({ items: rows.map(row => ({
      id:row.id, organizationId:row.organization_id, organizationName:row.organization_name,
      name:row.name, description:row.description, fundingSource:row.funding_source, status:row.status,
      startAt:row.start_at, endAt:row.end_at, createdAt:row.created_at,
      cohortCount:Number(row.cohort_count), studentCount:Number(row.student_count),
    })), total: rows.length });
  } catch (error) { return catchError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin', 'school_admin']);
    const body = await parseBody(request, createSchema);
    const organizationId = user.roles.includes('super_admin') ? body.organizationId : organizationScope(user);
    if (!organizationId) throw new ApiError(400, '请选择所属机构');
    const org = await dbOne<{ id:string }>('SELECT id FROM organizations WHERE id = $1 AND deleted_at IS NULL AND status = \'active\'', organizationId);
    if (!org) throw new ApiError(404, '所属机构不存在或已停用');
    if (body.startAt && body.endAt && new Date(body.startAt) >= new Date(body.endAt)) throw new ApiError(400, '结束时间必须晚于开始时间');
    const row = await dbOne<{ id:string }>(
      `INSERT INTO training_projects (organization_id, name, description, funding_source, status, start_at, end_at)
       VALUES ($1,$2,$3,$4,'active',$5,$6) RETURNING id`,
      organizationId, body.name, body.description ?? null, body.fundingSource ?? null, body.startAt ?? null, body.endAt ?? null,
    );
    await insertAudit({actorId:user.id,actorRole:user.roles[0],action:'training_project.create',entityType:'training_project',entityId:row?.id??null,organizationId,details:body.name});
    return ok({id:row?.id},{status:201});
  } catch (error) { return catchError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin', 'school_admin']);
    const body = await parseBody(request, updateSchema);
    const existing = await dbOne<{ organization_id:string;start_at:string|null;end_at:string|null }>('SELECT organization_id,start_at,end_at FROM training_projects WHERE id=$1 AND deleted_at IS NULL', body.id);
    if (!existing) throw new ApiError(404,'培训项目不存在');
    if (!user.roles.includes('super_admin') && existing.organization_id !== user.organizationId) throw new ApiError(403,'不能操作其他机构项目');
    const startAt = body.startAt === undefined ? existing.start_at : body.startAt;
    const endAt = body.endAt === undefined ? existing.end_at : body.endAt;
    if (startAt && endAt && new Date(startAt) >= new Date(endAt)) throw new ApiError(400,'结束时间必须晚于开始时间');
    await dbQuery(
      `UPDATE training_projects SET name=COALESCE($2,name),description=CASE WHEN $3::boolean THEN $4 ELSE description END,
       funding_source=CASE WHEN $5::boolean THEN $6 ELSE funding_source END,status=COALESCE($7,status),
       start_at=CASE WHEN $8::boolean THEN $9 ELSE start_at END,end_at=CASE WHEN $10::boolean THEN $11 ELSE end_at END,updated_at=NOW()
       WHERE id=$1`,
      body.id,body.name??null,body.description!==undefined,body.description??null,body.fundingSource!==undefined,body.fundingSource??null,
      body.status??null,body.startAt!==undefined,body.startAt??null,body.endAt!==undefined,body.endAt??null,
    );
    await insertAudit({actorId:user.id,actorRole:user.roles[0],action:'training_project.update',entityType:'training_project',entityId:body.id,organizationId:existing.organization_id,details:JSON.stringify(body)});
    return ok({id:body.id});
  } catch (error) { return catchError(error); }
}
