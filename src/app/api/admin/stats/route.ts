import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, fail } from '@/lib/api';

export async function GET(_request: NextRequest) {
  try {
    await requireRole(_request as unknown as Request, ['super_admin', 'school_admin']);

    const [practiceCount, examCount, studentRows, teacherRows, cohortRows] = await Promise.all([
      dbQuery<{ count: string }>('SELECT COUNT(*) as count FROM practice_question_items WHERE deleted_at IS NULL'),
      dbQuery<{ count: string }>('SELECT COUNT(*) as count FROM exam_question_items WHERE deleted_at IS NULL'),
      dbQuery<{ count: string }>(`SELECT COUNT(*) as count FROM user_roles WHERE role = 'student'`),
      dbQuery<{ count: string }>(`SELECT COUNT(*) as count FROM user_roles WHERE role = 'teacher'`),
      dbQuery<{ count: string }>('SELECT COUNT(*) as count FROM cohorts WHERE deleted_at IS NULL'),
    ]);

    const recentImports = await dbQuery<{ id: string; created_at: string; status: string; total_rows: number }>(
      `SELECT id, created_at, status, total_rows FROM import_jobs ORDER BY created_at DESC LIMIT 5`
    ).catch(() => []);

    return ok({
      practiceQuestions: parseInt(practiceCount[0]?.count || '0'),
      examQuestions: parseInt(examCount[0]?.count || '0'),
      students: parseInt(studentRows[0]?.count || '0'),
      teachers: parseInt(teacherRows[0]?.count || '0'),
      cohorts: parseInt(cohortRows[0]?.count || '0'),
      recentImports,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('401')) return fail(401, '未登录');
    if (err instanceof Error && err.message.includes('403')) return fail(403, '无权限');
    return fail(500, '服务器开小差了，请稍后再试');
  }
}
