import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbOne, dbQuery, dbExec, dbTx } from '@/server/db';
import { ok, fail, catchError, parseBody } from '@/lib/api';
import { assertExamStatusTransition, assertOrganizationScope } from '@/server/exam-security';
import { EXAM_STATUS } from '@/lib/constants';

const createSchema = z.object({
  title: z.string().trim().min(2).max(300),
  cohortId: z.string().uuid(),
  paperId: z.string().uuid(),
  practiceOpenAt: z.string().datetime().optional().nullable(),
  practiceLockAt: z.string().datetime().optional().nullable(),
  examStartAt: z.string().datetime(),
  examEndAt: z.string().datetime(),
  lateEntryMinutes: z.number().int().min(0).max(120).default(15),
  submitGraceSeconds: z.number().int().min(0).max(1800).default(60),
  resultsReleaseAt: z.string().datetime().optional().nullable(),
});

const patchSchema = z.object({
  scheduleId: z.string().uuid(),
  status: z.enum(EXAM_STATUS).optional(),
  title: z.string().trim().min(2).max(300).optional(),
  practiceOpenAt: z.string().datetime().nullable().optional(),
  practiceLockAt: z.string().datetime().nullable().optional(),
  examStartAt: z.string().datetime().optional(),
  examEndAt: z.string().datetime().optional(),
  lateEntryMinutes: z.number().int().min(0).max(120).optional(),
  submitGraceSeconds: z.number().int().min(0).max(1800).optional(),
  resultsReleaseAt: z.string().datetime().nullable().optional(),
});

