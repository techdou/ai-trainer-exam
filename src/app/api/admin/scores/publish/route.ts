import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbOne, dbTx } from '@/server/db';
import { ok, fail, catchError, parseBody } from '@/lib/api';
import { assertOrganizationScope } from '@/server/exam-security';

const schema = z.object({ scheduleId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);
    const { scheduleId } = await parseBody(req, schema);
    const schedule = await dbOne<{ organization_id: string | null; status: string }>('SELECT organization_id,status FROM exam_schedules WHERE id=$1 AND deleted_at IS NULL', scheduleId);
    if (!schedule) return fail(404, '考试安排不存在');
    assertOrganizationScope(user, schedule.organization_id);
    if (!['grading', 'results_pending', 'exam_closed'].includes(schedule.status)) return fail(409, '当前考试状态不能发布成绩');

    const publishedCount = await dbTx(async client => {
      const result = await client.query(
        `UPDATE exam_scores SET status='published',updated_at=NOW()
          WHERE schedule_id=$1 AND status IN ('auto_graded','reviewed','pending')`, [scheduleId]);
      await client.query(`UPDATE exam_schedules SET results_released=true,status='results_released',results_release_at=COALESCE(results_release_at,NOW()),updated_at=NOW() WHERE id=$1`, [scheduleId]);
      await client.query(`INSERT INTO audit_logs(actor_id,actor_role,organization_id,action,entity_type,entity_id,detail)
                          VALUES($1,$2,$3,'scores_publish','exam_schedule',$4,$5)`,
        [user.id, user.roles[0] ?? null, schedule.organization_id, scheduleId, { publishedCount: result.rowCount ?? 0 }]);
      return result.rowCount ?? 0;
    });
    return ok({ scheduleId, publishedCount });
  } catch (error) { return catchError(error); }
}
