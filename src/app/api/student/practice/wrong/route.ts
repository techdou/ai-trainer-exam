import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { assertPracticeUnlocked } from '@/server/exam-security';
import { dbQuery } from '@/server/db';
import { catchError, ok } from '@/lib/api';

/** GET /api/student/practice/wrong — 获取学员错题本 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['student']);
    await assertPracticeUnlocked(user);
    const { searchParams } = new URL(request.url);
    const resolved = searchParams.get('resolved'); // 'true'|'false'|null(all)
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE w.user_id = $1 AND w.item_type = $2';
    const params: unknown[] = [user.id, 'theory_question'];
    const paramIdx = 3;

    if (resolved === 'true') {
      whereClause += ` AND w.resolved = true`;
    } else if (resolved === 'false') {
      whereClause += ` AND w.resolved = false`;
    }

    // 题目已软删的错题不再展示: INNER JOIN + deleted_at 过滤, count 与 items 同口径。
    const joinClause = 'JOIN practice_question_items q ON q.id = w.item_id AND q.deleted_at IS NULL';

    // Count total
    const countResult = await dbQuery<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM practice_wrong_items w ${joinClause} ${whereClause}`,
      ...params,
    );
    const total = parseInt(countResult[0]?.count || '0', 10);

    // 安全约束:不返回 answer_key;explanation 仅对已掌握(resolved)的题返回。
    // 待复习题的正确答案与解析必须在学员提交作答后由 practice/check 下发。
    const items = await dbQuery<{
      id: string;
      item_id: string;
      wrong_count: number;
      resolved: boolean;
      last_wrong_at: string;
      question_type: string;
      stem: string;
      options: unknown;
      explanation: string | null;
      knowledge_point: string | null;
    }>(
      `SELECT w.id, w.item_id, w.wrong_count, w.resolved, w.last_wrong_at,
              q.question_type, q.stem, q.options,
              CASE WHEN w.resolved THEN q.explanation ELSE NULL END AS explanation,
              q.knowledge_point
       FROM practice_wrong_items w
       ${joinClause}
       ${whereClause}
       ORDER BY w.last_wrong_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params,
      limit,
      offset,
    );

    return ok({ items, total, page, pageSize: limit });
  } catch (err) {
    return catchError(err);
  }
}
