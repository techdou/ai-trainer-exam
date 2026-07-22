import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import { ok, fail } from '@/lib/api';

/**
 * POST /api/student/exams/submit
 *
 * 请求体:
 * {
 *   scheduleId: string;
 *   answers: { questionId: string; answer: string }[];
 * }
 *
 * 数据库 schema 映射:
 * - exam_attempts: schedule_id, user_id, status, started_at, submitted_at
 * - exam_responses: attempt_id, item_id, item_type, response(jsonb), workspace_snapshot(jsonb)
 * - exam_scores: attempt_id, schedule_id, user_id, theory_score, cleaning_score, image_annotation_score,
 *                text_annotation_score, audio_score, statistics_score, total_score, max_score, passed, auto_score_detail(jsonb), status
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['student']);

    const body = await request.json() as {
      scheduleId?: string;
      answers?: { questionId: string; answer: string }[];
    };

    const { scheduleId, answers } = body;
    if (!scheduleId || !answers || !Array.isArray(answers)) {
      return fail(400, '缺少参数：scheduleId 和 answers');
    }

    // 1. 验证考试安排存在且在开放时间内
    const schedules = await dbQuery<{
      id: string;
      exam_start_at: string;
      exam_end_at: string;
      submit_grace_seconds: number;
      status: string;
    }>(
      `SELECT id, exam_start_at, exam_end_at, submit_grace_seconds, status
       FROM exam_schedules WHERE id = $1 AND deleted_at IS NULL`,
      scheduleId,
    );

    if (schedules.length === 0) {
      return fail(404, '考试安排不存在');
    }

    const schedule = schedules[0];
    const now = Date.now();
    const endAt = new Date(schedule.exam_end_at).getTime() + schedule.submit_grace_seconds * 1000;
    if (now > endAt) {
      return fail(400, '考试已结束，无法交卷');
    }

    // 2. 检查是否已有进行中的 attempt（防止重复提交）
    const existingAttempts = await dbQuery<{ id: string; status: string }>(
      `SELECT id, status FROM exam_attempts
       WHERE user_id = $1 AND schedule_id = $2 AND status IN ('not_started', 'in_progress')
       ORDER BY created_at DESC LIMIT 1`,
      user.id, scheduleId,
    );

    let attemptId: string;

    if (existingAttempts.length > 0 && existingAttempts[0].status !== 'submitted' && existingAttempts[0].status !== 'graded') {
      // 复用已有 attempt
      attemptId = existingAttempts[0].id;
      await dbExec(
        `UPDATE exam_attempts SET status = 'submitted', submitted_at = NOW() WHERE id = $1`,
        attemptId,
      );
    } else {
      // 创建新 attempt
      const attemptRows = await dbQuery<{ id: string }>(
        `INSERT INTO exam_attempts (user_id, schedule_id, status, started_at, submitted_at)
         VALUES ($1, $2, 'submitted', NOW(), NOW())
         RETURNING id`,
        user.id, scheduleId,
      );
      attemptId = attemptRows[0]?.id;
      if (!attemptId) {
        return fail(500, '创建考试记录失败');
      }
    }

    // 3. 保存每道题的作答到 exam_responses
    // exam_responses schema: attempt_id, item_id, item_type, response(jsonb), workspace_snapshot(jsonb)
    let theoryCorrect = 0;
    let theoryTotal = 0;

    for (const ans of answers) {
      // 获取题目信息和正确答案
      let qRow: { answer_key: unknown; question_type: string } | undefined;
      const examRows = await dbQuery<{ answer_key: unknown; question_type: string }>(
        `SELECT answer_key, question_type FROM exam_question_items WHERE id = $1`,
        ans.questionId,
      );
      if (examRows.length > 0) {
        qRow = examRows[0];
      } else {
        const pRows = await dbQuery<{ answer_key: unknown; question_type: string }>(
          `SELECT answer_key, question_type FROM practice_question_items WHERE id = $1`,
          ans.questionId,
        );
        qRow = pRows[0];
      }

      // 构建 response jsonb —— 包含用户答案和判题结果
      let isCorrect = false;
      let correctAnswer = '';

      if (qRow) {
        const ak = qRow.answer_key;
        if (typeof ak === 'boolean') {
          // 判断题
          correctAnswer = ak ? 'A' : 'B';
          isCorrect = ans.answer === correctAnswer;
        } else if (ak && typeof ak === 'object' && 'letter' in (ak as Record<string, unknown>)) {
          // 单选题 answer_key = {"letter": "C"}
          correctAnswer = (ak as { letter: string }).letter;
          isCorrect = ans.answer === correctAnswer;
        } else {
          correctAnswer = String(ak ?? '');
          isCorrect = ans.answer === correctAnswer;
        }

        // 统计理论题（单选 + 判断）
        if (qRow.question_type === 'single_choice' || qRow.question_type === 'true_false') {
          theoryTotal++;
          if (isCorrect) theoryCorrect++;
        }
      }

      // 确定 item_type
      const itemType = qRow?.question_type === 'single_choice' || qRow?.question_type === 'true_false'
        ? 'question'
        : 'task';

      await dbExec(
        `INSERT INTO exam_responses (attempt_id, item_id, item_type, response, workspace_snapshot)
         VALUES ($1, $2, $3, $4, $5)`,
        attemptId,
        ans.questionId,
        itemType,
        JSON.stringify({ userAnswer: ans.answer, isCorrect, correctAnswer }),
        JSON.stringify({}),
      );
    }

    // 4. 计算分数并保存到 exam_scores
    const totalQuestions = answers.length;
    const theoryScore = theoryTotal > 0 ? Math.round((theoryCorrect / theoryTotal) * 60) : 0; // 理论题满分60
    const totalScore = theoryScore; // 目前只有理论题
    const maxScore = 100;
    const passed = totalScore >= 60;

    // 检查是否已有 score 记录
    const existingScores = await dbQuery<{ id: string }>(
      `SELECT id FROM exam_scores WHERE attempt_id = $1`,
      attemptId,
    );

    const autoScoreDetail = JSON.stringify({
      theory: { correct: theoryCorrect, total: theoryTotal, score: theoryScore },
      gradedAt: new Date().toISOString(),
    });

    if (existingScores.length > 0) {
      await dbExec(
        `UPDATE exam_scores SET
          theory_score = $1, total_score = $2, passed = $3,
          auto_score_detail = $4, status = 'auto_graded'
         WHERE attempt_id = $5`,
        theoryScore, totalScore, passed, autoScoreDetail, attemptId,
      );
    } else {
      await dbExec(
        `INSERT INTO exam_scores
          (attempt_id, schedule_id, user_id, theory_score, cleaning_score,
           image_annotation_score, text_annotation_score, audio_score, statistics_score,
           total_score, max_score, passed, auto_score_detail, status)
         VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, $5, $6, $7, $8, 'auto_graded')`,
        attemptId, scheduleId, user.id, theoryScore, totalScore, maxScore, passed, autoScoreDetail,
      );
    }

    // 5. 更新 attempt 状态为 graded
    await dbExec(
      `UPDATE exam_attempts SET status = 'graded' WHERE id = $1`,
      attemptId,
    );

    return ok({
      attemptId,
      total: totalQuestions,
      correct: theoryCorrect,
      score: totalScore,
      passed,
    });
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
