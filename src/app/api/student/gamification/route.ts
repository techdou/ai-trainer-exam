import { requireRole } from '@/server/auth';
import { getGamificationSummary } from '@/server/gamification';
import { ok, catchError } from '@/lib/api';

/** GET /api/student/gamification - 我的积分/勋章/班级排行 */
export async function GET(request: Request) {
  try {
    const user = await requireRole(request, ['student']);
    const summary = await getGamificationSummary(user.id, user.organizationId);
    return ok(summary);
  } catch (error) { return catchError(error); }
}
