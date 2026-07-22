import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import { ok, fail } from '@/lib/api';

/** GET /api/admin/cohorts - 列出班级 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin', 'teacher']);

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get('organizationId');

    let whereClause = 'WHERE c.deleted_at IS NULL';
    const params: unknown[] = [];
    let paramIdx = 1;

    if (organizationId) {
      whereClause += ` AND c.organization_id = $${paramIdx++}`;
      params.push(organizationId);
    } else if (user.organizationId && !user.roles.includes('super_admin')) {
      whereClause += ` AND c.organization_id = $${paramIdx++}`;
      params.push(user.organizationId);
    }

    const cohorts = await dbQuery<{
      id: string;
      name: string;
      organization_id: string;
      organization_name: string;
      student_count: string;
      created_at: string;
    }>(
      `SELECT c.id, c.name, c.organization_id,
              o.name as organization_name,
              (SELECT COUNT(*)::text FROM enrollments e WHERE e.cohort_id = c.id) as student_count,
              c.created_at
       FROM cohorts c
       INNER JOIN organizations o ON o.id = c.organization_id
       ${whereClause}
       ORDER BY c.created_at DESC`,
      ...params,
    );

    return ok(cohorts.map(c => ({
      id: c.id,
      name: c.name,
      organizationId: c.organization_id,
      organizationName: c.organization_name,
      studentCount: parseInt(c.student_count, 10),
      createdAt: c.created_at,
    })));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return fail(500, '服务器开小差了，请稍后再试');
  }
}

/** POST /api/admin/cohorts - 创建班级 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);
    const body = await req.json() as { name?: string; organizationId?: string };
    const { name, organizationId } = body;
    if (!name) return fail(400, '班级名称不能为空');

    const orgId = organizationId || user.organizationId;
    if (!orgId) return fail(400, '请选择所属学校');

    const rows = await dbQuery<{ id: string }>(
      `INSERT INTO cohorts (name, organization_id) VALUES ($1, $2) RETURNING id`,
      name, orgId,
    );

    return ok({ id: rows[0]?.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return fail(500, '创建失败');
  }
}
