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
 *   attemptId?: string;   // 可选，start 接口返回的
 *   answers: { questionId: string; answer: string }[];
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['student']);

    const body = await request.json() as {
      scheduleId?: string;
      attemptId?: string;
      answers?: { questionId: string; answer: string }[];
    };

    const { scheduleId, attemptId, answers } = body;
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
    const endAt = new Date(schedule.exam_end_at).getTime() + (schedule.submit_grace_seconds ?? 0) * 1000;
    if (now > endAt) {
      return fail(400, '考试已结束，无法交卷');
    }

    // 2. 查找用户的 attempt 记录
    let existingAttempt: { id: string; status: string } | undefined;

    if (attemptId) {
      // 客户端传了 attemptId，直接查找
      const rows = await dbQuery<{ id: string; status: string }>(
        `SELECT id, status FROM exam_attempts WHERE id = $1 AND user_id = $2 AND schedule_id = $3`,
        attemptId, user.id, scheduleId,
      );
      existingAttempt = rows[0];
    } else {
      // 没传 attemptId，找最近的一条
      const rows = await dbQuery<{ id: string; status: string }>(
        `SELECT id, status FROM exam_attempts
         WHERE user_id = $1 AND schedule_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        user.id, scheduleId,
      );
      existingAttempt = rows[0];
    }

    if (!existingAttempt) {
      return fail(404, '未找到考试记录，请先开始考试');
    }

    if (existingAttempt.status === 'submitted' || existingAttempt.status === 'graded') {
      return fail(400, '已交卷，不可重复提交');
    }

    const finalAttemptId = existingAttempt.id;

    // 3. 更新 attempt 状态为 submitted
    await dbExec(
      `UPDATE exam_attempts SET status = 'submitted', submitted_at = NOW() WHERE id = $1`,
      finalAttemptId,
    );

    // 4. 保存每道题的作答到 exam_responses 并评分
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

      // 判题
      let isCorrect = false;
      let correctAnswer = '';
      let itemType = 'question';

      if (qRow) {
        const ak = qRow.answer_key;

        // answer_key 可能是纯文本 "C"、boolean true/false、或 JSON {"letter":"C"}
        if (typeof ak === 'boolean') {
          correctAnswer = ak ? 'A' : 'B';
          isCorrect = ans.answer === correctAnswer;
        } else if (typeof ak === 'string') {
          // 纯文本如 "C" 或 "A"
          correctAnswer = ak;
          isCorrect = ans.answer === correctAnswer;
        } else if (ak && typeof ak === 'object') {
          // JSON 对象 {"letter":"C"}
          if ('letter' in (ak as Record<string, unknown>)) {
            correctAnswer = String((ak as { letter: unknown }).letter);
            isCorrect = ans.answer === correctAnswer;
          } else {
            correctAnswer = JSON.stringify(ak);
            isCorrect = ans.answer === correctAnswer;
          }
        }

        // 统计理论题（单选 + 判断）
        if (qRow.question_type === 'single_choice' || qRow.question_type === 'true_false') {
          theoryTotal++;
          if (isCorrect) theoryCorrect++;
        }

        // 确定 item_type
        itemType = (qRow.question_type === 'single_choice' || qRow.question_type === 'true_false')
          ? 'question'
          : 'task';
      }

      await dbExec(
        `INSERT INTO exam_responses (attempt_id, item_id, item_type, response, workspace_snapshot)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (attempt_id, item_id) DO UPDATE SET response = EXCLUDED.response, workspace_snapshot = EXCLUDED.workspace_snapshot`,
        finalAttemptId,
        ans.questionId,
        itemType,
        JSON.stringify({ userAnswer: ans.answer, isCorrect, correctAnswer }),
        JSON.stringify({}),
      );
    }

    // 5. 计算分数并保存到 exam_scores
    // 每道题分数从 exam_paper_items 获取
    const paperItems = await dbQuery<{ item_id: string; score: number }>(
      `SELECT epi.item_id, epi.score
       FROM exam_paper_items epi
       JOIN exam_schedules es ON es.paper_id = epi.paper_id
       WHERE es.id = $1`,
      scheduleId,
    );

    let totalScore = 0;
    let maxScore = 0;

    // 重新获取所有 responses 以计算分数
    const responses = await dbQuery<{ item_id: string; response: { isCorrect: boolean } }>(
      `SELECT item_id, response FROM exam_responses WHERE attempt_id = $1`,
      finalAttemptId,
    );

    const respMap = new Map(responses.map(r => [r.item_id, r.response]));

    for (const pi of paperItems) {
      // pg 驱动对 numeric 类型可能返回 string/Decimal，统一转为 number
      const itemScore = Number(pi.score);
      maxScore += itemScore;
      const resp = respMap.get(pi.item_id);
      if (resp && resp.isCorrect) {
        totalScore += itemScore;
      }
    }

    const passed = totalScore >= 60;

    const autoScoreDetail = JSON.stringify({
      theory: { correct: theoryCorrect, total: theoryTotal },
      totalScore,
      maxScore,
      gradedAt: new Date().toISOString(),
    });

    // 检查是否已有 score 记录
    const existingScores = await dbQuery<{ id: string }>(
      `SELECT id FROM exam_scores WHERE attempt_id = $1`,
      finalAttemptId,
    );

    if (existingScores.length > 0) {
      await dbExec(
        `UPDATE exam_scores SET
          theory_score = $1, total_score = $2, max_score = $3, passed = $4,
          auto_score_detail = $5, status = 'auto_graded'
         WHERE attempt_id = $6`,
        theoryCorrect * (theoryTotal > 0 ? Math.round(60 / theoryTotal) : 0),
        totalScore,
        maxScore,
        passed,
        autoScoreDetail,
        finalAttemptId,
      );
    } else {
      await dbExec(
        `INSERT INTO exam_scores
          (attempt_id, schedule_id, user_id, theory_score, cleaning_score,
           image_annotation_score, text_annotation_score, audio_score, statistics_score,
           total_score, max_score, passed, auto_score_detail, status)
         VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, $5, $6, $7, $8, 'auto_graded')`,
        finalAttemptId, scheduleId, user.id,
        theoryCorrect * (theoryTotal > 0 ? Math.round(60 / theoryTotal) : 0),
        totalScore,
        maxScore,
        passed,
        autoScoreDetail,
      );
    }

    // 6. 更新 attempt 状态为 graded
    await dbExec(
      `UPDATE exam_attempts SET status = 'graded' WHERE id = $1`,
      finalAttemptId,
    );

    return ok({
      attemptId: finalAttemptId,
      total: answers.length,
      correct: theoryCorrect,
      score: totalScore,
      maxScore,
      passed,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    console.error('考试提交失败:', e);
    if (msg.includes('401') || msg.includes('403')) {
      const code = msg.includes('401') ? 401 : 403;
      return fail(code, msg);
    }
    return fail(500, '服务器开小差了，请稍后再试');
  }
}
