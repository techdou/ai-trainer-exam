import { dbExec, dbQuery } from '@/server/db';

/**
 * 学员激励层: 积分规则 + 勋章定义 + 授予逻辑。
 * 设计原则:
 * - 积分只进不出(正向激励),同一题目/任务/考试的得分幂等(防重复刷分)。
 * - 勋章带质量维度(连对/满分),不是纯次数堆砌。
 * - 所有 award 函数吞掉自身异常: 激励是增强功能,绝不能拖垮判分主流程。
 */

export const POINT_RULES = {
  /** 理论题答对(每题仅首次答对得分) */
  practice_correct: 2,
  /** 连续答对每满 5 题,一次性奖励 */
  streak_bonus: 5,
  /** 实操任务首次通过(每任务一次) */
  task_first_pass: 10,
  /** 首次通过正式考试 */
  exam_first_pass: 50,
  /** 再次通过正式考试(每场考试仅一次) */
  exam_pass: 20,
} as const;

export interface BadgeDef {
  key: string;
  name: string;
  emoji: string;
  description: string;
  category: 'study' | 'streak' | 'task' | 'exam';
}

/** 勋章定义的单一来源;获得记录存 student_badges 表。 */
export const BADGES: BadgeDef[] = [
  { key: 'first_practice', name: '初出茅庐', emoji: '🌱', description: '第一次答对理论练习题', category: 'study' },
  { key: 'correct_50', name: '小试牛刀', emoji: '📗', description: '累计答对 50 道理论题', category: 'study' },
  { key: 'correct_200', name: '练习达人', emoji: '📚', description: '累计答对 200 道理论题', category: 'study' },
  { key: 'streak_10', name: '行云流水', emoji: '⚡', description: '连续答对 10 道题', category: 'streak' },
  { key: 'task_first', name: '实操新手', emoji: '🔧', description: '首次通过实操任务', category: 'task' },
  { key: 'task_pass_10', name: '实操达人', emoji: '🛠️', description: '通过 10 个不同的实操任务', category: 'task' },
  { key: 'exam_first_pass', name: '首战告捷', emoji: '🏅', description: '首次通过正式考试', category: 'exam' },
  { key: 'exam_perfect', name: '满分传奇', emoji: '👑', description: '正式考试取得满分', category: 'exam' },
];

