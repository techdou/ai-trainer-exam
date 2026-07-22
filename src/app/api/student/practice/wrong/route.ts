import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';

/** GET /api/student/practice/wrong — 获取学员错题本 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['student']);
    const { searchParams } = new URL(request.url);
    const resolved = searchParams.get('resolved'); // 'true'|'false'|null(all)
    const page = Math.max(1, Number(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || '20')));
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE w.user_id = $1 AND w.item_type = $2';
    const params: unknown[] = [user.id, 'theory_question'];
    let paramIdx = 3;

    if (resolved === 'true') {
      whereClause += ` AND w.resolved = true`;
    } else if (resolved === 'false') {
      whereClause += ` AND w.resolved = false`;
    }

    // Count total
    const countResult = await dbQuery<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM practice_wrong_items w ${whereClause}`,
      ...params,
    );
    const total = parseInt(countResult[0]?.count || '0', 10);

    // Get items with question details
    const items = await dbQuery<{
      id: string;
      item_id: string;
      wrong_count: number;
      resolved: boolean;
      last_wrong_at: string;
      question_type: string;
      stem: string;
      options: unknown;
      answer_key: unknown;
      explanation: string | null;
      knowledge_point: string | null;
    }>(
      `SELECT w.id, w.item_id, w.wrong_count, w.resolved, w.last_wrong_at,
              q.question_type, q.stem, q.options, q.answer_key, q.explanation, q.knowledge_point
       FROM practice_wrong_items w
       LEFT JOIN practice_question_items q ON q.id = w.item_id
       ${whereClause}
       ORDER BY w.last_wrong_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params,
      limit,
      offset,
    );

    return Response.json({
      success: true,
      data: {
        items,
        total,
        page,
        pageSize: limit,
      },
    });
  } catch (err) {
    if ((err as { status?: number }).status === 401 || (err as { status?: number }).status === 403) {
      return Response.json({ success: false, error: (err as Error).message }, { status: (err as { status: number }).status });
    }
    console.error('Error fetching wrong items:', err);
    return Response.json({ success: false, error: '服务器开小差了，请稍后再试' }, { status: 500 });
  }
}
