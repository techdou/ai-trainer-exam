import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbOne, dbQuery, dbTx } from '@/server/db';
import { ok, fail, catchError, parseBody } from '@/lib/api';
import { assertOrganizationScope, assertTeacherCohortAccess } from '@/server/exam-security';

const patchSchema = z.object({
  scoreId: z.string().uuid(),
  action: z.enum(['approve', 'adjust']),
  adjustments: z.object({
    theoryScore: z.number().min(0).optional(), cleaningScore: z.number().min(0).optional(),
    imageAnnotationScore: z.number().min(0).optional(), textAnnotationScore: z.number().min(0).optional(),
    audioScore: z.number().min(0).optional(), statisticsScore: z.number().min(0).optional(),
  }).optional(),
  note: z.string().trim().min(3).max(1000).optional(),
});

interface ScoreRow {
  id: string; attempt_id: string; schedule_id: string; user_id: string; organization_id: string | null; cohort_id: string;
  pass_score: number; theory_score: number; cleaning_score: number; image_annotation_score: number;
  text_annotation_score: number; audio_score: number; statistics_score: number; total_score: number;
  max_score: number; passed: boolean; status: string; auto_score_detail: unknown; created_at: string;
}

async function loadScore(scoreId: string): Promise<ScoreRow | null> {
  return dbOne<ScoreRow>(`SELECT sc.id,sc.attempt_id,sc.schedule_id,sc.user_id,s.organization_id,s.cohort_id,p.pass_score,
      sc.theory_score,sc.cleaning_score,sc.image_annotation_score,sc.text_annotation_score,sc.audio_score,
      sc.statistics_score,sc.total_score,sc.max_score,sc.passed,sc.status,sc.auto_score_detail,sc.created_at
    FROM exam_scores sc JOIN exam_schedules s ON s.id=sc.schedule_id JOIN exam_papers p ON p.id=s.paper_id
    WHERE sc.id=$1 AND s.deleted_at IS NULL`, scoreId);
}

