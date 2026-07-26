import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbNow, dbOne, dbExec } from '@/server/db';
import { handler, ok, fail, parseBody } from '@/lib/api';
import { getScheduleForStudent } from '@/server/exam-security';

export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['student']);
  const body = await parseBody(request, z.object({ scheduleId:z.string().min(1),attemptId:z.string().min(1),clientOffsetMs:z.number().int().min(-86_400_000).max(86_400_000).optional() }));
  const schedule = await getScheduleForStudent(body.scheduleId,user.id);
  if (!schedule) return fail(404,'考试不存在');
  const attempt = await dbOne<{ id:string;status:string;server_deadline:Date|null }>('SELECT id,status,server_deadline FROM exam_attempts WHERE id=$1 AND schedule_id=$2 AND user_id=$3',body.attemptId,body.scheduleId,user.id);
  if (!attempt) return fail(404,'考试记录不存在');
  await dbExec(`UPDATE exam_attempts SET last_heartbeat_at=NOW(),updated_at=NOW() WHERE id=$1`,attempt.id);
  await dbExec(`INSERT INTO exam_heartbeats (attempt_id,server_at,client_offset_ms,status,created_at) VALUES ($1,NOW(),$2,$3,NOW())`,attempt.id,body.clientOffsetMs??null,attempt.status==='in_progress'?'ok':'closed');
  return ok({ status:attempt.status,serverAt:(await dbNow()).toISOString(),serverDeadline:attempt.server_deadline });
});
