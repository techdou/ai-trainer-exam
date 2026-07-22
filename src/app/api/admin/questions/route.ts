import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { listQuestions, createQuestion } from '@/server/question-bank';

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ['school_admin', 'super_admin', 'question_editor', 'question_reviewer', 'teacher']);

    const { searchParams } = new URL(request.url);
    const bankType = (searchParams.get('bank_type') as 'practice' | 'exam') || 'practice';
    const questionType = searchParams.get('question_type') || undefined;
    const status = searchParams.get('status') || undefined;
    const keyword = searchParams.get('keyword') || searchParams.get('search') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || searchParams.get('page_size') || '20', 10)));

    const result = await listQuestions({
      bankType,
      questionType,
      status,
      keyword,
      page,
      pageSize,
    });

    return Response.json({ success: true, data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '查询失败';
    const status = msg.includes('权限') || msg.includes('登录') ? 403 : 500;
    return Response.json({ success: false, error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['school_admin', 'question_editor', 'super_admin']);

    const body = await request.json();
    const { bankType = 'practice', questionType, stem, options, answerKey, explanation, knowledgePoint, difficulty, legalReviewRequired } = body;

    if (!questionType || !stem || !answerKey) {
      return Response.json({ success: false, error: '缺少必填字段' }, { status: 400 });
    }

    const id = await createQuestion({
      bankType,
      questionType,
      stem,
      options,
      answerKey,
      explanation,
      knowledgePoint,
      difficulty,
      legalReviewRequired,
      createdBy: user.id,
    });

    return Response.json({ success: true, data: { id } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '创建失败';
    const status = msg.includes('权限') || msg.includes('登录') ? 403 : 500;
    return Response.json({ success: false, error: msg }, { status });
  }
}
