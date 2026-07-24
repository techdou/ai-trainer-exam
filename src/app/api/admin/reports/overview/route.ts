import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import {ok, fail, catchError} from '@/lib/api';

/**
 * GET /api/admin/reports/overview
 *
 * 管理端报表概览：成绩分布、知识点掌握、考试统计、练习统计
 */
export async function GET(request: NextRequest) {
  try {
    await requireRole(request as unknown as Request, ['super_admin']);

    // 1. 成绩分布（按分数段统计）
    const scoreDistribution = await dbQuery<{ range: string; count: string }>(
      `SELECT
        CASE
          WHEN total_score >= 90 THEN '90-100'
          WHEN total_score >= 80 THEN '80-89'
          WHEN total_score >= 70 THEN '70-79'
          WHEN total_score >= 60 THEN '60-69'
          WHEN total_score >= 50 THEN '50-59'
          ELSE '0-49'
        END AS range,
        COUNT(*) AS count
       FROM exam_scores
       GROUP BY range
       ORDER BY range DESC`
    );

    // 2. 考试通过率统计
    const examPassRate = await dbQuery<{
      schedule_id: string;
      schedule_title: string;
      total_takers: string;
      passed_count: string;
      avg_score: string;
    }>(
      `SELECT
        es.id AS schedule_id,
        es.title AS schedule_title,
        COUNT(esv.id) AS total_takers,
        COUNT(CASE WHEN esv.passed THEN 1 END) AS passed_count,
        COALESCE(AVG(esv.total_score), 0) AS avg_score
       FROM exam_schedules es
       LEFT JOIN exam_scores esv ON esv.schedule_id = es.id
       WHERE es.deleted_at IS NULL
       GROUP BY es.id, es.title
       ORDER BY es.exam_start_at DESC
       LIMIT 20`
    );

    // 3. 各班级成绩对比
    const cohortPerformance = await dbQuery<{
      cohort_id: string;
      cohort_name: string;
      student_count: string;
      avg_score: string;
      pass_rate: string;
    }>(
      `SELECT
        c.id AS cohort_id,
        c.name AS cohort_name,
        COUNT(DISTINCT esv.user_id) AS student_count,
        COALESCE(AVG(esv.total_score), 0) AS avg_score,
        COALESCE(
          COUNT(CASE WHEN esv.passed THEN 1 END)::numeric / NULLIF(COUNT(DISTINCT esv.user_id), 0) * 100,
          0
        ) AS pass_rate
       FROM cohorts c
       LEFT JOIN enrollments e ON e.cohort_id = c.id
       LEFT JOIN exam_scores esv ON esv.user_id = e.user_id
       WHERE c.deleted_at IS NULL
       GROUP BY c.id, c.name
       ORDER BY avg_score DESC
       LIMIT 20`
    );

    // 4. 练习题薄弱项（按错题类型统计）
    const practiceWeakAreas = await dbQuery<{
      item_type: string;
      wrong_count_sum: string;
      user_count: string;
    }>(
      `SELECT
        item_type,
        SUM(wrong_count) AS wrong_count_sum,
        COUNT(DISTINCT user_id) AS user_count
       FROM practice_wrong_items
       GROUP BY item_type
       ORDER BY wrong_count_sum DESC`
    );

    // 5. 最近考试活动
    const recentActivity = await dbQuery<{
      user_name: string;
      action: string;
      detail: string;
      created_at: string;
    }>(
      `SELECT
        p.display_name AS user_name,
        '考试' AS action,
        es.title AS detail,
        ea.submitted_at::text AS created_at
       FROM exam_attempts ea
       JOIN profiles p ON p.id = ea.user_id
       JOIN exam_schedules es ON es.id = ea.schedule_id
       WHERE ea.status IN ('submitted', 'graded')
       ORDER BY ea.submitted_at DESC
       LIMIT 10`
    );

    // 6. 总体统计概览
    const overallStats = await dbQuery<{ key: string; value: string }>(
      `SELECT 'total_exams' AS key, COUNT(*)::text AS value FROM exam_schedules WHERE deleted_at IS NULL
       UNION ALL
       SELECT 'total_attempts', COUNT(*)::text FROM exam_attempts
       UNION ALL
       SELECT 'total_passed', COUNT(*)::text FROM exam_scores WHERE passed = true
       UNION ALL
       SELECT 'avg_score', COALESCE(AVG(total_score)::text, '0') FROM exam_scores
       UNION ALL
       SELECT 'total_practice_items', COUNT(*)::text FROM practice_question_items WHERE deleted_at IS NULL
       UNION ALL
       SELECT 'total_exam_items', COUNT(*)::text FROM exam_question_items WHERE deleted_at IS NULL`
    ).catch(() => [] as { key: string; value: string }[]);

    return ok({
      scoreDistribution: scoreDistribution.map(d => ({
        range: d.range,
        count: parseInt(d.count),
      })),
      examPassRate: examPassRate.map(r => ({
        scheduleId: r.schedule_id,
        scheduleTitle: r.schedule_title,
        totalTakers: parseInt(r.total_takers),
        passedCount: parseInt(r.passed_count),
        avgScore: Number(r.avg_score),
        passRate: r.total_takers !== '0'
          ? Math.round(parseInt(r.passed_count) / parseInt(r.total_takers) * 100)
          : 0,
      })),
      cohortPerformance: cohortPerformance.map(c => ({
        cohortId: c.cohort_id,
        cohortName: c.cohort_name,
        studentCount: parseInt(c.student_count),
        avgScore: Math.round(Number(c.avg_score) * 10) / 10,
        passRate: Math.round(Number(c.pass_rate) * 10) / 10,
      })),
      practiceWeakAreas: practiceWeakAreas.map(p => ({
        itemType: p.item_type,
        totalWrong: parseInt(p.wrong_count_sum),
        affectedUsers: parseInt(p.user_count),
      })),
      recentActivity,
      overallStats: overallStats.reduce<Record<string, string>>(
        (acc, s) => {
          if (s && typeof s === 'object' && 'key' in s && 'value' in s) {
            const entry = s as { key: string; value: string };
            acc[entry.key] = entry.value;
          }
          return acc;
        },
        {},
      ),
    });
  } catch (e: unknown) {
    return catchError(e);
  }
}
