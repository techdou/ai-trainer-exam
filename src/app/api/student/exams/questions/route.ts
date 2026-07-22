import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, fail } from '@/lib/api';

/**
 * GET /api/student/exams/questions?scheduleId=xxx
 *
 * 获取某场考试的试卷题目列表（学员视角，不暴露答案）
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['student', 'super_admin', 'teacher']);

    const scheduleId = req.nextUrl.searchParams.get('scheduleId');
    if (!scheduleId) {
      return fail(400, '缺少 scheduleId 参数');
    }

    // 1. 获取考试安排和试卷信息
    const schedules = await dbQuery<{
      id: string;
      paper_id: string;
      exam_start_at: string;
      exam_end_at: string;
      submit_grace_seconds: number;
      duration_minutes: number;
    }>(
      `SELECT s.id, s.paper_id, s.exam_start_at, s.exam_end_at, s.submit_grace_seconds,
              p.duration_minutes
       FROM exam_schedules s
       LEFT JOIN exam_papers p ON p.id = s.paper_id
       WHERE s.id = $1 AND s.deleted_at IS NULL`,
      scheduleId,
    );

    if (schedules.length === 0) {
      return fail(404, '考试安排不存在');
    }

    const schedule = schedules[0];

    // 2. 验证考试时间
    const now = Date.now();
    const startAt = new Date(schedule.exam_start_at).getTime();
    const endAt = new Date(schedule.exam_end_at).getTime() + (schedule.submit_grace_seconds ?? 60) * 1000;
    const isTeacherOrAdmin = user.roles.includes('super_admin') || user.roles.includes('teacher');

    if (!isTeacherOrAdmin && (now < startAt || now > endAt)) {
      return fail(403, '不在考试时间范围内');
    }

    // 3. 获取试卷题目
    // 先从 exam_paper_items 获取题目列表
    let questions: Array<{
      id: string;
      question_type: string;
      stem: string;
      options: Record<string, string>;
      sort_order: number;
      score: number;
      section: string;
    }> = [];

    if (schedule.paper_id) {
      // 有试卷：从 paper_items 关联获取
      const paperItems = await dbQuery<{
        item_id: string;
        item_type: string;
        sort_order: number;
        score: number;
        section: string;
      }>(
        `SELECT item_id, item_type, sort_order, score, section
         FROM exam_paper_items WHERE paper_id = $1
         ORDER BY sort_order`,
        schedule.paper_id,
      );

      if (paperItems.length > 0) {
        const itemIds = paperItems.map(pi => pi.item_id);
        // 从 exam_question_items 和 practice_question_items 获取题目详情
        const placeholders = itemIds.map((_, i) => `$${i + 1}`).join(',');

        const examQuestions = await dbQuery<{
          id: string;
          question_type: string;
          stem: string;
          options: Record<string, string>;
        }>(
          `SELECT id, question_type, stem, options FROM exam_question_items WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
          ...itemIds,
        );

        // 如果 exam 题库找不到，从 practice 题库找
        const foundIds = new Set(examQuestions.map(q => q.id));
        const missingIds = itemIds.filter(id => !foundIds.has(id));

        let practiceQuestions: typeof examQuestions = [];
        if (missingIds.length > 0) {
          const ph2 = missingIds.map((_, i) => `$${i + 1}`).join(',');
          practiceQuestions = await dbQuery<{
            id: string;
            question_type: string;
            stem: string;
            options: Record<string, string>;
          }>(
            `SELECT id, question_type, stem, options FROM practice_question_items WHERE id IN (${ph2}) AND deleted_at IS NULL`,
            ...missingIds,
          );
        }

        const allQuestions = [...examQuestions, ...practiceQuestions];
        const questionMap = new Map(allQuestions.map(q => [q.id, q]));

        questions = paperItems.map(pi => {
          const q = questionMap.get(pi.item_id);
          return {
            id: pi.item_id,
            question_type: q?.question_type ?? pi.item_type,
            stem: q?.stem ?? '',
            options: q?.options ?? {},
            sort_order: pi.sort_order,
            score: Number(pi.score),
            section: pi.section,
          };
        }).filter(q => q.stem); // 过滤掉找不到的题目
      }
    }

    // 4. 如果没有试卷或试卷为空，回退到使用练习题库（开发阶段兼容）
    if (questions.length === 0) {
      questions = await dbQuery<{
        id: string;
        question_type: string;
        stem: string;
        options: Record<string, string>;
        sort_order: number;
        score: number;
        section: string;
      }>(
        `SELECT id, question_type, stem, options, 0 as sort_order, 5 as score, 'theory' as section
         FROM practice_question_items
         WHERE deleted_at IS NULL AND review_status = 'published'
         ORDER BY RANDOM() LIMIT 20`,
      );
    }

    // 5. 检查是否已有进行中的 attempt
    const attempts = await dbQuery<{ id: string; status: string; started_at: string }>(
      `SELECT id, status, started_at FROM exam_attempts
       WHERE user_id = $1 AND schedule_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      user.id, scheduleId,
    );

    // 创建或获取 attempt
    let attemptId: string | null = attempts[0]?.id ?? null;
    if (!attemptId || attempts[0]?.status === 'graded' || attempts[0]?.status === 'submitted') {
      // 需要创建新 attempt（前端提交时会创建，这里不自动创建）
      attemptId = null;
    }

    return ok({
      questions,
      durationMinutes: schedule.duration_minutes ?? 90,
      attemptId,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    if (msg.includes('401') || msg.includes('403')) {
      const code = msg.includes('401') ? 401 : 403;
      return fail(code, msg);
    }
    console.error('获取考试题目失败:', e);
    return fail(500, '服务器开小差了，请稍后再试');
  }
}
