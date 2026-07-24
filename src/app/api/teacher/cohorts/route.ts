import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { catchError, ok } from '@/lib/api';

interface CohortRow {
  id: string;
  name: string;
  status: string;
  project_name: string | null;
  student_count: string;
  assignment_count: string;
  exam_count: string;
}

/** GET /api/teacher/cohorts - 教师授权班级 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['teacher', 'school_admin', 'super_admin']);
    const args: unknown[] = [];
    let scope = 'TRUE';
    if (user.roles.includes('teacher') && !user.roles.includes('super_admin')) {
      args.push(user.id);
      scope = `EXISTS (SELECT 1 FROM teacher_cohort_grants g WHERE g.cohort_id = c.id AND g.teacher_id = $${args.length})`;
    } else if (!user.roles.includes('super_admin')) {
      args.push(user.organizationId);
      scope = `c.organization_id = $${args.length}`;
    }
    const rows = await dbQuery<CohortRow>(
      `SELECT c.id, c.name, c.status, p.name AS project_name,
              COUNT(DISTINCT e.user_id) FILTER (WHERE e.status = 'active')::text AS student_count,
              COUNT(DISTINCT a.id)::text AS assignment_count,
              COUNT(DISTINCT s.id)::text AS exam_count
         FROM cohorts c
         LEFT JOIN training_projects p ON p.id = c.project_id AND p.deleted_at IS NULL
         LEFT JOIN enrollments e ON e.cohort_id = c.id
         LEFT JOIN practice_assignments a ON a.cohort_id = c.id
         LEFT JOIN exam_schedules s ON s.cohort_id = c.id AND s.deleted_at IS NULL
        WHERE c.deleted_at IS NULL AND ${scope}
        GROUP BY c.id, p.name
        ORDER BY c.created_at DESC`,
      ...args,
    );
    return ok({
      items: rows.map(row => ({
        id: row.id,
        name: row.name,
        status: row.status,
        startAt: null,
        endAt: null,
        projectName: row.project_name,
        studentCount: Number(row.student_count),
        assignmentCount: Number(row.assignment_count),
        examCount: Number(row.exam_count),
      })),
      total: rows.length,
    });
  } catch (error) {
    return catchError(error);
  }
}