async function addPoints(userId: string, organizationId: string | null, reason: string, points: number, refType: string, refId: string): Promise<void> {
  await dbExec(
    `INSERT INTO student_points_ledger (user_id, organization_id, reason, points, ref_type, ref_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    userId, organizationId, reason, points, refType, refId,
  );
}

async function hasLedger(userId: string, reasons: string[], refId: string): Promise<boolean> {
  const rows = await dbQuery<{ one: number }>(
    `SELECT 1 AS one FROM student_points_ledger
      WHERE user_id=$1 AND reason = ANY($2) AND ref_id=$3 LIMIT 1`,
    userId, reasons, refId,
  );
  return rows.length > 0;
}

/** 理论题答对后调用: 基础分(每题一次) + 连对奖励 + 勋章评估。 */
export async function awardPracticeCorrect(userId: string, organizationId: string | null, questionId: string): Promise<void> {
  try {
    if (!(await hasLedger(userId, ['practice_correct'], questionId))) {
      await addPoints(userId, organizationId, 'practice_correct', POINT_RULES.practice_correct, 'theory_question', questionId);
    }
    // 连对判定: 取最近 60 条理论练习记录,数头部连续答对数。
    const recent = await dbQuery<{ passed: boolean }>(
      `SELECT passed FROM practice_attempts
        WHERE user_id=$1 AND item_type='theory_question' AND passed IS NOT NULL
        ORDER BY created_at DESC LIMIT 60`,
      userId,
    );
    let streak = 0;
    for (const row of recent) {
      if (row.passed) streak++;
      else break;
    }
    if (streak > 0 && streak % 5 === 0) {
      // bonus 挂当前题 ref: streak 严格递增,每个 5 倍数只经过一次,天然不重复。
      await addPoints(userId, organizationId, 'streak_bonus', POINT_RULES.streak_bonus, 'theory_question', questionId);
    }
    if (streak >= 10) await grantBadge(userId, 'streak_10');
    await evaluateBadges(userId);
  } catch (error) {
    console.error('[gamification] awardPracticeCorrect failed:', error);
  }
}

/** 实操任务通过后调用: 首次通过得分(每任务一次) + 勋章评估。 */
export async function awardTaskPass(userId: string, organizationId: string | null, taskId: string): Promise<void> {
  try {
    if (!(await hasLedger(userId, ['task_first_pass'], taskId))) {
      await addPoints(userId, organizationId, 'task_first_pass', POINT_RULES.task_first_pass, 'task_template', taskId);
    }
    await evaluateBadges(userId);
  } catch (error) {
    console.error('[gamification] awardTaskPass failed:', error);
  }
}

/** 成绩发布且通过后调用: 考试得分(每场一次,首考与补考分值不同) + 满分勋章。 */
export async function awardExamPass(userId: string, organizationId: string | null, scheduleId: string, totalScore: number, maxScore: number): Promise<void> {
  try {
    if (!(await hasLedger(userId, ['exam_first_pass', 'exam_pass'], scheduleId))) {
      const anyExamPass = await dbQuery<{ one: number }>(
        `SELECT 1 AS one FROM student_points_ledger WHERE user_id=$1 AND reason IN ('exam_first_pass','exam_pass') LIMIT 1`,
        userId,
      );
      const reason = anyExamPass.length ? 'exam_pass' : 'exam_first_pass';
      const points = reason === 'exam_first_pass' ? POINT_RULES.exam_first_pass : POINT_RULES.exam_pass;
      await addPoints(userId, organizationId, reason, points, 'exam_schedule', scheduleId);
    }
    if (maxScore > 0 && totalScore >= maxScore) await grantBadge(userId, 'exam_perfect');
    await evaluateBadges(userId);
  } catch (error) {
    console.error('[gamification] awardExamPass failed:', error);
  }
}

async function grantBadge(userId: string, badgeKey: string): Promise<void> {
  await dbExec(
    `INSERT INTO student_badges (user_id, badge_key, earned_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, badge_key) DO NOTHING`,
    userId, badgeKey,
  );
}

/** 按累计统计补发应得未得的勋章(streak/满分这类实时勋章在 award 时点已授)。 */
async function evaluateBadges(userId: string): Promise<void> {
  const [stats] = await dbQuery<{ correct_total: string; task_pass_total: string; exam_pass_total: string }>(
    `SELECT
       (SELECT COUNT(*) FROM practice_attempts WHERE user_id=$1 AND item_type='theory_question' AND passed) AS correct_total,
       (SELECT COUNT(DISTINCT item_id) FROM practice_attempts WHERE user_id=$1 AND item_type='task_template' AND passed) AS task_pass_total,
       (SELECT COUNT(DISTINCT ref_id) FROM student_points_ledger WHERE user_id=$1 AND reason IN ('exam_first_pass','exam_pass')) AS exam_pass_total`,
    userId,
  );
  if (!stats) return;
  const earned = new Set(await dbQuery<{ badge_key: string }>('SELECT badge_key FROM student_badges WHERE user_id=$1', userId).then(rows => rows.map(r => r.badge_key)));
  const due: string[] = [];
  const correct = Number(stats.correct_total);
  const taskPass = Number(stats.task_pass_total);
  const examPass = Number(stats.exam_pass_total);
  if (correct >= 1) due.push('first_practice');
  if (correct >= 50) due.push('correct_50');
  if (correct >= 200) due.push('correct_200');
  if (taskPass >= 1) due.push('task_first');
  if (taskPass >= 10) due.push('task_pass_10');
  if (examPass >= 1) due.push('exam_first_pass');
  for (const key of due) {
    if (!earned.has(key)) await grantBadge(userId, key);
  }
}

/** 学员激励总览(API 用): 总积分 + 勋章墙 + 班级排行榜 + 进度统计。 */
export async function getGamificationSummary(userId: string, organizationId: string | null) {
  const [pointsRow] = await dbQuery<{ total: string }>(
    'SELECT COALESCE(SUM(points), 0) AS total FROM student_points_ledger WHERE user_id=$1', userId,
  );
  const earnedRows = await dbQuery<{ badge_key: string; earned_at: string }>(
    'SELECT badge_key, earned_at FROM student_badges WHERE user_id=$1', userId,
  );
  const earnedMap = new Map(earnedRows.map(r => [r.badge_key, r.earned_at]));
  const [stats] = await dbQuery<{ correct_total: string; task_pass_total: string }>(
    `SELECT
       (SELECT COUNT(*) FROM practice_attempts WHERE user_id=$1 AND item_type='theory_question' AND passed) AS correct_total,
       (SELECT COUNT(DISTINCT item_id) FROM practice_attempts WHERE user_id=$1 AND item_type='task_template' AND passed) AS task_pass_total`,
    userId,
  );
  // 当前连对数与授予逻辑同口径: 最近记录从头数连续答对。
  const recent = await dbQuery<{ passed: boolean }>(
    `SELECT passed FROM practice_attempts
      WHERE user_id=$1 AND item_type='theory_question' AND passed IS NOT NULL
      ORDER BY created_at DESC LIMIT 60`,
    userId,
  );
  let streak = 0;
  for (const row of recent) {
    if (row.passed) streak++;
    else break;
  }
  // 班级排行榜: 学员所在 active 班级内按积分和排名, 取前 10 + 自己。
  const rankRows = await dbQuery<{ user_id: string; display_name: string | null; total: string }>(
    `SELECT p.id AS user_id, p.display_name, COALESCE(pts.total, 0) AS total
       FROM enrollments e
       JOIN profiles p ON p.id = e.user_id
       LEFT JOIN (SELECT user_id, SUM(points) AS total FROM student_points_ledger GROUP BY user_id) pts ON pts.user_id = p.id
      WHERE e.cohort_id IN (SELECT cohort_id FROM enrollments WHERE user_id=$1 AND status='active')
        AND e.status='active'
      ORDER BY COALESCE(pts.total, 0) DESC, p.display_name ASC`,
    userId,
  );
  const rankList = rankRows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    displayName: row.display_name ?? '学员',
    points: Number(row.total),
    isMe: row.user_id === userId,
  }));
  const myRank = rankList.find(r => r.isMe)?.rank ?? null;
  return {
    points: Number(pointsRow?.total ?? 0),
    badges: BADGES.map(b => ({ ...b, earnedAt: earnedMap.get(b.key) ?? null })),
    stats: {
      correctTotal: Number(stats?.correct_total ?? 0),
      taskPassTotal: Number(stats?.task_pass_total ?? 0),
      streak,
    },
    rank: {
      myRank,
      totalStudents: rankList.length,
      top: rankList.filter(r => r.rank <= 10 || r.isMe),
    },
    organizationId,
  };
}
