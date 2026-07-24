import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { catchError, ok } from '@/lib/api';

interface ErrorRow {
  item_type: string;
  item_id: string;
  item_title: string | null;
  affected_students: string;
  wrong_count: string;
  unresolved_count: string;
  last_wrong_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['teacher', 'school_admin', 'super_admin']);
    const args: unknown[] = [];
    let scope = 'TRUE';
    if (user.roles.includes('teacher') && !user.roles.includes('super_admin')) {
      args.push(user.id);
      scope = `EXISTS (SELECT 1 FROM teacher_cohort_grants g WHERE g.cohort_id = e.cohort_id AND g.teacher_id = $${args.length})`;
    } else if (!user.roles.includes('super_admin')) {
      args.push(user.organizationId);
      scope = `c.organization_id = $${args.length}`;
    }
    const rows = await dbQuery<ErrorRow>(
      `SELECT w.item_type, w.item_id, COALESCE(t.title, q.stem) AS item_title,
              COUNT(DISTINCT w.user_id)::text AS affected_students,
              SUM(w.wrong_count)::text AS wrong_count,
              COUNT(*) FILTER (WHERE NOT w.resolved)::text AS unresolved_count,
              MAX(w.last_wrong_at)::text AS last_wrong_at
         FROM practice_wrong_items w
         JOIN enrollments e ON e.user_id = w.user_id AND e.status = 'active'
         JOIN cohorts c ON c.id = e.cohort_id AND c.deleted_at IS NULL
         LEFT JOIN practice_task_templates t ON w.item_type = 'task_template' AND t.id = w.item_id
         LEFT JOIN practice_question_items q ON w.item_type IN ('question_item', 'theory') AND q.id = w.item_id
        WHERE ${scope}
        GROUP BY w.item_type, w.item_id, t.title, q.stem
        ORDER BY SUM(w.wrong_count) DESC, MAX(w.last_wrong_at) DESC
        LIMIT 100`,
      ...args,
    );
    return ok({ items: rows.map(row => ({
      itemType: row.item_type,
      itemId: row.item_id,
      title: row.item_title ?? '已退役题目',
      affectedStudents: Number(row.affected_students),
      wrongCount: Number(row.wrong_count),
      unresolvedCount: Number(row.unresolved_count),
      lastWrongAt: row.last_wrong_at,
    })), total: rows.length });
  } catch (error) {
    return catchError(error);
  }
}
