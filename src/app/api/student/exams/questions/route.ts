import { requireRole } from '@/server/auth';
import { dbOne, dbQuery } from '@/server/db';
import { handler, ok, fail } from '@/lib/api';
import { assertAttemptOpen, getScheduleForStudent } from '@/server/exam-security';

export const GET = handler(async (request: Request) => {
  const user = await requireRole(request, ['student']);
  const scheduleId = new URL(request.url).searchParams.get('scheduleId');
  if (!scheduleId) return fail(400, '缺少 scheduleId');
  const schedule = await getScheduleForStudent(scheduleId, user.id);
  if (!schedule) return fail(404, '考试不存在或您未被安排参加');
  const attempt = await dbOne<{ id: string; status: string; server_deadline: Date | null }>(
    `SELECT id,status,server_deadline FROM exam_attempts WHERE schedule_id=$1 AND user_id=$2`, scheduleId,user.id,
  );
  if (!attempt) return fail(409, '请先点击“开始考试”');
  assertAttemptOpen(attempt, schedule);

  const items = await dbQuery<{
    id: string; item_type: string; sort_order: number; score: number; section: string;
    item_snapshot: Record<string, unknown>; asset_checksum: string | null;
  }>(
    `SELECT id,item_type,sort_order,score,section,item_snapshot,asset_checksum
       FROM exam_paper_items WHERE paper_id=$1 ORDER BY sort_order`, schedule.paper_id,
  );
  if (!items.length) return fail(409, '试卷为空，请联系考务人员');
  const saved = await dbQuery<{ item_id: string; response: unknown; saved_at: Date }>(
    `SELECT item_id,response,saved_at FROM exam_responses WHERE attempt_id=$1`, attempt.id,
  );
  return ok({
    attemptId: attempt.id,
    scheduleId,
    serverNow: new Date().toISOString(),
    serverDeadline: attempt.server_deadline,
    durationMinutes: schedule.duration_minutes,
    items: items.map(item => ({
      id: item.id,
      sourceItemId: item.item_snapshot?.sourceItemId ?? null,
      itemType: item.item_type,
      sortOrder: item.sort_order,
      score: Number(item.score),
      section: item.section,
      content: item.item_snapshot,
      assetChecksum: item.asset_checksum,
    })),
    savedResponses: Object.fromEntries(saved.map(row => [row.item_id, row.response])),
  });
});
