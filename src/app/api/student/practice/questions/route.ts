import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { assertPracticeUnlocked } from '@/server/exam-security';
import { listPracticeQuestionsForStudent } from '@/server/question-bank';
import { catchError, ok } from '@/lib/api';

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['student']);
    await assertPracticeUnlocked(user);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));

    // 注意:历史版本接受过 module 参数但 SQL 从未使用,已连同参数一起移除,避免契约假象。
    const rows = await listPracticeQuestionsForStudent({ limit, organizationId: user.organizationId, excludePassedForUserId: user.id });

    return ok(rows);
  } catch (e) {
    return catchError(e);
  }
}
