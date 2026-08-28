import { NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, requireRole } from '@/server/auth';
import { dbTx, dbQuery } from '@/server/db';
import { ok, catchError, parseBody } from '@/lib/api';
import { assertOrganizationScope, expireOverdueAttempts } from '@/server/exam-security';
import { awardExamPass } from '@/server/gamification';

const schema = z.object({ scheduleId: z.string().uuid() });

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);
    const { scheduleId } = await parseBody(req, schema);
    const publishedCount = await dbTx(async client => {
      const scheduleResult = await client.query<{ organization_id: string | null; status: string; results_released: boolean }>(
        `SELECT organization_id,status,results_released
           FROM exam_schedules
          WHERE id=$1 AND deleted_at IS NULL
          FOR UPDATE`,
        [scheduleId],
      );
      const schedule = scheduleResult.rows[0];
      if (!schedule) throw new ApiError(404, '考试安排不存在');
      assertOrganizationScope(user, schedule.organization_id);
      if (schedule.results_released) throw new ApiError(409, '成绩已经发布');
      if (!['grading', 'results_pending', 'exam_closed'].includes(schedule.status)) {
        throw new ApiError(409, '当前考试状态不能发布成绩');
      }
      // 断线/超时未交卷的 attempt 先落 expired 终态(按 0 分缺考生成成绩),解除对发布的永久阻塞。
      const expiredCount = await expireOverdueAttempts(client, scheduleId);
      const active = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM exam_attempts
          WHERE schedule_id=$1 AND status IN ('not_started','in_progress','grading')`,
        [scheduleId],
      );
      if (Number(active.rows[0]?.count ?? 0) > 0) {
        throw new ApiError(409, '仍有学员正在考试或评分，暂不能发布成绩');
      }
      const pending = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM exam_scores WHERE schedule_id=$1 AND status='pending'`,
        [scheduleId],
      );
      if (Number(pending.rows[0]?.count ?? 0) > 0) {
        throw new ApiError(409, '仍有待评分成绩，暂不能发布');
      }
      const missingScores = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM exam_attempts a
          WHERE a.schedule_id=$1
            AND a.status IN ('submitted','graded','released')
            AND NOT EXISTS (SELECT 1 FROM exam_scores sc WHERE sc.attempt_id=a.id)`,
        [scheduleId],
      );
      if (Number(missingScores.rows[0]?.count ?? 0) > 0) {
        throw new ApiError(409, '存在已交卷但尚未生成成绩的记录');
      }
      const scoreCount = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM exam_scores WHERE schedule_id=$1 AND status IN ('auto_graded','reviewed')`,
        [scheduleId],
      );
      if (Number(scoreCount.rows[0]?.count ?? 0) === 0) {
        throw new ApiError(409, '没有可发布的成绩');
      }
      const result = await client.query(
        `UPDATE exam_scores SET status='published',updated_at=NOW()
          WHERE schedule_id=$1 AND status IN ('auto_graded','reviewed')`, [scheduleId]);
      await client.query(`UPDATE exam_schedules SET results_released=true,status='results_released',results_release_at=COALESCE(results_release_at,NOW()),updated_at=NOW() WHERE id=$1`, [scheduleId]);
      await client.query(`INSERT INTO audit_logs(actor_id,actor_role,organization_id,action,entity_type,entity_id,detail)
                          VALUES($1,$2,$3,'scores_publish','exam_schedule',$4,$5)`,
        [user.id, user.roles[0] ?? null, schedule.organization_id, scheduleId, { publishedCount: result.rowCount ?? 0, expiredCount }]);
      return result.rowCount ?? 0;
    });
    // 激励层: 发布后给通过学员计积分/勋章(内部幂等且吞错,不影响发布结果)。
    const passedScores = await dbQuery<{ user_id: string; total_score: string; max_score: string }>(
      `SELECT user_id, total_score::text, max_score::text FROM exam_scores WHERE schedule_id=$1 AND passed`,
      scheduleId,
    );
    for (const score of passedScores) {
      await awardExamPass(score.user_id, null, scheduleId, Number(score.total_score), Number(score.max_score));
    }
    return ok({ scheduleId, publishedCount });
  } catch (error) { return catchError(error); }
}
