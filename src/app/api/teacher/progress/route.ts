import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { catchError, ok } from '@/lib/api';

interface ProgressRow {
  id: string;
  display_name: string;
  student_no: string | null;
  cohort_name: string;
  assignment_count: string;
  attempted_count: string;
  passed_count: string;
  average_score: string | null;
  last_activity_at: string | null;
}

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
    const rows = await dbQuery<ProgressRow>(
      `SELECT p.id, p.display_name, p.student_no, c.name AS cohort_name,
              COUNT(DISTINCT a.id)::text AS assignment_count,
              COUNT(DISTINCT pa.item_id)::text AS attempted_count,
              COUNT(DISTINCT pa.item_id) FILTER (WHERE pa.passed)::text AS passed_count,
              AVG(CASE WHEN pa.max_score > 0 THEN pa.score / pa.max_score * 100 END)::text AS average_score,
              MAX(pa.updated_at)::text AS last_activity_at
         FROM profiles p
         JOIN enrollments e ON e.user_id = p.id AND e.status = 'active'
         JOIN cohorts c ON c.id = e.cohort_id AND c.deleted_at IS NULL
         LEFT JOIN practice_assignments a ON a.cohort_id = c.id
         LEFT JOIN practice_attempts pa ON pa.user_id = p.id AND pa.item_id = a.item_id AND pa.item_type = a.item_type
        WHERE p.status = 'active' AND ${scope}
        GROUP BY p.id, c.id
        ORDER BY c.name, p.display_name`,
      ...args,
    );
    return ok({ items: rows.map(row => ({
      id: row.id,
      displayName: row.display_name,
      studentNo: row.student_no,
      cohortName: row.cohort_name,
      assignmentCount: Number(row.assignment_count),
      attemptedCount: Number(row.attempted_count),
      passedCount: Number(row.passed_count),
      averageScore: row.average_score === null ? null : Math.round(Number(row.average_score)),
      lastActivityAt: row.last_activity_at,
    })), total: rows.length });
  } catch (error) {
    return catchError(error);
  }
}
