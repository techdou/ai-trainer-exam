import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import { ok, fail } from '@/lib/api';

/**
 * POST /api/student/exams/start
 *
 * 学员开始考试，创建 exam_attempt
 * 请求体: { scheduleId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['student']);

    const body = await request.json() as { scheduleId?: string };
    const { scheduleId } = body;
    if (!scheduleId) {
      return fail(400, '缺少 scheduleId');
    }

    // 1. 验证考试时间和权限
    const schedules = await dbQuery<{
      id: string;
      exam_start_at: string;
      exam_end_at: string;
      late_entry_minutes: number;
      submit_grace_seconds: number;
      status: string;
    }>(
      `SELECT id, exam_start_at, exam_end_at, late_entry_minutes, submit_grace_seconds, status
       FROM exam_schedules WHERE id = $1 AND deleted_at IS NULL`,
      scheduleId,
    );

    if (schedules.length === 0) {
      return fail(404, '考试安排不存在');
    }

    const schedule = schedules[0];
    const now = Date.now();
    const startAt = new Date(schedule.exam_start_at).getTime();
    const lateEntryAt = startAt + (schedule.late_entry_minutes ?? 15) * 60 * 1000;
    const endAt = new Date(schedule.exam_end_at).getTime();

    if (now < startAt) {
      return fail(400, '考试尚未开始');
    }
    if (now > lateEntryAt) {
      return fail(400, '已超过迟到入场时间');
    }

    // 2. 检查学员是否在该考试的班级中
    const enrollments = await dbQuery<{ cohort_id: string }>(
      `SELECT e.cohort_id FROM enrollments e
       INNER JOIN exam_schedules s ON s.cohort_id = e.cohort_id
       WHERE e.user_id = $1 AND s.id = $2`,
      user.id, scheduleId,
    );

    if (enrollments.length === 0) {
      return fail(403, '您没有参加该考试的权限');
    }

    // 3. 检查是否已有未完成的 attempt
    const existingAttempts = await dbQuery<{ id: string; status: string }>(
      `SELECT id, status FROM exam_attempts
       WHERE user_id = $1 AND schedule_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      user.id, scheduleId,
    );

    if (existingAttempts.length > 0) {
      const existing = existingAttempts[0];
      if (existing.status === 'in_progress' || existing.status === 'not_started') {
        // 已有进行中的 attempt，直接返回
        return ok({ attemptId: existing.id, resumed: true });
      }
      if (existing.status === 'submitted' || existing.status === 'graded') {
        return fail(400, '您已提交过该考试');
      }
    }

    // 4. 创建新 attempt
    const serverDeadline = new Date(endAt + (schedule.submit_grace_seconds ?? 60) * 1000);
    const attemptRows = await dbQuery<{ id: string }>(
      `INSERT INTO exam_attempts (user_id, schedule_id, status, started_at, server_deadline)
       VALUES ($1, $2, 'in_progress', NOW(), $3)
       RETURNING id`,
      user.id, scheduleId, serverDeadline.toISOString(),
    );

    const attemptId = attemptRows[0]?.id;
    if (!attemptId) {
      return fail(500, '创建考试记录失败');
    }

    return ok({ attemptId, resumed: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    if (msg.includes('401') || msg.includes('403')) {
      const code = msg.includes('401') ? 401 : 403;
      return fail(code, msg);
    }
    console.error('开始考试失败:', e);
    return fail(500, '服务器开小差了，请稍后再试');
  }
}
