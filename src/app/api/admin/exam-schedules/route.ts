import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import { ok, fail } from '@/lib/api';

/** GET /api/admin/exam-schedules - 列出考务安排 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin', 'invigilator']);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    let whereClause = 'WHERE s.deleted_at IS NULL';
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status) {
      whereClause += ` AND s.status = $${paramIdx++}`;
      params.push(status);
    }

    if (user.organizationId && !user.roles.includes('super_admin')) {
      whereClause += ` AND s.organization_id = $${paramIdx++}`;
      params.push(user.organizationId);
    }

    const schedules = await dbQuery<{
      id: string;
      title: string;
      organization_id: string;
      paper_id: string;
      cohort_id: string;
      cohort_name: string;
      paper_title: string | null;
      exam_start_at: string;
      exam_end_at: string;
      late_entry_minutes: number;
      submit_grace_seconds: number;
      duration_minutes: number | null;
      status: string;
      results_released: boolean;
      created_at: string;
      attempt_count: string;
    }>(
      `SELECT s.id, s.title, s.organization_id, s.paper_id, s.cohort_id,
              c.name as cohort_name,
              p.title as paper_title,
              p.duration_minutes,
              s.exam_start_at, s.exam_end_at, s.late_entry_minutes, s.submit_grace_seconds,
              s.status, s.results_released, s.created_at,
              (SELECT COUNT(*)::text FROM exam_attempts a WHERE a.schedule_id = s.id) as attempt_count
       FROM exam_schedules s
       INNER JOIN cohorts c ON c.id = s.cohort_id
       LEFT JOIN exam_papers p ON p.id = s.paper_id
       ${whereClause}
       ORDER BY s.exam_start_at DESC`,
      ...params,
    );

    return ok(schedules.map(s => ({
      id: s.id,
      title: s.title,
      organizationId: s.organization_id,
      paperId: s.paper_id,
      cohortId: s.cohort_id,
      cohortName: s.cohort_name,
      paperTitle: s.paper_title,
      examStartAt: s.exam_start_at,
      examEndAt: s.exam_end_at,
      lateEntryMinutes: s.late_entry_minutes,
      submitGraceSeconds: s.submit_grace_seconds,
      durationMinutes: s.duration_minutes,
      status: s.status,
      resultsReleased: s.results_released,
      attemptCount: parseInt(s.attempt_count, 10),
      createdAt: s.created_at,
    })));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return fail(500, '服务器开小差了，请稍后再试');
  }
}

/** POST /api/admin/exam-schedules - 创建考务安排 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);
    const body = await req.json() as {
      title?: string;
      cohortId?: string;
      paperId?: string;
      examStartAt?: string;
      examEndAt?: string;
      lateEntryMinutes?: number;
      submitGraceSeconds?: number;
    };

    const { title, cohortId, paperId, examStartAt, examEndAt, lateEntryMinutes, submitGraceSeconds } = body;
    if (!title || !cohortId || !paperId || !examStartAt || !examEndAt) {
      return fail(400, '缺少必填参数');
    }

    const rows = await dbQuery<{ id: string }>(
      `INSERT INTO exam_schedules (organization_id, title, cohort_id, paper_id, exam_start_at, exam_end_at, late_entry_minutes, submit_grace_seconds, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
       RETURNING id`,
      user.organizationId || '00000000-0000-0000-0000-000000000001',
      title, cohortId, paperId, examStartAt, examEndAt,
      lateEntryMinutes ?? 15, submitGraceSeconds ?? 60, user.id,
    );

    return ok({ id: rows[0]?.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return fail(500, '创建失败');
  }
}

/** PATCH /api/admin/exam-schedules - 更新考务安排（发布/结束/释放成绩等） */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);
    const body = await req.json() as {
      scheduleId?: string;
      status?: string;
      resultsReleased?: boolean;
    };

    const { scheduleId, status, resultsReleased } = body;
    if (!scheduleId) return fail(400, '缺少 scheduleId');

    if (status) {
      await dbExec(
        `UPDATE exam_schedules SET status = $1, updated_at = NOW() WHERE id = $2`,
        status, scheduleId,
      );
    }

    if (resultsReleased !== undefined) {
      await dbExec(
        `UPDATE exam_schedules SET results_released = $1, updated_at = NOW() WHERE id = $2`,
        resultsReleased, scheduleId,
      );
    }

    return ok({ updated: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return fail(500, '更新失败');
  }
}
