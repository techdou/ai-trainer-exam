import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, fail } from '@/lib/api';

/** GET /api/student/exams - 列出学员可参加的考试 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['student', 'super_admin', 'teacher']);

    // 获取学员所在班级的考试安排
    const schedules = await dbQuery<{
      id: string;
      title: string;
      exam_start_at: string;
      exam_end_at: string;
      late_entry_minutes: number;
      status: string;
      paper_id: string | null;
    }>(`
      SELECT s.id, s.title, s.exam_start_at, s.exam_end_at, s.late_entry_minutes, s.status, s.paper_id
      FROM exam_schedules s
      INNER JOIN enrollments e ON e.cohort_id = s.cohort_id AND e.user_id = $1
      WHERE s.deleted_at IS NULL
      ORDER BY s.exam_start_at DESC
    `, user.id);

    // 为每个考试获取学员的尝试状态
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

      const now = Date.now();
      const startAt = new Date(s.exam_start_at).getTime();
      const endAt = new Date(s.exam_end_at).getTime();
      const isOpen = now >= startAt && now <= endAt;
      const isUpcoming = now < startAt;
      const isClosed = now > endAt;

      let timeStatus: 'upcoming' | 'open' | 'closed' = 'closed';
      if (isUpcoming) timeStatus = 'upcoming';
      else if (isOpen) timeStatus = 'open';

      return {
        id: s.id,
        title: s.title,
        examOpenAt: s.exam_start_at,
        examCloseAt: s.exam_end_at,
        durationMinutes: s.late_entry_minutes,
        timeStatus,
        attempt: attempts[0] ? {
          id: attempts[0].id,
          status: attempts[0].status,
          startedAt: attempts[0].started_at,
          submittedAt: attempts[0].submitted_at,
        } : null,
      };
    }));

    return ok(examsWithStatus);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    const status = msg.includes('请先登录') ? 401 : msg.includes('权限') ? 403 : 500;
    return fail(status, status === 500 ? '服务器开小差了，请稍后再试' : msg);
  }
}
