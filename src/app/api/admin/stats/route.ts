import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, catchError } from '@/lib/api';

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

    // import_jobs 的行数列名是 total_count(历史写成 total_rows 导致该查询必炸, 被 catch 吞掉恒为空)。
    const recentImports = await dbQuery<{ id: string; created_at: string; status: string; total_count: number }>(
      `SELECT id, created_at, status, total_count FROM import_jobs ORDER BY created_at DESC LIMIT 5`
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
    // 统一走 catchError: ApiError(401/403) 透传状态码, 其余才 500。
    // 之前用 err.message.includes('401') 匹配, 但 ApiError 消息是中文不含状态码, 永远落入 500。
    return catchError(err);
  }
}