async function assertAccess(user: Awaited<ReturnType<typeof requireRole>>, score: ScoreRow) {
  assertOrganizationScope(user, score.organization_id);
  if (user.roles.includes('teacher')) await assertTeacherCohortAccess(user, score.cohort_id);
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin', 'teacher', 'invigilator', 'auditor']);
    const scoreId = new URL(req.url).searchParams.get('scoreId');
    if (!scoreId || !z.string().uuid().safeParse(scoreId).success) return fail(400, 'scoreId 不正确');
    const score = await loadScore(scoreId);
    if (!score) return fail(404, '成绩记录不存在');
    await assertAccess(user, score);

    const responses = await dbQuery<{
      id: string; item_id: string; item_type: string; response: unknown; score: number; max_score: number;
      grader_version: string | null; grading_detail: unknown; graded_at: string | null; item_snapshot: unknown; answer_key_snapshot: unknown;
    }>(`SELECT r.id,r.item_id,r.item_type,r.response,r.score,r.max_score,r.grader_version,r.grading_detail,r.graded_at,
               pi.item_snapshot,pi.answer_key_snapshot
          FROM exam_responses r LEFT JOIN exam_paper_items pi ON pi.id=r.item_id
         WHERE r.attempt_id=$1 ORDER BY pi.sort_order NULLS LAST,r.created_at`, score.attempt_id);

    return ok({
      score: {
        id: score.id, attemptId: score.attempt_id, scheduleId: score.schedule_id, userId: score.user_id,
        scores: { theory: Number(score.theory_score), cleaning: Number(score.cleaning_score),
          imageAnnotation: Number(score.image_annotation_score), textAnnotation: Number(score.text_annotation_score),
          audio: Number(score.audio_score), statistics: Number(score.statistics_score),
          total: Number(score.total_score), max: Number(score.max_score) },
        passed: score.passed, status: score.status, passScore: Number(score.pass_score),
        autoScoreDetail: score.auto_score_detail, createdAt: score.created_at,
      },
      responses: responses.map(r => ({ id: r.id, itemId: r.item_id, itemType: r.item_type, response: r.response,
        score: Number(r.score), maxScore: Number(r.max_score), graderVersion: r.grader_version,
        gradingDetail: r.grading_detail, gradedAt: r.graded_at, itemSnapshot: r.item_snapshot,
        // 复核页需要展示正确答案; 题干/题型在 itemSnapshot 里, 答案在 answer_key_snapshot 里。
        answerKey: r.answer_key_snapshot })),
    });
  } catch (error) { return catchError(error); }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);
    const body = await parseBody(req, patchSchema);
    if (!body.note) {
      return fail(400, body.action === 'approve' ? '复核通过也必须填写复核说明' : '调整成绩必须填写原因');
    }
    if (body.action === 'adjust' && Object.keys(body.adjustments ?? {}).length === 0) {
      return fail(400, '没有需要调整的分数项');
    }

    const result = await dbTx(async client => {
      const locked = await client.query<ScoreRow>(
        `SELECT sc.id,sc.attempt_id,sc.schedule_id,sc.user_id,s.organization_id,s.cohort_id,p.pass_score,
                sc.theory_score,sc.cleaning_score,sc.image_annotation_score,sc.text_annotation_score,sc.audio_score,
                sc.statistics_score,sc.total_score,sc.max_score,sc.passed,sc.status,sc.auto_score_detail,sc.created_at
           FROM exam_scores sc
           JOIN exam_schedules s ON s.id=sc.schedule_id
           JOIN exam_papers p ON p.id=s.paper_id
          WHERE sc.id=$1 AND s.deleted_at IS NULL
          FOR UPDATE OF sc`,
        [body.scoreId],
      );
      const current = locked.rows[0];
      if (!current) return { error: fail(404, '成绩记录不存在') };
      assertOrganizationScope(user, current.organization_id);
      if (!['auto_graded','reviewed','pending'].includes(current.status)) {
        return { error: fail(409, `当前成绩状态为 ${current.status}，不能复核。已发布的成绩需先撤回发布。`) };
      }

      if (body.action === 'approve') {
        await client.query(`UPDATE exam_scores SET status='reviewed',updated_at=NOW() WHERE id=$1`, [body.scoreId]);
        await client.query(`INSERT INTO audit_logs(actor_id,actor_role,organization_id,action,entity_type,entity_id,detail)
          VALUES($1,$2,$3,'score_review_approve','exam_score',$4,$5)`,
          [user.id, user.roles[0] ?? null, current.organization_id, body.scoreId, { note: body.note, total: Number(current.total_score) }]);
        return { scoreId: body.scoreId, status: 'reviewed' as const };
      }

      const adj = body.adjustments ?? {};
      const next = {
        theory: adj.theoryScore ?? Number(current.theory_score), cleaning: adj.cleaningScore ?? Number(current.cleaning_score),
        image: adj.imageAnnotationScore ?? Number(current.image_annotation_score),
        text: adj.textAnnotationScore ?? Number(current.text_annotation_score), audio: adj.audioScore ?? Number(current.audio_score),
        statistics: adj.statisticsScore ?? Number(current.statistics_score),
      };
      const total = Number((next.theory + next.cleaning + next.image + next.text + next.audio + next.statistics).toFixed(2));
      if (total > Number(current.max_score)) return { error: fail(400, '调整后的总分不能超过试卷满分') };
      const passed = total >= Number(current.pass_score);
      await client.query(`UPDATE exam_scores SET theory_score=$1,cleaning_score=$2,image_annotation_score=$3,
          text_annotation_score=$4,audio_score=$5,statistics_score=$6,total_score=$7,passed=$8,
          original_total=COALESCE(original_total,total_score),adjusted_total=$7,adjust_reason=$9,adjusted_by=$10,
          status='reviewed',updated_at=NOW() WHERE id=$11`,
        [next.theory,next.cleaning,next.image,next.text,next.audio,next.statistics,total,passed,body.note,user.id,body.scoreId]);
      await client.query(`INSERT INTO audit_logs(actor_id,actor_role,organization_id,action,entity_type,entity_id,detail)
          VALUES($1,$2,$3,'score_adjust','exam_score',$4,$5)`,
        [user.id,user.roles[0] ?? null,current.organization_id,body.scoreId,
          { note: body.note, before: { theory: Number(current.theory_score), cleaning: Number(current.cleaning_score), image: Number(current.image_annotation_score), text: Number(current.text_annotation_score), audio: Number(current.audio_score), statistics: Number(current.statistics_score), total: Number(current.total_score) }, after: { ...next, total, passed } }]);
      return { scoreId: body.scoreId, totalScore: total, passed, status: 'reviewed' as const };
    });
    if ('error' in result) return result.error;
    return ok(result);
  } catch (error) { return catchError(error); }
}
