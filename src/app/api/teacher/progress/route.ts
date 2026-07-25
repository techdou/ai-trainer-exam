import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { catchError, ok } from '@/lib/api';

interface ProgressRow {
  id: string;
  display_name: string;
  student_no: string | null;
  cohort_name: string;
  assignment_count: string;
  attempted_count: string;
  passed_count: string;
  practice_score_rate: string | null;
  exam_score_rate: string | null;
  last_activity_at: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['teacher', 'school_admin', 'super_admin']);
    const args: unknown[] = [];
    let scope = 'TRUE';
    // examScope 作用于 exam_avg CTE(别名 es): 考试得分率只统计当前用户权限范围内的考试,
    // 避免学员在其他机构/其他教师班级的历史成绩混入(数据越权)。
    let examScope = 'TRUE';
    if (user.roles.includes('teacher') && !user.roles.includes('super_admin')) {
      args.push(user.id);
      scope = `EXISTS (SELECT 1 FROM teacher_cohort_grants g WHERE g.cohort_id = c.id AND g.teacher_id = $${args.length})`;
      examScope = `EXISTS (SELECT 1 FROM teacher_cohort_grants g WHERE g.cohort_id = es.cohort_id AND g.teacher_id = $${args.length})`;
    } else if (!user.roles.includes('super_admin')) {
      args.push(user.organizationId);
      scope = `c.organization_id = $${args.length}`;
      examScope = `es.organization_id = $${args.length}`;
    }
    // 口径说明(修复历史三个 bug):
    // 1. 同一题多次作答只计最近一次(DISTINCT ON), 重做不再重复进入平均值;
    // 2. 覆盖率分母用"去重后的布置题目数", 同一题被多个作业复用不会导致覆盖率 >100%;
    // 3. 练习得分率与考试得分率分开返回, 不再混叫"平均分"。
    const rows = await dbQuery<ProgressRow>(
      `WITH assign_items AS (
         SELECT DISTINCT cohort_id, item_type, item_id FROM practice_assignments
       ),
       latest AS (
         SELECT DISTINCT ON (user_id, item_type, item_id)
                user_id, item_type, item_id, score, max_score, passed, updated_at
           FROM practice_attempts
          ORDER BY user_id, item_type, item_id, submitted_at DESC NULLS LAST, updated_at DESC
       ),
       exam_avg AS (
         SELECT sc.user_id,
                AVG(CASE WHEN sc.max_score > 0 THEN sc.total_score / sc.max_score * 100 END) AS rate
           FROM exam_scores sc
           JOIN exam_schedules es ON es.id = sc.schedule_id
          WHERE ${examScope}
          GROUP BY sc.user_id
       )
       SELECT p.id, p.display_name, p.student_no, c.name AS cohort_name,
              COUNT(ai.item_id)::text AS assignment_count,
              COUNT(l.item_id)::text AS attempted_count,
              COUNT(l.item_id) FILTER (WHERE l.passed)::text AS passed_count,
              AVG(CASE WHEN l.max_score > 0 THEN l.score / l.max_score * 100 END)::text AS practice_score_rate,
              ea.rate::text AS exam_score_rate,
              MAX(l.updated_at)::text AS last_activity_at
         FROM profiles p
         JOIN enrollments e ON e.user_id = p.id AND e.status = 'active'
         JOIN cohorts c ON c.id = e.cohort_id AND c.deleted_at IS NULL
         LEFT JOIN assign_items ai ON ai.cohort_id = c.id
         LEFT JOIN latest l ON l.user_id = p.id AND l.item_type = ai.item_type AND l.item_id = ai.item_id
         LEFT JOIN exam_avg ea ON ea.user_id = p.id
        WHERE p.status = 'active' AND ${scope}
        GROUP BY p.id, c.id, c.name, ea.rate
        ORDER BY c.name, p.display_name`,
      ...args,
    );
    return ok({ items: rows.map(row => ({
      id: row.id,
      displayName: row.display_name,
      studentNo: row.student_no,
      cohortName: row.cohort_name,
      assignmentCount: Number(row.assignment_count),
      attemptedCount: Number(row.attempted_count),
      passedCount: Number(row.passed_count),
      practiceScoreRate: row.practice_score_rate === null ? null : Math.round(Number(row.practice_score_rate)),
      examScoreRate: row.exam_score_rate === null ? null : Math.round(Number(row.exam_score_rate)),
      lastActivityAt: row.last_activity_at,
    })), total: rows.length });
  } catch (error) {
    return catchError(error);
  }
}
