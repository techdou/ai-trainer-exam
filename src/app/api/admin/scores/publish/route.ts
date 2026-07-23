import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbExec } from '@/server/db';
import {ok, fail, catchError} from '@/lib/api';

/**
 * POST /api/admin/scores/publish
 * 批量发布成绩
 * 请求体: { scheduleId: string }
 */
export async function POST(req: NextRequest) {
  try {
    await requireRole(req, ['super_admin', 'school_admin']);

    const body = await req.json() as { scheduleId?: string };
    const { scheduleId } = body;
    if (!scheduleId) {
      return fail(400, '缺少 scheduleId');
    }

    const rowCount = await dbExec(
      `UPDATE exam_scores
       SET status = 'published', updated_at = NOW()
       WHERE schedule_id = $1 AND status IN ('auto_scored', 'reviewed')`,
      scheduleId,
    );

    return ok({ scheduleId, publishedCount: rowCount });
  } catch (e: unknown) {
    return catchError(e);
  }
}
