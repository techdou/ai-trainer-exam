import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import { ok, fail } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['teacher', 'super_admin']);
    const body = await request.json();
    const { title, cohortId, startTime: examStartAt, endTime: examEndAt, lateEntryMinutes, questionIds } = body;

    if (!title || !cohortId || !examStartAt || !examEndAt) {
      return fail(400, '缺少必填参数');
    }

    // 1. 创建试卷（exam_papers）
    const paperRows = await dbQuery<{ id: string }>(
      `INSERT INTO exam_papers (title, organization_id, created_by, total_score, passing_score)
       VALUES ($1, $2, $3, 100, 60)
       RETURNING id`,
      title, user.organizationId || '00000000-0000-0000-0000-000000000001', user.id
    );

    const paperId = paperRows[0]?.id;
    if (!paperId) {
      return fail(500, '创建试卷失败');
    }

    // 2. 插入试卷题目（exam_paper_items）
    if (questionIds && questionIds.length > 0) {
      const values = questionIds.map((qid: string, idx: number) =>
        `('${paperId}', '${qid}', ${idx + 1}, 2)`
      ).join(',');
      await dbExec(
        `INSERT INTO exam_paper_items (paper_id, question_id, sequence, score) VALUES ${values}`
      );
    }

    // 3. 创建考试安排
    const scheduleRows = await dbQuery<{ id: string }>(
      `INSERT INTO exam_schedules (title, cohort_id, paper_id, exam_start_at, exam_end_at, late_entry_minutes, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7)
       RETURNING id`,
      title, cohortId, paperId, examStartAt, examEndAt, lateEntryMinutes || 15, user.id
    );

    const scheduleId = scheduleRows[0]?.id;

    return ok({ scheduleId, paperId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    if (msg.includes('401') || msg.includes('403')) {
      const code = msg.includes('401') ? 401 : 403;
      return fail(code, msg);
    }
    console.error('创建考试失败:', e);
    return fail(500, '服务器开小差了，请稍后再试');
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['teacher', 'super_admin']);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let whereClause = '';
    const params: unknown[] = [];
    if (status) {
      whereClause = 'WHERE status = $1';
      params.push(status);
    }

    const schedules = await dbQuery<{
      id: string; title: string; cohort_id: string; exam_start_at: string;
      exam_end_at: string; late_entry_minutes: number; status: string;
      paper_id: string; created_at: string;
    }>(
      `SELECT id, title, cohort_id, exam_start_at, exam_end_at, late_entry_minutes, status, paper_id, created_at
       FROM exam_schedules ${whereClause}
       ORDER BY exam_start_at DESC`,
      ...params
    );

    return ok(schedules);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    if (msg.includes('401') || msg.includes('403')) {
      const code = msg.includes('401') ? 401 : 403;
      return fail(code, msg);
    }
    return fail(500, '服务器开小差了，请稍后再试');
  }
}
