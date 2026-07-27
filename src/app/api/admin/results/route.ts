import { NextRequest } from 'next/server';
import { organizationScope, requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, catchError } from '@/lib/api';

/** GET /api/admin/results - 查询成绩 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin', 'invigilator']);

    const { searchParams } = new URL(req.url);
    const scheduleId = searchParams.get('scheduleId');
    const cohortId = searchParams.get('cohortId');
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const pageSize = Math.min(500, Math.max(1, Number(searchParams.get('pageSize') || '100')));

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIdx = 1;

    if (scheduleId) {
      whereClause += ` AND sc.schedule_id = $${paramIdx++}`;
      params.push(scheduleId);
    }

    if (cohortId) {
      whereClause += ` AND s.cohort_id = $${paramIdx++}`;
      params.push(cohortId);
    }

    const scopedOrg = organizationScope(user);
    if (scopedOrg) {
      whereClause += ` AND s.organization_id = $${paramIdx++}`;
      params.push(scopedOrg);
    }

    type ScoreRow = {
      id: string;
      user_id: string;
      user_email: string;
      user_name: string;
      schedule_id: string;
      schedule_title: string;
      attempt_id: string;
      theory_score: number;
      cleaning_score: number;
      image_annotation_score: number;
      text_annotation_score: number;
      audio_score: number;
      statistics_score: number;
      total_score: number;
      max_score: number;
      passed: boolean;
      status: string;
      auto_score_detail: string;
      created_at: string;
    };

    const countRow = await dbQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM exam_scores sc
       INNER JOIN exam_schedules s ON s.id = sc.schedule_id
       ${whereClause}`,
      ...params,
    );
    const total = parseInt(countRow[0]?.count ?? '0', 10);

    const results = await dbQuery<ScoreRow>(
      `SELECT sc.id, sc.user_id, p.email as user_email, p.display_name as user_name,
              sc.schedule_id, s.title as schedule_title, sc.attempt_id,
              sc.theory_score, sc.cleaning_score, sc.image_annotation_score,
              sc.text_annotation_score, sc.audio_score, sc.statistics_score,
              sc.total_score, sc.max_score, sc.passed, sc.status,
              sc.auto_score_detail::text as auto_score_detail, sc.created_at
       FROM exam_scores sc
       INNER JOIN exam_schedules s ON s.id = sc.schedule_id
       LEFT JOIN profiles p ON p.id = sc.user_id
       ${whereClause}
       ORDER BY sc.total_score DESC, sc.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      ...params,
      pageSize,
      (page - 1) * pageSize,
    );

    return ok({
      items: results.map(r => ({
        id: r.id,
        userId: r.user_id,
        userEmail: r.user_email,
        userName: r.user_name,
        scheduleId: r.schedule_id,
        scheduleTitle: r.schedule_title,
        attemptId: r.attempt_id,
        theoryScore: Number(r.theory_score),
        cleaningScore: Number(r.cleaning_score),
        imageAnnotationScore: Number(r.image_annotation_score),
        textAnnotationScore: Number(r.text_annotation_score),
        audioScore: Number(r.audio_score),
        statisticsScore: Number(r.statistics_score),
        totalScore: Number(r.total_score),
        maxScore: Number(r.max_score),
        passed: r.passed,
        status: r.status,
        autoScoreDetail: typeof r.auto_score_detail === 'string' ? JSON.parse(r.auto_score_detail) : r.auto_score_detail,
        createdAt: r.created_at,
      })),
      total,
      page,
      pageSize,
    });
  } catch (e: unknown) {
    // 统一走 catchError: ApiError(401/403) 透传状态码, 其余才 500。
    // 之前一律 fail(500), 越权/未登录被误报为服务器错误, 且 apiFetch 的 401 自动刷新永不触发。
    return catchError(e);
  }
}
