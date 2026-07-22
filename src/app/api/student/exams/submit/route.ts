import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import { ok, fail } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['student']);

    const body = await request.json() as {
      scheduleId?: string;
      answers?: { questionId: string; answer: string }[];
    };

    const { scheduleId, answers } = body;
    if (!scheduleId || !answers || !Array.isArray(answers)) {
      return fail(400, '缺少参数');
    }

    // Create exam attempt
    const attemptRows = await dbQuery<{ id: string }>(
      `INSERT INTO exam_attempts (user_id, schedule_id, status, started_at, submitted_at)
       VALUES ($1, $2, 'submitted', NOW(), NOW())
       RETURNING id`,
      user.id, scheduleId,
    );

    const attemptId = attemptRows[0]?.id;
    if (!attemptId) {
      return fail(500, '创建考试记录失败');
    }

    // Grade each answer
    let correctCount = 0;
    for (const ans of answers) {
      // Get the correct answer — try exam bank first, then practice bank
      let qRow: { answer_key: unknown } | undefined;
      const examRows = await dbQuery<{ answer_key: unknown }>(
        `SELECT answer_key FROM exam_question_items WHERE id = $1`,
        ans.questionId,
      );
      if (examRows.length > 0) {
        qRow = examRows[0];
      } else {
        const pRows = await dbQuery<{ answer_key: unknown }>(
          `SELECT answer_key FROM practice_question_items WHERE id = $1`,
          ans.questionId,
        );
        qRow = pRows[0];
      }

      let correctAnswer = '';
      if (qRow) {
        if (typeof qRow.answer_key === 'boolean') {
          correctAnswer = qRow.answer_key ? 'A' : 'B';
        } else {
          correctAnswer = String(qRow.answer_key ?? '');
        }
      }

      const isCorrect = ans.answer === correctAnswer;
      if (isCorrect) correctCount++;

      await dbExec(
        `INSERT INTO exam_responses (attempt_id, question_id, user_answer, is_correct, graded_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        attemptId, ans.questionId, ans.answer, isCorrect,
      );
    }

    const totalQuestions = answers.length;
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    // Save score
    await dbExec(
      `INSERT INTO exam_scores (attempt_id, total_score, total_questions, correct_count, graded_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      attemptId, score, totalQuestions, correctCount,
    );

    // Update attempt status
    await dbExec(
      `UPDATE exam_attempts SET status = 'graded' WHERE id = $1`,
      attemptId,
    );

    return ok({ total: totalQuestions, correct: correctCount, score });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    if (msg.includes('401') || msg.includes('403')) {
      const code = msg.includes('401') ? 401 : 403;
      return fail(code, msg);
    }
    console.error('考试提交失败:', e);
    return fail(500, '服务器开小差了，请稍后再试');
  }
}
