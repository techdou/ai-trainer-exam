import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { catchError, ok } from '@/lib/api';

interface ResultRow {
  id: string;
  display_name: string;
  student_no: string | null;
  cohort_name: string;
  exam_title: string;
  total_score: string;
  passed: boolean;
  status: string;
  submitted_at: string | null;
  released_at: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['teacher', 'school_admin', 'super_admin']);
    const args: unknown[] = [];
    let scope = 'TRUE';
    if (user.roles.includes('teacher') && !user.roles.includes('super_admin')) {
      args.push(user.id);
      scope = `EXISTS (SELECT 1 FROM teacher_cohort_grants g WHERE g.cohort_id = s.cohort_id AND g.teacher_id = $${args.length})`;
    } else if (!user.roles.includes('super_admin')) {
      args.push(user.organizationId);
      scope = `s.organization_id = $${args.length}`;
    }
    const rows = await dbQuery<ResultRow>(
      `SELECT es.id, p.display_name, p.student_no, c.name AS cohort_name, s.title AS exam_title,
              es.total_score::text, es.passed, es.status, a.submitted_at, CASE WHEN es.status = 'published' THEN es.updated_at END AS released_at
         FROM exam_scores es
         JOIN exam_attempts a ON a.id = es.attempt_id
         JOIN profiles p ON p.id = es.user_id
         JOIN exam_schedules s ON s.id = es.schedule_id AND s.deleted_at IS NULL
         JOIN cohorts c ON c.id = s.cohort_id
        WHERE ${scope}
        ORDER BY s.exam_start_at DESC, p.display_name`,
      ...args,
    );
    return ok({ items: rows.map(row => ({
      id: row.id,
      displayName: row.display_name,
      studentNo: row.student_no,
      cohortName: row.cohort_name,
      examTitle: row.exam_title,
      totalScore: Number(row.total_score),
      passed: row.passed,
      status: row.status,
      submittedAt: row.submitted_at,
      releasedAt: row.released_at,
    })), total: rows.length });
  } catch (error) {
    return catchError(error);
  }
}
