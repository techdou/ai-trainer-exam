import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbOne, dbTx } from '@/server/db';
import { handler, ok, parseBody, fail } from '@/lib/api';
import { assertScheduleCanStart, attemptDeadline, getScheduleForStudent } from '@/server/exam-security';

const schema = z.object({ scheduleId: z.string().min(1).max(100) });

export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['student']);
  const { scheduleId } = await parseBody(request, schema);
  const schedule = await getScheduleForStudent(scheduleId, user.id);
  if (!schedule) return fail(404, '考试不存在或您未被安排参加');

  const existing = await dbOne<{ id: string; status: string; server_deadline: Date | null }>(
    `SELECT id,status,server_deadline FROM exam_attempts WHERE schedule_id=$1 AND user_id=$2`,
    scheduleId, user.id,
  );
  if (existing) {
    if (existing.status === 'in_progress') {
      const deadline = existing.server_deadline ? new Date(existing.server_deadline).getTime() : new Date(schedule.exam_end_at).getTime();
      if (Date.now() > deadline + schedule.submit_grace_seconds * 1000) return fail(409, '考试已结束，请联系考务人员处理');
      return ok({ attemptId: existing.id, resumed: true, serverDeadline: existing.server_deadline });
    }
    return fail(409, '该考试已经提交，不能再次开始');
  }

  assertScheduleCanStart(schedule);
  const deadline = attemptDeadline(schedule);
  const attemptId = await dbTx(async client => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO exam_attempts
        (schedule_id,user_id,status,started_at,server_deadline,last_heartbeat_at,ip,created_at,updated_at)
       VALUES ($1,$2,'in_progress',NOW(),$3,NOW(),$4,NOW(),NOW())
       ON CONFLICT (schedule_id,user_id) DO NOTHING RETURNING id`,
      [scheduleId, user.id, deadline, request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null],
    );
    if (result.rows[0]) return result.rows[0].id;
    const row = await client.query<{ id: string; status: string }>('SELECT id,status FROM exam_attempts WHERE schedule_id=$1 AND user_id=$2 FOR UPDATE', [scheduleId,user.id]);
    if (!row.rows[0] || row.rows[0].status !== 'in_progress') throw new Error('考试记录状态异常');
    return row.rows[0].id;
  });
  return ok({ attemptId, resumed: false, serverDeadline: deadline.toISOString() });
});
