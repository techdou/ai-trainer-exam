import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery, dbExec } from '@/server/db';
import { ok, fail } from '@/lib/api';

/** GET /api/admin/papers - 列出试卷 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin', 'question_editor']);

    let whereClause = 'WHERE p.deleted_at IS NULL';
    const params: unknown[] = [];
    let paramIdx = 1;

    if (user.organizationId && !user.roles.includes('super_admin')) {
      whereClause += ` AND p.organization_id = $${paramIdx++}`;
      params.push(user.organizationId);
    }

    const papers = await dbQuery<{
      id: string;
      title: string;
      paper_kind: string;
      total_score: number;
      pass_score: number;
      duration_minutes: number;
      status: string;
      version: number;
      item_count: string;
      created_at: string;
    }>(
      `SELECT p.id, p.title, p.paper_kind, p.total_score, p.pass_score, p.duration_minutes,
              p.status, p.version, p.created_at,
              (SELECT COUNT(*)::text FROM exam_paper_items pi WHERE pi.paper_id = p.id) as item_count
       FROM exam_papers p
       ${whereClause}
       ORDER BY p.created_at DESC`,
      ...params,
    );

    return ok(papers.map(p => ({
      id: p.id,
      title: p.title,
      paperKind: p.paper_kind,
      totalScore: Number(p.total_score),
      passScore: Number(p.pass_score),
      durationMinutes: p.duration_minutes,
      status: p.status,
      version: p.version,
      itemCount: parseInt(p.item_count, 10),
      createdAt: p.created_at,
    })));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return fail(500, '服务器开小差了，请稍后再试');
  }
}

/** POST /api/admin/papers - 创建试卷 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ['super_admin', 'school_admin', 'question_editor']);
    const body = await req.json() as {
      title?: string;
      paperKind?: string;
      durationMinutes?: number;
      totalScore?: number;
      passScore?: number;
      questionIds?: string[];
    };

    const { title, paperKind, durationMinutes, totalScore, passScore, questionIds } = body;
    if (!title) return fail(400, '试卷标题不能为空');

    const rows = await dbQuery<{ id: string }>(
      `INSERT INTO exam_papers (title, organization_id, paper_kind, total_score, pass_score, duration_minutes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft')
       RETURNING id`,
      title,
      user.organizationId || '00000000-0000-0000-0000-000000000001',
      paperKind || 'formal',
      totalScore ?? 100,
      passScore ?? 60,
      durationMinutes ?? 90,
    );

    const paperId = rows[0]?.id;
    if (!paperId) return fail(500, '创建试卷失败');

    // 添加题目到试卷
    if (questionIds && questionIds.length > 0) {
      for (let idx = 0; idx < questionIds.length; idx++) {
        await dbExec(
          `INSERT INTO exam_paper_items (paper_id, item_type, item_id, sort_order, score, section)
           VALUES ($1, 'question', $2, $3, $4, 'theory')`,
          paperId, questionIds[idx], idx + 1, Math.floor((totalScore ?? 100) / questionIds.length),
        );
      }
    }

    return ok({ id: paperId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误';
    return fail(500, '创建失败');
  }
}
