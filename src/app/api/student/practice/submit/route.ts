import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import { ok, fail } from '@/lib/api';
import { gradeByType } from '@/server/grading';

/** POST /api/student/practice/submit - 提交实操任务答案并评分 */
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

    // 记录尝试
    await dbExec(
      `INSERT INTO practice_attempts (user_id, item_type, item_id, score, correct, answer_json, result_json, created_at)
       VALUES ($1, 'task_template', $2, $3, $4, $5, $6, NOW())`,
      user.id,
      taskId,
      result.score,
      result.correct,
      JSON.stringify(submission),
      JSON.stringify(result),
    );

    // 如果做错了，记录到错题本
    if (!result.correct) {
      await dbExec(
        `INSERT INTO practice_wrong_items (user_id, item_type, item_id, wrong_answer, correct_answer, created_at, updated_at)
         VALUES ($1, 'task_template', $2, $3, $4, NOW(), NOW())
         ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET
           wrong_answer = EXCLUDED.wrong_answer,
           correct_answer = EXCLUDED.correct_answer,
           updated_at = NOW()`,
        user.id,
        taskId,
        JSON.stringify(submission),
        JSON.stringify(answerKey),
      );
    }

    return ok({
      correct: result.correct,
      score: result.score,
      feedback: result.feedback,
      graderVersion: result.graderVersion,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    const status = msg.includes('请先登录') ? 401 : msg.includes('权限') ? 403 : 500;
    return fail(status, status === 500 ? '服务器开小差了，请稍后再试' : msg);
  }
}
