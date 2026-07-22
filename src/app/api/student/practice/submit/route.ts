import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import { ok, fail } from '@/lib/api';
import { gradeByType } from '@/server/grading';

/**
 * POST /api/student/practice/submit - 提交实操任务答案并评分
 *
 * practice_attempts schema:
 *   user_id, item_type, item_id, status, score, max_score, passed,
 *   feedback(jsonb), workspace_snapshot(jsonb), operation_log(jsonb), engine_version, submitted_at
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ['student']);
    const body = await req.json();
    const { taskId, submission, graderId } = body as {
      taskId?: string;
      submission?: unknown;
      graderId?: string;
    };

    if (!taskId || !submission || !graderId) {
      return fail(400, '缺少参数：taskId, submission, graderId');
    }

    // 获取任务模板的 answer_key
    const rows = await dbQuery<{ answer_key: string; title: string }>(
      `SELECT answer_key, title FROM practice_task_templates WHERE id = $1 AND deleted_at IS NULL`,
      taskId,
    );

    if (rows.length === 0) {
      return fail(404, '任务不存在');
    }

    const answerKey = typeof rows[0].answer_key === 'string'
      ? JSON.parse(rows[0].answer_key)
      : rows[0].answer_key;

    // 评分
    const result = gradeByType(graderId, submission, answerKey);

    const maxScore = 100;
    const passed = result.score >= 60;

    // 记录尝试
    await dbExec(
      `INSERT INTO practice_attempts (user_id, item_type, item_id, status, score, max_score, passed, feedback, workspace_snapshot, operation_log, engine_version, submitted_at)
       VALUES ($1, 'task_template', $2, 'submitted', $3, $4, $5, $6, $7, '[]', $8, NOW())`,
      user.id,
      taskId,
      result.score,
      maxScore,
      passed,
      JSON.stringify({ feedback: result.feedback, correct: result.correct }),
      JSON.stringify(submission),
      result.graderVersion,
    );

    // 如果做错了，记录到错题本
    // practice_wrong_items schema: user_id, item_type, item_id, wrong_count, resolved, last_wrong_at
    if (!result.correct) {
      await dbExec(
        `INSERT INTO practice_wrong_items (user_id, item_type, item_id, wrong_count, resolved, last_wrong_at, created_at, updated_at)
         VALUES ($1, 'task_template', $2, 1, false, NOW(), NOW(), NOW())
         ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET
           wrong_count = practice_wrong_items.wrong_count + 1,
           resolved = false,
           last_wrong_at = NOW(),
           updated_at = NOW()`,
        user.id,
        taskId,
      );
    } else {
      // 答对则标记错题已解决
      await dbExec(
        `UPDATE practice_wrong_items SET resolved = true, updated_at = NOW()
         WHERE user_id = $1 AND item_type = 'task_template' AND item_id = $2`,
        user.id,
        taskId,
      );
    }

    return ok({
      correct: result.correct,
      score: result.score,
      feedback: result.feedback,
      graderVersion: result.graderVersion,
      passed,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    const status = msg.includes('请先登录') ? 401 : msg.includes('权限') ? 403 : 500;
    return fail(status, status === 500 ? '服务器开小差了，请稍后再试' : msg);
  }
}
