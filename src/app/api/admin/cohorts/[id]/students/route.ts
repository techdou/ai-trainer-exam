import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbOne } from '@/server/db';
import { ok, catchError } from '@/lib/api';

/** 获取指定班级下的学员列表 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin', 'teacher']);
    const { id: cohortId } = await params;

    // 校验班级存在
    const cohort = await dbOne<{ id: string; name: string; organization_id: string }>(
      'SELECT id, name, organization_id FROM cohorts WHERE id=$1 AND deleted_at IS NULL',
      cohortId,
    );
    if (!cohort) return ok({ cohort: null, students: [] });

    // 非 super_admin 校验组织范围
    if (!user.roles.includes('super_admin')) {
      if (user.roles.includes('teacher')) {
        // teacher 需有该班级授权
        const granted = await dbOne<{ id: string }>(
          'SELECT id FROM teacher_cohort_grants WHERE teacher_id=$1 AND cohort_id=$2',
          user.id, cohortId,
        );
        if (!granted) return ok({ cohort: { id: cohort.id, name: cohort.name, organizationId: cohort.organization_id }, students: [] });
      } else if (user.organizationId !== cohort.organization_id) {
        return ok({ cohort: { id: cohort.id, name: cohort.name, organizationId: cohort.organization_id }, students: [] });
      }
    }

    const students = await dbQuery<{
      id: string;
      display_name: string;
      email: string;
      status: string;
      created_at: string;
    }>(
      `SELECT p.id, p.display_name, p.email, p.status, p.created_at
       FROM enrollments e
       JOIN profiles p ON p.id = e.user_id
       WHERE e.cohort_id = $1 AND e.status = 'active'
       ORDER BY p.display_name`,
      cohortId,
    );

    return ok({
      cohort: { id: cohort.id, name: cohort.name, organizationId: cohort.organization_id },
      students: students.map(s => ({
        id: s.id,
        name: s.display_name,
        email: s.email,
        idCard: s.email.includes('@student.exam.local')
          ? s.email.replace('@student.exam.local', '').toUpperCase()
          : s.email,
        status: s.status,
        createdAt: s.created_at,
      })),
    });
  } catch (error) {
    return catchError(error);
  }
}
