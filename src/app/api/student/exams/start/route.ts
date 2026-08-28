import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbTx } from '@/server/db';
import { handler, ok, parseBody, fail } from '@/lib/api';
import { assertScheduleCanStart, attemptDeadline, expireOverdueAttempts, getScheduleForStudent } from '@/server/exam-security';

const schema = z.object({ scheduleId: z.string().min(1).max(100) });
type StartResult =
  | { kind: 'error'; response: Response }
  | { kind: 'success'; attemptId: string; resumed: boolean; serverDeadline: Date | string | null };

export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['student']);
  const { scheduleId } = await parseBody(request, schema);
  const schedule = await getScheduleForStudent(scheduleId, user.id);
  if (!schedule) return fail(404, '考试不存在或您未被安排参加');

  const result = await dbTx<StartResult>(async client => {
    const scheduleResult = await client.query<{
      status: typeof schedule.status;
      exam_start_at: Date;
      exam_end_at: Date;
      late_entry_minutes: number;
      submit_grace_seconds: number;
      results_released: boolean;
    }>(
      `SELECT status,exam_start_at,exam_end_at,late_entry_minutes,submit_grace_seconds,results_released
         FROM exam_schedules
        WHERE id=$1 AND deleted_at IS NULL
        FOR UPDATE`,
      [scheduleId],
    );
    const locked = scheduleResult.rows[0];
    if (!locked) return { kind: 'error', response: fail(404, '考试安排不存在') };
    const lockedSchedule = { ...schedule, ...locked };
    const now = (await client.query<{ now: Date }>('SELECT now() AS now')).rows[0].now.getTime();
    const existingResult = await client.query<{ id: string; status: string; server_deadline: Date | null }>(
      `SELECT id,status,server_deadline
         FROM exam_attempts
        WHERE schedule_id=$1 AND user_id=$2
        FOR UPDATE`,
      [scheduleId, user.id],
    );
    const existing = existingResult.rows[0];
    if (existing) {
      if (existing.status === 'in_progress') {
        if (locked.results_released || ['results_released', 'archived'].includes(locked.status)) {
          return { kind: 'error', response: fail(409, '成绩已发布，不能继续考试') };
        }
        const deadline = existing.server_deadline ? new Date(existing.server_deadline).getTime() : new Date(lockedSchedule.exam_end_at).getTime();
        if (now > deadline + lockedSchedule.submit_grace_seconds * 1000) {
          // 超宽限的断线 attempt 直接落 expired 终态(0 分缺考),不再永久卡在 in_progress 阻塞成绩发布。
          await expireOverdueAttempts(client, scheduleId);
          return { kind: 'error', response: fail(409, '考试已结束：超过交卷宽限时间未交卷，按缺考处理（0 分）') };
        }
        return { kind: 'success', attemptId: existing.id, resumed: true, serverDeadline: existing.server_deadline };
      }
      if (existing.status === 'not_started') {
        assertScheduleCanStart(lockedSchedule, now);
        const deadline = attemptDeadline(lockedSchedule, now);
        await client.query(
          `UPDATE exam_attempts SET status='in_progress', started_at=NOW(), server_deadline=$1, last_heartbeat_at=NOW(), updated_at=NOW()
            WHERE id=$2 AND status='not_started'`,
          [deadline, existing.id],
        );
        return { kind: 'success', attemptId: existing.id, resumed: false, serverDeadline: deadline.toISOString() };
      }
      return { kind: 'error', response: fail(409, '该考试已经提交，不能再次开始') };
    }

    assertScheduleCanStart(lockedSchedule, now);
    const deadline = attemptDeadline(lockedSchedule, now);
    const result = await client.query<{ id: string }>(
      `INSERT INTO exam_attempts
        (schedule_id,user_id,status,started_at,server_deadline,last_heartbeat_at,ip,created_at,updated_at)
       VALUES ($1,$2,'in_progress',NOW(),$3,NOW(),$4,NOW(),NOW())
       ON CONFLICT (schedule_id,user_id) DO NOTHING RETURNING id`,
      [scheduleId, user.id, deadline, request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null],
    );
    if (result.rows[0]) return { kind: 'success', attemptId: result.rows[0].id, resumed: false, serverDeadline: deadline.toISOString() };
    const row = await client.query<{ id: string; status: string }>('SELECT id,status FROM exam_attempts WHERE schedule_id=$1 AND user_id=$2 FOR UPDATE', [scheduleId,user.id]);
    if (!row.rows[0] || row.rows[0].status !== 'in_progress') throw new Error('考试记录状态异常');
    return { kind: 'success', attemptId: row.rows[0].id, resumed: true, serverDeadline: deadline.toISOString() };
  });
  if (result.kind === 'error') return result.response;
  return ok({ attemptId: result.attemptId, resumed: result.resumed, serverDeadline: result.serverDeadline });
});
