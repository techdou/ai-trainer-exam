import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import {ok, fail, catchError } from '@/lib/api';

/** GET /api/student/practice/task - 列出学员可做的实操任务 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['student', 'super_admin', 'teacher']);

    // 获取学员所在班级的实操作业
    const tasks = await dbQuery<{
      id: string;
      title: string;
      task_type: string;
      instructions: string | null;
      difficulty: number;
      config: string;
      practice_only: boolean;
    }>(`
      SELECT t.id, t.title, t.task_type, t.instructions, t.difficulty, t.config, t.practice_only
      FROM practice_task_templates t
      INNER JOIN practice_assignments a ON a.item_id = t.id AND a.item_type = 'task_template'
      INNER JOIN enrollments e ON e.cohort_id = a.cohort_id AND e.user_id = $1
      WHERE t.deleted_at IS NULL AND t.review_status = 'published'
      ORDER BY t.difficulty ASC, t.title ASC
    `, user.id);

    // 为每个任务获取学员最近一次尝试
    const tasksWithAttempts = await Promise.all(tasks.map(async (t) => {
      const attempts = await dbQuery<{
        id: string;
        score: number;
        max_score: number;
        passed: boolean;
        status: string;
        created_at: string;
      }>(`
        SELECT id, score, max_score, passed, status, created_at
        FROM practice_attempts
        WHERE user_id = $1 AND item_type = 'task_template' AND item_id = $2
        ORDER BY created_at DESC LIMIT 1
      `, user.id, t.id);

      const config = typeof t.config === 'string' ? JSON.parse(t.config) : t.config;

      return {
        id: t.id,
        title: t.title,
        taskType: t.task_type,
        instructions: t.instructions,
        difficulty: t.difficulty,
        practiceOnly: t.practice_only,
        config, // pass full config so frontend can render dynamic data
        configPreview: {
          description: config.instructions || config.description || t.instructions || '',
          type: t.task_type,
        },
        lastAttempt: attempts[0] ? {
          id: attempts[0].id,
          score: Number(attempts[0].score),
          maxScore: Number(attempts[0].max_score ?? 100),
          passed: attempts[0].passed,
          status: attempts[0].status,
          createdAt: attempts[0].created_at,
        } : null,
      };
    }));

    return ok(tasksWithAttempts);
  } catch (e: unknown) {
    return catchError(e);
  }
}
