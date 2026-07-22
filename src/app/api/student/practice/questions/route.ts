import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { listPracticeQuestionsForStudent } from '@/server/question-bank';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['student']);

    const { searchParams } = new URL(request.url);
    const module2 = searchParams.get('module') || 'theory';
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));

    const rows = await listPracticeQuestionsForStudent({ module: module2, limit });

    return Response.json({ success: true, data: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '获取题目失败';
    const status = msg.includes('权限') || msg.includes('登录') ? 403 : 500;
    return Response.json({ success: false, error: msg }, { status });
  }
}