interface ScheduleOwner { id: string; organization_id: string | null; status: string; exam_start_at: string; exam_end_at: string }

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin', 'invigilator', 'auditor']);
    const status = new URL(req.url).searchParams.get('status');
    if (status && !EXAM_STATUS.includes(status as typeof EXAM_STATUS[number])) return fail(400, '考试状态不正确');

    const params: unknown[] = [];
    const where = ['s.deleted_at IS NULL'];
    if (status) { params.push(status); where.push(`s.status = $${params.length}`); }
    if (!user.roles.includes('super_admin')) {
      if (!user.organizationId) return fail(403, '账号未绑定机构');
      params.push(user.organizationId); where.push(`s.organization_id = $${params.length}`);
    }
    const schedules = await dbQuery<{
      id: string; title: string; organization_id: string; paper_id: string; cohort_id: string;
      cohort_name: string; paper_title: string; exam_start_at: string; exam_end_at: string;
      practice_open_at: string | null; practice_lock_at: string | null; results_release_at: string | null;
      late_entry_minutes: number; submit_grace_seconds: number; duration_minutes: number;
      status: string; results_released: boolean; created_at: string; attempt_count: string;
    }>(`SELECT s.id,s.title,s.organization_id,s.paper_id,s.cohort_id,c.name cohort_name,p.title paper_title,
               s.practice_open_at,s.practice_lock_at,s.exam_start_at,s.exam_end_at,s.results_release_at,
               s.late_entry_minutes,s.submit_grace_seconds,p.duration_minutes,s.status,s.results_released,s.created_at,
               (SELECT count(*)::text FROM exam_attempts a WHERE a.schedule_id=s.id) attempt_count
          FROM exam_schedules s JOIN cohorts c ON c.id=s.cohort_id JOIN exam_papers p ON p.id=s.paper_id
         WHERE ${where.join(' AND ')} ORDER BY s.exam_start_at DESC`, ...params);

    return ok(schedules.map(s => ({
      id: s.id, title: s.title, organizationId: s.organization_id, paperId: s.paper_id, cohortId: s.cohort_id,
      cohortName: s.cohort_name, paperTitle: s.paper_title, practiceOpenAt: s.practice_open_at,
      practiceLockAt: s.practice_lock_at, examStartAt: s.exam_start_at, examEndAt: s.exam_end_at,
      resultsReleaseAt: s.results_release_at, lateEntryMinutes: s.late_entry_minutes,
      submitGraceSeconds: s.submit_grace_seconds, durationMinutes: s.duration_minutes,
      status: s.status, resultsReleased: s.results_released, attemptCount: Number(s.attempt_count), createdAt: s.created_at,
    })));
  } catch (error) { return catchError(error); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);
    const body = await parseBody(req, createSchema);
    const organizationId = user.organizationId;
    if (!organizationId && !user.roles.includes('super_admin')) return fail(403, '账号未绑定机构');

    const start = new Date(body.examStartAt).getTime();
    const end = new Date(body.examEndAt).getTime();
    if (end <= start) return fail(400, '考试结束时间必须晚于开始时间');
    if (body.practiceLockAt && new Date(body.practiceLockAt).getTime() > start) return fail(400, '练习锁定时间不能晚于考试开始时间');
    if (body.practiceOpenAt && body.practiceLockAt && new Date(body.practiceOpenAt).getTime() >= new Date(body.practiceLockAt).getTime()) return fail(400, '练习开放时间必须早于锁定时间');

    const target = await dbOne<{ cohort_org: string; paper_org: string; paper_status: string; item_count: string }>(
      `SELECT c.organization_id cohort_org,p.organization_id paper_org,p.status paper_status,
              (SELECT count(*)::text FROM exam_paper_items i WHERE i.paper_id=p.id) item_count
         FROM cohorts c CROSS JOIN exam_papers p
        WHERE c.id=$1 AND p.id=$2 AND c.deleted_at IS NULL AND p.deleted_at IS NULL`, body.cohortId, body.paperId);
    if (!target) return fail(404, '班级或试卷不存在');
    if (!user.roles.includes('super_admin')) {
      assertOrganizationScope(user, target.cohort_org);
      assertOrganizationScope(user, target.paper_org);
    }
    if (target.cohort_org !== target.paper_org) return fail(400, '班级与试卷必须属于同一机构');
    if (target.paper_status !== 'published') return fail(409, '只能安排已发布试卷');
    if (Number(target.item_count) === 0) return fail(409, '试卷没有题目，不能安排考试');

    const row = await dbOne<{ id: string }>(
      `INSERT INTO exam_schedules(organization_id,title,cohort_id,paper_id,practice_open_at,practice_lock_at,
             exam_start_at,exam_end_at,late_entry_minutes,submit_grace_seconds,results_release_at,status,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12) RETURNING id`,
      target.cohort_org, body.title, body.cohortId, body.paperId, body.practiceOpenAt ?? null,
      body.practiceLockAt ?? null, body.examStartAt, body.examEndAt, body.lateEntryMinutes,
      body.submitGraceSeconds, body.resultsReleaseAt ?? null, user.id);
    return ok({ id: row!.id }, { status: 201 });
  } catch (error) { return catchError(error); }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin']);
    const body = await parseBody(req, patchSchema);
    const current = await dbOne<ScheduleOwner>('SELECT id,organization_id,status,exam_start_at,exam_end_at FROM exam_schedules WHERE id=$1 AND deleted_at IS NULL', body.scheduleId);
    if (!current) return fail(404, '考试安排不存在');
    assertOrganizationScope(user, current.organization_id);

    if (body.status) assertExamStatusTransition(current.status, body.status);
    const effectiveStart = body.examStartAt ?? current.exam_start_at;
    const effectiveEnd = body.examEndAt ?? current.exam_end_at;
    if (new Date(effectiveEnd).getTime() <= new Date(effectiveStart).getTime()) return fail(400, '考试结束时间必须晚于开始时间');
    if (current.status !== 'draft' && [body.examStartAt, body.examEndAt, body.practiceLockAt].some(v => v !== undefined)) return fail(409, '考试发布后不能修改关键时间，请新建考试安排');

    const fields: string[] = []; const values: unknown[] = [];
    const add = (column: string, value: unknown) => { values.push(value); fields.push(`${column}=$${values.length}`); };
    if (body.title !== undefined) add('title', body.title);
    if (body.practiceOpenAt !== undefined) add('practice_open_at', body.practiceOpenAt);
    if (body.practiceLockAt !== undefined) add('practice_lock_at', body.practiceLockAt);
    if (body.examStartAt !== undefined) add('exam_start_at', body.examStartAt);
    if (body.examEndAt !== undefined) add('exam_end_at', body.examEndAt);
    if (body.lateEntryMinutes !== undefined) add('late_entry_minutes', body.lateEntryMinutes);
    if (body.submitGraceSeconds !== undefined) add('submit_grace_seconds', body.submitGraceSeconds);
    if (body.resultsReleaseAt !== undefined) add('results_release_at', body.resultsReleaseAt);
    if (body.status !== undefined) add('status', body.status);
    if (fields.length === 0) return ok({ updated: false });

    await dbTx(async client => {
      values.push(body.scheduleId);
      await client.query(`UPDATE exam_schedules SET ${fields.join(',')},updated_at=NOW() WHERE id=$${values.length}`, values);
      await client.query(`INSERT INTO audit_logs(actor_id,actor_role,organization_id,action,entity_type,entity_id,detail)
                          VALUES($1,$2,$3,'exam_schedule_update','exam_schedule',$4,$5)`,
        [user.id, user.roles[0] ?? null, current.organization_id, body.scheduleId, { fromStatus: current.status, changes: body }]);
    });
    return ok({ updated: true });
  } catch (error) { return catchError(error); }
}
