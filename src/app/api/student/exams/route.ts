import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, fail } from '@/lib/api';

/** GET /api/student/exams - 列出学员可参加的考试 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['student', 'super_admin', 'teacher']);

    // 获取学员所在班级的考试安排（关联试卷获取时长）
    const schedules = await dbQuery<{
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
    }>(`
      SELECT s.id, s.title, s.exam_start_at, s.exam_end_at,
             s.late_entry_minutes, s.submit_grace_seconds,
             s.status, s.paper_id, s.results_released,
             p.duration_minutes
      FROM exam_schedules s
      INNER JOIN enrollments e ON e.cohort_id = s.cohort_id AND e.user_id = $1
      LEFT JOIN exam_papers p ON p.id = s.paper_id
      WHERE s.deleted_at IS NULL
      ORDER BY s.exam_start_at DESC
    `, user.id);

    // 为每个考试获取学员的尝试状态和成绩
    const examsWithStatus = await Promise.all(schedules.map(async (s) => {
      const attempts = await dbQuery<{
        id: string;
        status: string;
        started_at: string;
        submitted_at: string | null;
      }>(`
        SELECT id, status, started_at, submitted_at
        FROM exam_attempts
        WHERE user_id = $1 AND schedule_id = $2
        ORDER BY started_at DESC LIMIT 1
      `, user.id, s.id);

      // 获取成绩
      let score: number | null = null;
      let passed: boolean | null = null;
      if (attempts[0] && (attempts[0].status === 'graded' || attempts[0].status === 'submitted') && s.results_released) {
        const scores = await dbQuery<{ total_score: number; passed: boolean }>(
          `SELECT total_score, passed FROM exam_scores WHERE attempt_id = $1`,
          attempts[0].id,
        );
        if (scores[0]) {
          score = Number(scores[0].total_score);
          passed = scores[0].passed;
        }
      }

      const now = Date.now();
      const startAt = new Date(s.exam_start_at).getTime();
      const endAt = new Date(s.exam_end_at).getTime() + (s.submit_grace_seconds ?? 60) * 1000;
      const lateEntryAt = startAt + (s.late_entry_minutes ?? 15) * 60 * 1000;
      const isOpen = now >= startAt && now <= endAt;
      const isUpcoming = now < startAt;
      const canEnter = now >= startAt && now <= lateEntryAt;

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
        attempt: attempts[0] ? {
          id: attempts[0].id,
          status: attempts[0].status,
          startedAt: attempts[0].started_at,
          submittedAt: attempts[0].submitted_at,
        } : null,
        score,
        passed,
      };
    }));

    return ok(examsWithStatus);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    const status = msg.includes('请先登录') ? 401 : msg.includes('权限') ? 403 : 500;
    return fail(status, status === 500 ? '服务器开小差了，请稍后再试' : msg);
  }
}
