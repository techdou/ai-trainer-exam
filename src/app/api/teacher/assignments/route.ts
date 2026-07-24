import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole, ApiError } from '@/server/auth';
import { assertTeacherCohortAccess } from '@/server/exam-security';
import { dbOne, dbQuery } from '@/server/db';
import { catchError, ok, parseBody } from '@/lib/api';
import { insertAudit } from '@/server/audit';

const createSchema = z.object({
  cohortId: z.string().uuid(),
  itemType: z.enum(['task_template', 'question_item']),
  itemId: z.string().uuid(),
  title: z.string().trim().min(1).max(300).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

interface AssignmentRow {
  id: string;
  cohort_id: string;
  cohort_name: string;
  item_type: string;
  item_id: string;
  title: string | null;
  item_title: string | null;
  due_at: string | null;
  created_at: string;
  attempt_count: string;
  passed_count: string;
}

/** GET /api/teacher/assignments */
export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['teacher', 'school_admin', 'super_admin']);
    const args: unknown[] = [];
    let scope = 'TRUE';
    if (user.roles.includes('teacher') && !user.roles.includes('super_admin')) {
      args.push(user.id);
      scope = `EXISTS (SELECT 1 FROM teacher_cohort_grants g WHERE g.cohort_id = a.cohort_id AND g.teacher_id = $${args.length})`;
    } else if (!user.roles.includes('super_admin')) {
      args.push(user.organizationId);
      scope = `c.organization_id = $${args.length}`;
    }
    const rows = await dbQuery<AssignmentRow>(
      `SELECT a.id, a.cohort_id, c.name AS cohort_name, a.item_type, a.item_id, a.title,
              COALESCE(t.title, q.stem) AS item_title, a.due_at, a.created_at,
              COUNT(DISTINCT pa.id)::text AS attempt_count,
              COUNT(DISTINCT pa.id) FILTER (WHERE pa.passed)::text AS passed_count
         FROM practice_assignments a
         JOIN cohorts c ON c.id = a.cohort_id AND c.deleted_at IS NULL
         LEFT JOIN practice_task_templates t ON a.item_type = 'task_template' AND t.id = a.item_id
         LEFT JOIN practice_question_items q ON a.item_type = 'question_item' AND q.id = a.item_id
         LEFT JOIN enrollments e ON e.cohort_id = a.cohort_id AND e.status = 'active'
         LEFT JOIN practice_attempts pa ON pa.user_id = e.user_id AND pa.item_id = a.item_id AND pa.item_type = a.item_type
        WHERE ${scope}
        GROUP BY a.id, c.name, t.title, q.stem
        ORDER BY a.created_at DESC`,
      ...args,
    );
    return ok({ items: rows.map(row => ({
      id: row.id,
      cohortId: row.cohort_id,
      cohortName: row.cohort_name,
      itemType: row.item_type,
      itemId: row.item_id,
      title: row.title ?? row.item_title ?? '练习作业',
      dueAt: row.due_at,
      createdAt: row.created_at,
      attemptCount: Number(row.attempt_count),
      passedCount: Number(row.passed_count),
    })), total: rows.length });
  } catch (error) {
    return catchError(error);
  }
}

/** POST /api/teacher/assignments */
export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['teacher', 'school_admin', 'super_admin']);
    const body = await parseBody(request, createSchema);
    await assertTeacherCohortAccess(user, body.cohortId);
    const cohort = await dbOne<{ organization_id: string }>(
      'SELECT organization_id FROM cohorts WHERE id = $1 AND deleted_at IS NULL', body.cohortId,
    );
    if (!cohort) throw new ApiError(404, '班级不存在');
    if (!user.roles.includes('super_admin') && cohort.organization_id !== user.organizationId) throw new ApiError(403, '不能操作其他机构班级');

    const sourceTable = body.itemType === 'task_template' ? 'practice_task_templates' : 'practice_question_items';
    const item = await dbOne<{ id: string; organization_id: string | null; review_status: string }>(
      `SELECT id, organization_id, review_status FROM ${sourceTable} WHERE id = $1 AND deleted_at IS NULL`, body.itemId,
    );
    if (!item || item.review_status !== 'published') throw new ApiError(400, '只能布置已发布的练习内容');
    if (item.organization_id && item.organization_id !== cohort.organization_id) throw new ApiError(403, '练习内容不属于该机构');

    const duplicate = await dbOne<{ id: string }>(
      `SELECT id FROM practice_assignments WHERE cohort_id = $1 AND item_type = $2 AND item_id = $3`,
      body.cohortId, body.itemType, body.itemId,
    );
    if (duplicate) throw new ApiError(409, '该练习已布置给此班级');

    const row = await dbOne<{ id: string }>(
      `INSERT INTO practice_assignments (cohort_id, item_type, item_id, title, assigned_by, due_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      body.cohortId, body.itemType, body.itemId, body.title ?? null, user.id, body.dueAt ?? null,
    );
    await insertAudit({ actorId: user.id, actorRole: user.roles[0], action: 'practice.assignment.create', entityType: 'practice_assignment', entityId: row?.id ?? null, organizationId: cohort.organization_id, details: JSON.stringify(body) });
    return ok({ id: row?.id }, { status: 201 });
  } catch (error) {
    return catchError(error);
  }
}
