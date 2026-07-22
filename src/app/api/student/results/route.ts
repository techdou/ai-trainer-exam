import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, fail } from '@/lib/api';

/** GET /api/student/results - 学员查看自己的考试成绩 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['student']);

    type ScoreRow = {
      id: string;
      schedule_id: string;
      schedule_title: string;
      total_score: number;
      max_score: number;
      passed: boolean;
      status: string;
      created_at: string;
    };

    const results = await dbQuery<ScoreRow>(
      `SELECT sc.id, sc.schedule_id, s.title as schedule_title,
              sc.total_score, sc.max_score, sc.passed, sc.status, sc.created_at
       FROM exam_scores sc
       INNER JOIN exam_schedules s ON s.id = sc.schedule_id
       WHERE sc.user_id = $1
       ORDER BY sc.created_at DESC`,
      user.id,
    );

    return ok(results.map(r => ({
      id: r.id,
      scheduleId: r.schedule_id,
      scheduleTitle: r.schedule_title,
      totalScore: Number(r.total_score),
      maxScore: Number(r.max_score),
      passed: r.passed,
      status: r.status,
      createdAt: r.created_at,
    })));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    console.error('[student/results] GET error:', msg);
    return fail(500, '服务器开小差了，请稍后再试');
  }
}
