import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbOne, dbExec } from '@/server/db';
import { ok, handler, parseBody, fail } from '@/lib/api';
import { gradeTaskByType } from '@/server/grading';

import { getPracticeMaxScore, getPracticePassScore } from '@/server/settings';
import { assertPracticeUnlocked } from '@/server/exam-security';
import { awardTaskPass } from '@/server/gamification';

const schema = z.object({ taskId: z.string().min(1).max(100), submission: z.unknown() });

export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['student']);
  await assertPracticeUnlocked(user);
  const body = await parseBody(request, schema);
  const task = await dbOne<{ id: string; task_type: string; answer_key: unknown; review_status: string }>(
    `SELECT t.id,t.task_type,t.answer_key,t.review_status
       FROM practice_task_templates t
      WHERE t.id=$1 AND t.deleted_at IS NULL
        AND (t.organization_id=$2 OR t.organization_id IS NULL)
        AND EXISTS (SELECT 1 FROM practice_assignments a JOIN enrollments e ON e.cohort_id=a.cohort_id
                    WHERE a.item_id=t.id AND a.item_type='task_template' AND e.user_id=$3 AND e.status='active')`,
    body.taskId,user.organizationId,user.id,
  );
  if (!task || task.review_status !== 'published') return fail(404, '练习任务不存在或未发布');

  const result = gradeTaskByType(task.task_type, body.submission, task.answer_key);
  const maxScore = await getPracticeMaxScore();
  const score = Math.round(result.score * maxScore * 100) / 100;
  const passScore = await getPracticePassScore();
  const passed = score >= passScore;

  await dbExec(
    `INSERT INTO practice_attempts
      (user_id, item_type, item_id, status, score, max_score, passed, feedback,
       workspace_snapshot, operation_log, engine_version, submitted_at, created_at, updated_at)
     VALUES ($1, 'task_template', $2, 'submitted', $3, $4, $5, $6, $7, '[]'::jsonb, $8, NOW(), NOW(), NOW())`,
    user.id,
    task.id,
    score,
    maxScore,
    passed,
    JSON.stringify({ feedback: result.feedback, correct: result.correct, details: result.details ?? {} }),
    JSON.stringify(body.submission ?? {}),
    result.graderVersion,
  );

  if (result.correct) {
    await dbExec(
      `UPDATE practice_wrong_items SET resolved = true, updated_at = NOW()
        WHERE user_id = $1 AND item_type = 'task_template' AND item_id = $2`,
      user.id, task.id,
    );
  } else {
    await dbExec(
      `INSERT INTO practice_wrong_items
        (user_id, item_type, item_id, wrong_count, resolved, last_wrong_at, created_at, updated_at)
       VALUES ($1, 'task_template', $2, 1, false, NOW(), NOW(), NOW())
       ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET
         wrong_count = practice_wrong_items.wrong_count + 1,
         resolved = false, last_wrong_at = NOW(), updated_at = NOW()`,
      user.id, task.id,
    );
  }

  // 练习模式题库公开是设计约定(驾考模式): answerKey 随判分结果下发,供前端做"你的标注 vs 标准答案"可视化。
  if (result.correct && passed) await awardTaskPass(user.id, user.organizationId, task.id);
  return ok({ correct: result.correct, score, maxScore, feedback: result.feedback, graderVersion: result.graderVersion, passed, details: result.details ?? {}, answerKey: task.answer_key ?? {} });
});
