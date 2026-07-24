import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbOne, dbExec, dbQuery } from '@/server/db';
import { handler, ok, fail, parseBody } from '@/lib/api';
import { assertAttemptOpen, getScheduleForStudent } from '@/server/exam-security';

const schema = z.object({
  scheduleId: z.string().min(1),
  attemptId: z.string().min(1),
  responses: z.array(z.object({ itemId: z.string().min(1), response: z.unknown(), workspaceSnapshot: z.unknown().optional() })).max(300),
});

export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['student']);
  const body = await parseBody(request, schema);
  const schedule = await getScheduleForStudent(body.scheduleId, user.id);
  if (!schedule) return fail(404, '考试不存在');
  const attempt = await dbOne<{ id: string; status: string; server_deadline: Date | null }>(
    `SELECT id,status,server_deadline FROM exam_attempts WHERE id=$1 AND schedule_id=$2 AND user_id=$3`,
    body.attemptId,body.scheduleId,user.id,
  );
  if (!attempt) return fail(404, '考试记录不存在');
  assertAttemptOpen(attempt, schedule);
  const validIds = new Set((await dbQuery<{ id: string }>('SELECT id FROM exam_paper_items WHERE paper_id=$1', schedule.paper_id)).map(row => row.id));
  for (const item of body.responses) {
    if (!validIds.has(item.itemId)) return fail(400, '提交包含不属于本试卷的题目');
    await dbExec(
      `INSERT INTO exam_responses (attempt_id,item_id,item_type,response,workspace_snapshot,saved_at,created_at,updated_at)
       SELECT $1,$2,i.item_type,$3,$4,NOW(),NOW(),NOW() FROM exam_paper_items i WHERE i.id=$2 AND i.paper_id=$5
       ON CONFLICT (attempt_id,item_id) DO UPDATE SET response=EXCLUDED.response,workspace_snapshot=EXCLUDED.workspace_snapshot,saved_at=NOW(),updated_at=NOW()`,
      attempt.id,item.itemId,JSON.stringify(item.response ?? {}),JSON.stringify(item.workspaceSnapshot ?? {}),schedule.paper_id,
    );
  }
  await dbExec(`UPDATE exam_attempts SET last_heartbeat_at=NOW(),updated_at=NOW() WHERE id=$1`, attempt.id);
  return ok({ saved: body.responses.length, serverAt: new Date().toISOString() });
});

