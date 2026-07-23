import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import {ok, fail, catchError} from '@/lib/api';

/**
 * POST /api/teacher/exams - 创建考试
 *
 * 流程: 创建试卷 → 添加试卷题目 → 创建考试安排
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const {
      title,
      cohortId,
      startTime: examStartAt,
      endTime: examEndAt,
      lateEntryMinutes,
      questionIds,
      durationMinutes,
    } = body;

    if (!title || !cohortId || !examStartAt || !examEndAt) {
      return fail(400, '缺少必填参数：title, cohortId, startTime, endTime');
    }

    // 1. 创建试卷（exam_papers）
    const paperRows = await dbQuery<{ id: string }>(
      `INSERT INTO exam_papers (title, organization_id, total_score, pass_score, duration_minutes, status)
       VALUES ($1, $2, 100, 60, $3, 'draft')
       RETURNING id`,
      title, user.organizationId || '00000000-0000-0000-0000-000000000001', durationMinutes || 90,
    );

    const paperId = paperRows[0]?.id;
    if (!paperId) {
      return fail(500, '创建试卷失败');
    }

    // 2. 插入试卷题目（exam_paper_items）
    // exam_paper_items schema: paper_id, item_type, item_id, sort_order, score, section
    if (questionIds && questionIds.length > 0) {
      for (let idx = 0; idx < questionIds.length; idx++) {
        const qid = questionIds[idx];
        await dbExec(
          `INSERT INTO exam_paper_items (paper_id, item_type, item_id, sort_order, score, section)
           VALUES ($1, 'question', $2, $3, 5, 'theory')`,
          paperId, qid, idx + 1,
        );
      }
    }

    // 3. 创建考试安排
    const scheduleRows = await dbQuery<{ id: string }>(
      `INSERT INTO exam_schedules (organization_id, title, cohort_id, paper_id, exam_start_at, exam_end_at, late_entry_minutes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
       RETURNING id`,
      user.organizationId || '00000000-0000-0000-0000-000000000001',
      title, cohortId, paperId, examStartAt, examEndAt,
      lateEntryMinutes || 15, user.id,
    );

    const scheduleId = scheduleRows[0]?.id;

    return ok({ scheduleId, paperId });
  } catch (e: unknown) {
    return catchError(e);
  }
}

/**
 * GET /api/teacher/exams - 获取考试列表
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['teacher', 'super_admin']);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let whereClause = 'WHERE s.deleted_at IS NULL';
    const params: unknown[] = [];
    if (status) {
      whereClause += ' AND s.status = $1';
      params.push(status);
    }

    const schedules = await dbQuery<{
      id: string;
      title: string;
      cohort_id: string;
      exam_start_at: string;
      exam_end_at: string;
      late_entry_minutes: number;
      status: string;
      paper_id: string;
      created_at: string;
      paper_title: string | null;
      duration_minutes: number | null;
    }>(
      `SELECT s.id, s.title, s.cohort_id, s.exam_start_at, s.exam_end_at,
              s.late_entry_minutes, s.status, s.paper_id, s.created_at,
              p.title as paper_title, p.duration_minutes
       FROM exam_schedules s
       LEFT JOIN exam_papers p ON p.id = s.paper_id
       ${whereClause}
       ORDER BY s.exam_start_at DESC`,
      ...params,
    );

    return ok(schedules);
  } catch (e: unknown) {
    return catchError(e);
  }
}
