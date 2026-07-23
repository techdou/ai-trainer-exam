import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import {ok, fail, catchError} from '@/lib/api';

/**
 * GET /api/admin/scores/review?scoreId=xxx
 * 获取单条成绩详情（含自动评分明细、学员答题记录）
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['super_admin', 'school_admin', 'teacher', 'invigilator']);

    const { searchParams } = new URL(req.url);
    const scoreId = searchParams.get('scoreId');
    if (!scoreId) {
      return fail(400, '缺少 scoreId');
    }

    // 1. 获取成绩
    const scores = await dbQuery<{
      id: string; attempt_id: string; schedule_id: string; user_id: string;
      theory_score: number; cleaning_score: number; image_annotation_score: number;
      text_annotation_score: number; audio_score: number; statistics_score: number;
      total_score: number; max_score: number; passed: boolean; status: string;
      auto_score_detail: string; created_at: string;
    }>(
      `SELECT id, attempt_id, schedule_id, user_id,
              theory_score, cleaning_score, image_annotation_score,
              text_annotation_score, audio_score, statistics_score,
              total_score, max_score, passed, status,
              auto_score_detail::text, created_at
       FROM exam_scores WHERE id = $1`,
      scoreId,
    );

    if (scores.length === 0) {
      return fail(404, '成绩记录不存在');
    }

    const sc = scores[0];

    // 2. 获取答题明细
    const responses = await dbQuery<{
      id: string; item_id: string; item_type: string;
      response: string; score: number; graded_at: string;
    }>(
      `SELECT id, item_id, item_type, response::text, score, graded_at
       FROM exam_responses WHERE attempt_id = $1
       ORDER BY item_type, created_at`,
      sc.attempt_id,
    );

    // 3. 获取题目信息
    const items = responses.length > 0
      ? await dbQuery<{ id: string; stem: string; answer_key: string; question_type: string }>(
          `SELECT id, stem, answer_key::text, question_type
           FROM question_items WHERE id = ANY($1::uuid[])`,
          responses.map(r => r.item_id),
        )
      : [];

    const itemMap = new Map(items.map(i => [i.id, i]));

    return ok({
      score: {
        id: sc.id,
        attemptId: sc.attempt_id,
        scheduleId: sc.schedule_id,
        userId: sc.user_id,
        scores: {
          theory: Number(sc.theory_score),
          cleaning: Number(sc.cleaning_score),
          imageAnnotation: Number(sc.image_annotation_score),
          textAnnotation: Number(sc.text_annotation_score),
          audio: Number(sc.audio_score),
          statistics: Number(sc.statistics_score),
          total: Number(sc.total_score),
          max: Number(sc.max_score),
        },
        passed: sc.passed,
        status: sc.status,
        autoScoreDetail: sc.auto_score_detail ? JSON.parse(sc.auto_score_detail) : null,
        createdAt: sc.created_at,
      },
      responses: responses.map(r => {
        const item = itemMap.get(r.item_id);
        return {
          id: r.id,
          itemId: r.item_id,
          itemType: r.item_type,
          response: r.response ? JSON.parse(r.response) : null,
          score: Number(r.score ?? 0),
          gradedAt: r.graded_at,
          stem: item?.stem ?? null,
          answerKey: item?.answer_key ? JSON.parse(item.answer_key) : null,
          questionType: item?.question_type ?? null,
        };
      }),
    });
  } catch (e: unknown) {
    return catchError(e);
  }
}

/**
 * PATCH /api/admin/scores/review
 * 手动复核成绩（调整分数或标记状态）
 * 请求体: { scoreId: string, action: 'approve'|'adjust', adjustments?: {...}, note?: string }
 */
export async function PATCH(req: NextRequest) {
  try {
    await requireRole(req, ['super_admin', 'school_admin']);

    const body = await req.json() as {
      scoreId?: string;
      action?: 'approve' | 'adjust';
      adjustments?: {
        theoryScore?: number;
        cleaningScore?: number;
        imageAnnotationScore?: number;
        textAnnotationScore?: number;
        audioScore?: number;
        statisticsScore?: number;
      };
      note?: string;
    };

    const { scoreId, action } = body;
    if (!scoreId || !action) {
      return fail(400, '缺少 scoreId 或 action');
    }

    if (action === 'approve') {
      const rowCount = await dbExec(
        `UPDATE exam_scores SET status = 'published', updated_at = NOW() WHERE id = $1 AND status != 'published'`,
        scoreId,
      );
      if (rowCount === 0) {
        return fail(400, '成绩已发布或不存在');
      }
      return ok({ scoreId, status: 'published' });
    }

    if (action === 'adjust') {
      const adj = body.adjustments ?? {};
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (adj.theoryScore !== undefined) { sets.push(`theory_score = $${idx++}`); params.push(adj.theoryScore); }
      if (adj.cleaningScore !== undefined) { sets.push(`cleaning_score = $${idx++}`); params.push(adj.cleaningScore); }
      if (adj.imageAnnotationScore !== undefined) { sets.push(`image_annotation_score = $${idx++}`); params.push(adj.imageAnnotationScore); }
      if (adj.textAnnotationScore !== undefined) { sets.push(`text_annotation_score = $${idx++}`); params.push(adj.textAnnotationScore); }
      if (adj.audioScore !== undefined) { sets.push(`audio_score = $${idx++}`); params.push(adj.audioScore); }
      if (adj.statisticsScore !== undefined) { sets.push(`statistics_score = $${idx++}`); params.push(adj.statisticsScore); }

      if (sets.length === 0) {
        return fail(400, '没有需要调整的分数项');
      }

      // 重新计算总分和通过状态
      const theory = adj.theoryScore ?? 0;
      const cleaning = adj.cleaningScore ?? 0;
      const image = adj.imageAnnotationScore ?? 0;
      const text = adj.textAnnotationScore ?? 0;
      const audio = adj.audioScore ?? 0;
      const stats = adj.statisticsScore ?? 0;
      const total = theory + cleaning + image + text + audio + stats;

      sets.push(`total_score = $${idx++}`);
      params.push(total);
      sets.push(`passed = $${idx++}`);
      params.push(total >= 60 ? 1 : 0);
      sets.push(`status = 'reviewed'`);
      sets.push(`updated_at = NOW()`);

      params.push(scoreId);
      const rowCount = await dbExec(
        `UPDATE exam_scores SET ${sets.join(', ')} WHERE id = $${idx}`,
        ...params,
      );

      if (rowCount === 0) {
        return fail(404, '成绩记录不存在');
      }

      return ok({ scoreId, totalScore: total, passed: total >= 60, status: 'reviewed' });
    }

    return fail(400, '未知操作类型');
  } catch (e: unknown) {
    return catchError(e);
  }
}
