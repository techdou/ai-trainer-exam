import { requireRole } from '@/server/auth';
import { ok, fail } from '@/lib/api';
import { dbQuery, dbOne } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requireRole(request, ['student']);

    const stats = await dbOne<{ total: string; correct: string }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE passed = true) AS correct
       FROM practice_attempts
       WHERE user_id = $1 AND item_type = 'theory_question'`,
      user.id,
    );

    // 最近的未归档考试安排（学员所在班级）
    const exam = await dbOne<{
      id: string; title: string; exam_start_at: string; status: string;
    }>(
      `SELECT es.id, es.title, es.exam_start_at, es.status
       FROM exam_schedules es
       WHERE es.cohort_id = ANY($1::text[])
         AND es.status IN ('published', 'waiting', 'practice_locked', 'exam_open')
       ORDER BY es.exam_start_at ASC
       LIMIT 1`,
      user.cohortIds.length > 0 ? user.cohortIds : ['__none__'],
    );

    return ok({
      displayName: user.displayName,
      onboardingCompleted: false,
      practiceStats: {
        totalAttempts: Number(stats?.total ?? 0),
        correctRate:
          stats && Number(stats.total) > 0 ? Number(stats.correct) / Number(stats.total) : null,
      },
      upcomingExam: exam
        ? { id: exam.id, title: exam.title, examStartAt: exam.exam_start_at, status: exam.status }
        : null,
      lockedPractice: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '服务器开小差了';
    const status = e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : 500;
    return fail(status, msg);
  }
}
