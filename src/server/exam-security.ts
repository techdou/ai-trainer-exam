import type { PoolClient } from 'pg';
import { ApiError, type SessionUser } from '@/server/auth';
import { dbOne, dbQuery } from '@/server/db';
import type { ExamStatus } from '@/lib/constants';
import { isScheduleStartableStatus } from './exam-status';
export { isScheduleStartableStatus } from './exam-status';

export interface ScheduleAccessRow {
  id: string;
  organization_id: string | null;
  paper_id: string;
  cohort_id: string;
  status: ExamStatus;
  practice_lock_at: Date | string | null;
  exam_start_at: Date | string;
  exam_end_at: Date | string;
  late_entry_minutes: number;
  submit_grace_seconds: number;
  results_release_at: Date | string | null;
  results_released: boolean;
  duration_minutes: number;
  pass_score: number;
  paper_version: number;
}

export async function assertPracticeUnlocked(user: SessionUser): Promise<void> {
  if (!user.roles.includes('student')) return;
  const row = await dbOne<{ id: string; title: string; practice_lock_at: Date }>(
    `SELECT s.id, s.title, s.practice_lock_at
       FROM exam_schedules s
       JOIN enrollments e ON e.cohort_id = s.cohort_id AND e.user_id = $1 AND e.status = 'active'
      WHERE s.deleted_at IS NULL
        AND s.practice_lock_at IS NOT NULL
        AND s.practice_lock_at <= NOW()
        AND s.exam_end_at + make_interval(secs => s.submit_grace_seconds) >= NOW()
        AND s.status NOT IN ('draft', 'archived')
      ORDER BY s.practice_lock_at ASC
      LIMIT 1`,
    user.id,
  );
  if (row) throw new ApiError(423, `练习已锁定，请进入“${row.title}”考试`);
}

export async function getScheduleForStudent(scheduleId: string, userId: string): Promise<ScheduleAccessRow | null> {
  return dbOne<ScheduleAccessRow>(
    `SELECT s.id, s.organization_id, s.paper_id, s.cohort_id, s.status,
            s.practice_lock_at, s.exam_start_at, s.exam_end_at,
            s.late_entry_minutes, s.submit_grace_seconds,
            s.results_release_at, s.results_released,
            p.duration_minutes, p.pass_score, p.version AS paper_version
       FROM exam_schedules s
       JOIN exam_papers p ON p.id = s.paper_id AND p.deleted_at IS NULL
       JOIN enrollments e ON e.cohort_id = s.cohort_id AND e.user_id = $2 AND e.status = 'active'
      WHERE s.id = $1 AND s.deleted_at IS NULL`,
    scheduleId,
    userId,
  );
}

/**
 * 以下时间断言的 now 一律要求调用方传入数据库时间(dbNow() 或事务内 SELECT now()),
 * 进程时间(Date.now())在多实例部署或时钟漂移时会破坏考试公平性。
 */
export function assertScheduleCanStart(schedule: ScheduleAccessRow, now: number): void {
  if (!isScheduleStartableStatus(schedule.status)) throw new ApiError(403, '当前考试状态不允许开始考试');
  const start = new Date(schedule.exam_start_at).getTime();
  const end = new Date(schedule.exam_end_at).getTime();
  const latestEntry = Math.min(end, start + schedule.late_entry_minutes * 60_000);
  if (now < start) throw new ApiError(409, '考试尚未开始');
  if (now > end) throw new ApiError(409, '考试已经结束');
  if (now > latestEntry) throw new ApiError(409, '已超过迟到入场时间');
}

export function attemptDeadline(schedule: ScheduleAccessRow, startedAt: number): Date {
  const scheduleEnd = new Date(schedule.exam_end_at).getTime();
  const durationEnd = startedAt + schedule.duration_minutes * 60_000;
  return new Date(Math.min(scheduleEnd, durationEnd));
}

export function assertAttemptOpen(attempt: { status: string; server_deadline: Date | string | null }, schedule: ScheduleAccessRow, now: number): void {
  if (!['not_started', 'in_progress'].includes(attempt.status)) throw new ApiError(409, '考试已经提交，不能继续作答');
  const deadline = attempt.server_deadline ? new Date(attempt.server_deadline).getTime() : new Date(schedule.exam_end_at).getTime();
  const graceEnd = deadline + schedule.submit_grace_seconds * 1000;
  if (now > graceEnd) throw new ApiError(409, '已超过交卷宽限时间');
}

export const EXAM_STATUS_TRANSITIONS: Readonly<Record<ExamStatus, readonly ExamStatus[]>> = Object.freeze({
  draft: ['published'],
  published: ['waiting', 'practice_locked', 'archived'],
  waiting: ['practice_locked', 'exam_open', 'archived'],
  practice_locked: ['exam_open', 'exam_closed', 'archived'],
  exam_open: ['exam_closed'],
  exam_closed: ['grading'],
  grading: ['results_pending'],
  results_pending: ['results_released'],
  results_released: ['archived'],
  archived: [],
});

export function assertExamStatusTransition(from: string, to: string): asserts to is ExamStatus {
  const allowed = EXAM_STATUS_TRANSITIONS[from as ExamStatus];
  if (!allowed || !allowed.includes(to as ExamStatus)) throw new ApiError(409, `不允许从 ${from} 变更为 ${to}`);
}

export function assertOrganizationScope(user: SessionUser, organizationId: string | null): void {
  if (user.roles.includes('super_admin')) return;
  if (!organizationId || user.organizationId !== organizationId) throw new ApiError(403, '不能访问其他机构的数据');
}

export async function assertTeacherCohortAccess(user: SessionUser, cohortId: string): Promise<void> {
  if (user.roles.includes('super_admin') || user.roles.includes('school_admin')) return;
  const grant = await dbOne<{ ok: boolean }>(
    `SELECT true AS ok FROM teacher_cohort_grants WHERE teacher_id = $1 AND cohort_id = $2`,
    user.id,
    cohortId,
  );
  if (!grant) throw new ApiError(403, '未被授权访问该班级');
}

export async function lockAttempt(client: PoolClient, attemptId: string, userId: string, scheduleId: string): Promise<{ id: string; status: string; server_deadline: Date | null } | null> {
  const result = await client.query<{ id: string; status: string; server_deadline: Date | null }>(
    `SELECT id, status, server_deadline FROM exam_attempts
      WHERE id = $1 AND user_id = $2 AND schedule_id = $3
      FOR UPDATE`,
    [attemptId, userId, scheduleId],
  );
  return result.rows[0] ?? null;
}

export async function organizationForSchedule(scheduleId: string): Promise<string | null> {
  const row = await dbOne<{ organization_id: string | null }>('SELECT organization_id FROM exam_schedules WHERE id = $1', scheduleId);
  return row?.organization_id ?? null;
}

export async function listActiveScheduleIdsForUser(userId: string): Promise<string[]> {
  const rows = await dbQuery<{ id: string }>(
    `SELECT s.id FROM exam_schedules s JOIN enrollments e ON e.cohort_id = s.cohort_id
      WHERE e.user_id = $1 AND e.status = 'active' AND s.deleted_at IS NULL`,
    userId,
  );
  return rows.map(r => r.id);
}
