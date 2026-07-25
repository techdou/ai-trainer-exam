import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { listQuestions, createQuestion } from '@/server/question-bank';
import { catchError, fail, ok, parseBody } from '@/lib/api';

const createSchema = z.object({
  bankType: z.enum(['practice','exam']).default('practice'),
  questionType: z.enum(['single_choice','true_false']),
  stem: z.string().trim().min(2).max(5000),
  options: z.record(z.string(), z.string()).default({}),
  answerKey: z.union([z.string(), z.boolean()]),
  explanation: z.string().max(5000).optional(),
  knowledgePoint: z.string().max(200).optional(),
  difficulty: z.number().int().min(1).max(5).default(1),
  legalReviewRequired: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole(request, ['school_admin','super_admin','question_editor','question_reviewer','teacher','auditor']);
    const p = new URL(request.url).searchParams;
    const bankType = p.get('bank_type') === 'exam' ? 'exam' : 'practice';
    // 前端历史上发过 review_status 参数, 后端只认 status, 导致过滤被静默忽略(审核页拉到全量题目)。两个名字都接受。
    const status = p.get('status') || p.get('review_status');
    const result = await listQuestions({
      bankType,
      questionType: p.get('question_type'), status, keyword: p.get('keyword') || p.get('search'),
      page: Math.max(1, Number(p.get('page') || 1)), pageSize: Math.min(100, Math.max(1, Number(p.get('limit') || p.get('page_size') || 20))),
      organizationId: user.roles.includes('super_admin') ? undefined : user.organizationId,
    });
    return ok(result);
  } catch (error) { return catchError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['school_admin','question_editor','super_admin']);
    if (!user.organizationId && !user.roles.includes('super_admin')) return fail(403, '账号未绑定机构');
    const body = await parseBody(request, createSchema);
    if (body.questionType === 'single_choice' && Object.keys(body.options).length < 2) return fail(400, '单选题至少需要两个选项');
    const answer = typeof body.answerKey === 'boolean' ? body.answerKey : body.answerKey.trim();
    if (body.questionType === 'single_choice' && !Object.prototype.hasOwnProperty.call(body.options, String(answer))) return fail(400, '答案必须对应一个有效选项');
    const id = await createQuestion({ ...body, answerKey: answer, createdBy: user.id, organizationId: user.organizationId });
    return ok({ id }, { status: 201 });
  } catch (error) { return catchError(error); }
}
