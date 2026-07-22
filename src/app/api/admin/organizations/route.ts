import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, fail } from '@/lib/api';

/** GET /api/admin/organizations - 列出组织（学校） */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);

    let orgId: string | null = null;
    if (user.roles.includes('school_admin') && !user.roles.includes('super_admin')) {
      orgId = user.organizationId;
    }

    type OrgRow = {
      id: string;
      name: string;
      code: string;
      contact: string | null;
      status: string;
      created_at: string;
      cohort_count: string;
      student_count: string;
    };

    let orgs: OrgRow[];

    if (orgId) {
      orgs = await dbQuery<OrgRow>(
        `SELECT o.id, o.name, o.code, o.contact, o.status, o.created_at,
                (SELECT COUNT(*)::text FROM cohorts c WHERE c.organization_id = o.id AND c.deleted_at IS NULL) as cohort_count,
                (SELECT COUNT(*)::text FROM enrollments e
                 INNER JOIN cohorts c ON c.id = e.cohort_id AND c.organization_id = o.id) as student_count
         FROM organizations o WHERE o.id = $1`,
        orgId,
      );
    } else {
      orgs = await dbQuery<OrgRow>(
        `SELECT o.id, o.name, o.code, o.contact, o.status, o.created_at,
                (SELECT COUNT(*)::text FROM cohorts c WHERE c.organization_id = o.id AND c.deleted_at IS NULL) as cohort_count,
                (SELECT COUNT(*)::text FROM enrollments e
                 INNER JOIN cohorts c ON c.id = e.cohort_id AND c.organization_id = o.id) as student_count
         FROM organizations o
         ORDER BY o.created_at DESC`,
      );
    }

    return ok(orgs.map(o => ({
      id: o.id,
      name: o.name,
      code: o.code,
      contact: o.contact,
      status: o.status,
      createdAt: o.created_at,
      cohortCount: parseInt(o.cohort_count, 10),
      studentCount: parseInt(o.student_count, 10),
    })));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    console.error('[admin/organizations] GET error:', msg);
    return fail(500, '服务器开小差了，请稍后再试');
  }
}

/** POST /api/admin/organizations - 创建组织 */
export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ['super_admin']);
    const body = await req.json() as { name?: string; code?: string; contact?: string };
    const { name, code, contact } = body;
    if (!name) return fail(400, '组织名称不能为空');
    if (!code) return fail(400, '组织编码不能为空');

    const rows = await dbQuery<{ id: string }>(
      `INSERT INTO organizations (name, code, contact, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
      name, code, contact || null,
    );

    return ok({ id: rows[0]?.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    console.error('[admin/organizations] POST error:', msg);
    return fail(500, '创建失败');
  }
}
