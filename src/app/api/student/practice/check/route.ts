import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbExec, dbOne } from '@/server/db';
import { insertAudit } from '@/server/audit';
import { catchError } from '@/lib/api';

/** POST /api/student/practice/check — 学员提交练习答案，即时判分 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['student']);

    const body = await request.json();
    const { questionId, answer, userAnswer } = body as { questionId: string; answer?: string; userAnswer?: string };
    const finalAnswer = answer || userAnswer;

    if (!questionId || !finalAnswer) {
      return Response.json({ success: false, error: '缺少参数' }, { status: 400 });
    }

    const q = await dbOne<{ answer_key: unknown; explanation: string | null; knowledge_point: string | null; stem: string; question_type: string }>(
      'SELECT answer_key, explanation, knowledge_point, stem, question_type FROM practice_question_items WHERE id = $1 AND review_status = $2',
      questionId,
      'published',
    );

    if (!q) {
      return Response.json({ success: false, error: '题目不存在或未发布' }, { status: 404 });
    }

    // answer_key 是 JSONB：单选题为 "C" 字符串，判断题为 boolean
    let isCorrect: boolean;
    let correctAnswerDisplay: string;
    if (q.question_type === 'true_false') {
      // 判断题：answer_key 是 boolean，学员选 A=正确 B=错误
      const correctBool = q.answer_key === true;
      const userAnswerIsTrue = finalAnswer.trim().toUpperCase() === 'A';
      isCorrect = correctBool === userAnswerIsTrue;
      correctAnswerDisplay = correctBool ? 'A' : 'B';
    } else {
      // 单选题：answer_key 是字符串如 "C"
      const answerKeyStr = typeof q.answer_key === 'string'
        ? q.answer_key.trim().toUpperCase()
        : String(q.answer_key).trim().toUpperCase();
      isCorrect = answerKeyStr === finalAnswer.trim().toUpperCase();
      correctAnswerDisplay = answerKeyStr;
    }

    // 写入 practice_attempts（实际表，列名与 schema 一致）
    await dbExec(
      `INSERT INTO practice_attempts (id, user_id, item_type, item_id, status, score, max_score, passed, feedback, workspace_snapshot, operation_log, submitted_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'theory_question', $2, 'completed', $3, 1, $4, '{}', '{}', '[]', now(), now(), now())
       ON CONFLICT DO NOTHING`,
      user.id, questionId, isCorrect ? 1 : 0, isCorrect,
    );

    if (!isCorrect) {
      // 写入错题本（practice_wrong_items）
      await dbExec(
        `INSERT INTO practice_wrong_items (id, user_id, item_type, item_id, wrong_count, resolved, last_wrong_at)
         VALUES (gen_random_uuid(), $1, 'theory_question', $2, 1, false, now())
         ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET wrong_count = practice_wrong_items.wrong_count + 1, resolved = false, last_wrong_at = now()`,
        user.id, questionId,
      );
    } else {
      // 答对则标记错题已解决
      await dbExec(
        `UPDATE practice_wrong_items SET resolved = true WHERE user_id = $1 AND item_type = 'theory_question' AND item_id = $2`,
        user.id, questionId,
      );
    }

    await insertAudit({
      actorId: user.id,
      action: 'practice_answer',
      entityType: 'question',
      entityId: questionId,
    });

    return Response.json({
      success: true,
      data: {
        correct: isCorrect,
        correctAnswer: correctAnswerDisplay,
        explanation: q.explanation,
        knowledgePoint: q.knowledge_point,
      },
    });
  } catch (e) {
    return catchError(e);
  }
}
