import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import {ok, catchError } from '@/lib/api';

/** GET /api/student/exams - 列出学员可参加的考试 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['student', 'super_admin', 'teacher']);

    // 单条查询取回 考试安排+最新 attempt+成绩(LATERAL 避免逐场 N+1, 班级并发时不打爆连接池)。
    // 成绩暴露条件仍在下方 JS 层判断: 仅 graded/submitted 且 results_released 时才带出分数。
    const rows = await dbQuery<{
      id: string;
      title: string;
      exam_start_at: string;
      exam_end_at: string;
      late_entry_minutes: number;
      submit_grace_seconds: number;
      duration_minutes: number | null;
      status: string;
      paper_id: string | null;
      results_released: boolean;
      attempt_id: string | null;
      attempt_status: string | null;
      attempt_started_at: string | null;
      attempt_submitted_at: string | null;
      total_score: string | null;
      passed: boolean | null;
    }>(`
      SELECT s.id, s.title, s.exam_start_at, s.exam_end_at,
             s.late_entry_minutes, s.submit_grace_seconds,
             s.status, s.paper_id, s.results_released,
             p.duration_minutes,
             a.id AS attempt_id, a.status AS attempt_status,
             a.started_at AS attempt_started_at, a.submitted_at AS attempt_submitted_at,
             sc.total_score::text, sc.passed
      FROM exam_schedules s
      INNER JOIN enrollments e ON e.cohort_id = s.cohort_id AND e.user_id = $1 AND e.status = 'active'
      LEFT JOIN exam_papers p ON p.id = s.paper_id
      LEFT JOIN LATERAL (
        SELECT id, status, started_at, submitted_at
        FROM exam_attempts
        WHERE user_id = $1 AND schedule_id = s.id
        ORDER BY started_at DESC LIMIT 1
      ) a ON true
      LEFT JOIN exam_scores sc ON sc.attempt_id = a.id
      WHERE s.deleted_at IS NULL AND s.status NOT IN ('draft', 'archived')
      ORDER BY s.exam_start_at DESC
    `, user.id);

    const examsWithStatus = rows.map((s) => {
      const hasAttempt = s.attempt_id !== null;
      const showScore = hasAttempt
        && (s.attempt_status === 'graded' || s.attempt_status === 'submitted')
        && s.results_released
        && s.total_score !== null;

      const now = Date.now();
      const startAt = new Date(s.exam_start_at).getTime();
      const endAt = new Date(s.exam_end_at).getTime() + (s.submit_grace_seconds ?? 60) * 1000;
      const lateEntryAt = startAt + (s.late_entry_minutes ?? 15) * 60 * 1000;
      const isOpen = now >= startAt && now <= endAt;
      const isUpcoming = now < startAt;
      const canEnter = s.attempt_status === 'in_progress' ? now <= endAt : now >= startAt && now <= lateEntryAt;

      let timeStatus: 'upcoming' | 'open' | 'closed' = 'closed';
      if (isUpcoming) timeStatus = 'upcoming';
      else if (isOpen) timeStatus = 'open';

      return {
        id: s.id,
        title: s.title,
        examStartAt: s.exam_start_at,
        examEndAt: s.exam_end_at,
        durationMinutes: s.duration_minutes ?? 90,
        lateEntryMinutes: s.late_entry_minutes,
        timeStatus,
        canEnter,
        attempt: hasAttempt ? {
          id: s.attempt_id,
          status: s.attempt_status,
          startedAt: s.attempt_started_at,
          submittedAt: s.attempt_submitted_at,
        } : null,
        score: showScore ? Number(s.total_score) : null,
        passed: showScore ? s.passed : null,
      };
    });

    return ok(examsWithStatus);
  } catch (e: unknown) {
    return catchError(e);
  }
}
