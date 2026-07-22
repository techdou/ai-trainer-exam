import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, fail } from '@/lib/api';

/** GET /api/teacher/dashboard - 教师仪表盘数据 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['teacher', 'super_admin']);

    // 教师关联的班级 (通过 teacher_cohort_grants)
    const cohortRows = await dbQuery<{ cohort_id: string }>(`
      SELECT cohort_id FROM teacher_cohort_grants WHERE teacher_id = $1
    `, user.id);
    const cohortIds = cohortRows.map(r => r.cohort_id);

    // 如果没有关联班级，返回空数据
    if (cohortIds.length === 0) {
      return ok({
        cohortCount: 0,
        studentCount: 0,
        activeAssignments: 0,
        avgPracticeScore: null,
      });
    }

    // 学员人数
    const studentRows = await dbQuery<{ count: string }>(`
      SELECT COUNT(DISTINCT e.user_id) as count
      FROM enrollments e
      WHERE e.cohort_id = ANY($1::text[])
    `, cohortIds);
    const studentCount = Number(studentRows[0]?.count ?? 0);

    // 进行中的作业数
    const assignmentRows = await dbQuery<{ count: string }>(`
      SELECT COUNT(*) as count FROM practice_assignments
      WHERE cohort_id = ANY($1::text[])
    `, cohortIds);
    const activeAssignments = Number(assignmentRows[0]?.count ?? 0);

    // 练习平均正确率
    const avgRows = await dbQuery<{ avg: string | null }>(`
      SELECT AVG(CASE WHEN passed THEN 100 ELSE 0 END) as avg
      FROM practice_attempts
      WHERE user_id IN (
        SELECT DISTINCT e.user_id FROM enrollments e WHERE e.cohort_id = ANY($1::text[])
      )
    `, cohortIds);
    const avgPracticeScore = avgRows[0]?.avg ? Math.round(Number(avgRows[0].avg)) : null;

    return ok({
      cohortCount: cohortIds.length,
      studentCount,
      activeAssignments,
      avgPracticeScore,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    const status = msg.includes('请先登录') ? 401 : msg.includes('权限') ? 403 : 500;
    return fail(status, status === 500 ? '服务器开小差了，请稍后再试' : msg);
  }
}
