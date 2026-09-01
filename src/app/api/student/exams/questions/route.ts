import { requireRole } from '@/server/auth';
import { dbNow, dbOne, dbQuery } from '@/server/db';
import { handler, ok, fail } from '@/lib/api';
import { assertAttemptOpen, getScheduleForStudent } from '@/server/exam-security';
import { resolveImageUrl } from '@/server/object-storage';

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
  const now = await dbNow();
  // 已交卷(graded/expired 等)允许只读回看本人作答——数据本就完整保存, 学员翻看自己做过什么属合理诉求;
  // 响应里解析/知识点已无条件删除, 不泄露答案。未交卷才做开放时间断言。
  const attemptStatus = attempt.status;
  const readonlyView = !['not_started', 'in_progress'].includes(attemptStatus);
  if (!readonlyView) assertAttemptOpen(attempt, schedule, now.getTime());

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
    attemptStatus,
    scheduleId,
    serverNow: now.toISOString(),
    serverDeadline: attempt.server_deadline,
    durationMinutes: schedule.duration_minutes,
    items: items.map(item => {
      // 考试进行中不得下发 explanation/knowledgePoint: 解析通常直接揭示答案,
      // 前端虽不渲染, 但响应体在 Network 面板明文可见。成绩发布后才可展示解析。
      const content = { ...(item.item_snapshot as Record<string, unknown>) };
      delete content.explanation;
      delete content.knowledgePoint;
      // 与练习端 task 接口同构: config.imageUrl 里的 asset: 引用要解析成代理 URL,否则考试端碎图。
      if (item.item_type === 'task' && content.config && typeof content.config === 'object') {
        const cfg = content.config as Record<string, unknown>;
        if (typeof cfg.imageUrl === 'string') cfg.imageUrl = resolveImageUrl(cfg.imageUrl);
      }
      return {
        id: item.id,
        sourceItemId: item.item_snapshot?.sourceItemId ?? null,
        itemType: item.item_type,
        sortOrder: item.sort_order,
        score: Number(item.score),
        section: item.section,
        content,
        assetChecksum: item.asset_checksum,
      };
    }),
    savedResponses: Object.fromEntries(saved.map(row => [row.item_id, row.response])),
  });
});
