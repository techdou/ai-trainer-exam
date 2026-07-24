import { z } from 'zod';
import { ApiError, requireRole } from '@/server/auth';
import { dbTx } from '@/server/db';
import { handler, ok, fail, parseBody } from '@/lib/api';
import { assertAttemptOpen, getScheduleForStudent, lockAttempt } from '@/server/exam-security';

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

  // 事务内锁定 attempt 行,并以事务时间(数据库时间)做宽限校验,避免并发双写与进程时钟漂移。
  // 校验失败抛 ApiError 回滚事务,不落任何部分保存。
  const serverAt = await dbTx(async client => {
    const attempt = await lockAttempt(client, body.attemptId, user.id, body.scheduleId);
    if (!attempt) throw new ApiError(404, '考试记录不存在');
    const now = (await client.query<{ now: Date }>('SELECT now() AS now')).rows[0].now;
    assertAttemptOpen(attempt, schedule, now.getTime());

    const validIds = new Set(
      (await client.query<{ id: string }>('SELECT id FROM exam_paper_items WHERE paper_id=$1', [schedule.paper_id])).rows.map(row => row.id),
    );
    for (const item of body.responses) {
      if (!validIds.has(item.itemId)) throw new ApiError(400, '提交包含不属于本试卷的题目');
      await client.query(
        `INSERT INTO exam_responses (attempt_id,item_id,item_type,response,workspace_snapshot,saved_at,created_at,updated_at)
         SELECT $1,$2,i.item_type,$3,$4,NOW(),NOW(),NOW() FROM exam_paper_items i WHERE i.id=$2 AND i.paper_id=$5
         ON CONFLICT (attempt_id,item_id) DO UPDATE SET response=EXCLUDED.response,workspace_snapshot=EXCLUDED.workspace_snapshot,saved_at=NOW(),updated_at=NOW()`,
        [attempt.id, item.itemId, JSON.stringify(item.response ?? {}), JSON.stringify(item.workspaceSnapshot ?? {}), schedule.paper_id],
      );
    }
    await client.query(`UPDATE exam_attempts SET last_heartbeat_at=NOW(),updated_at=NOW() WHERE id=$1`, [attempt.id]);
    return now;
  });

  return ok({ saved: body.responses.length, serverAt: serverAt.toISOString() });
});
