import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { updateQuestion, retireQuestion, getQuestionById, reviewQuestion } from '@/server/question-bank';
import { insertAudit } from '@/server/audit';
import { catchError, fail, ok, parseBody } from '@/lib/api';
import { assertOrganizationScope } from '@/server/exam-security';

const schema = z.object({
  action: z.enum(['retire','approve','reject','publish']).optional(), stem: z.string().trim().min(2).max(5000).optional(),
  options: z.record(z.string(), z.string()).optional(), answerKey: z.union([z.string(),z.boolean()]).optional(),
  explanation: z.string().max(5000).nullable().optional(), knowledgePoint: z.string().max(200).nullable().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  note: z.string().max(500).optional(),
});

const REVIEW_ROLES = ['question_reviewer','school_admin','super_admin'];
const EDIT_ROLES = ['question_editor','school_admin','super_admin'];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(request, ['school_admin','super_admin','question_editor','question_reviewer']);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return fail(400, '题目 ID 不正确');
    const current = await getQuestionById(id);
    if (!current) return fail(404, '题目不存在');
    assertOrganizationScope(user, current.organization_id);
    const body = await parseBody(request, schema);
    if (body.action === 'retire') {
      await retireQuestion(id);
      await insertAudit({ actorId: user.id, actorRole: user.roles[0], organizationId: current.organization_id, action: 'question_retire', entityType: 'question', entityId: id });
      return ok({ retired: true });
    }
    if (body.action === 'approve' || body.action === 'reject' || body.action === 'publish') {
      // 审核动作: 只有审核员/管理员可执行(编辑员不能自审, 职责分离)。
      if (!user.roles.some(r => REVIEW_ROLES.includes(r))) return fail(403, '只有审核员或管理员可以审核题目');
      // 不能审核自己提交的题目。
      if (current.created_by && current.created_by === user.id) return fail(403, '不能审核自己提交的题目');
      const reviewed = await reviewQuestion(id, body.action, user.id, body.note);
      await insertAudit({ actorId: user.id, actorRole: user.roles[0], organizationId: current.organization_id, action: `question_${body.action}`, entityType: 'question', entityId: id, details: body.note });
      return ok(reviewed);
    }
    // 编辑题面: 只有编辑员/管理员可执行。
    if (!user.roles.some(r => EDIT_ROLES.includes(r))) return fail(403, '只有编辑员或管理员可以编辑题目');
    const updated = await updateQuestion(id, {
      stem: body.stem, options: body.options, answer_key: body.answerKey === undefined ? undefined : JSON.stringify(body.answerKey),
      explanation: body.explanation ?? undefined, knowledge_point: body.knowledgePoint ?? undefined, difficulty: body.difficulty,
    }, user.id);
    await insertAudit({ actorId: user.id, actorRole: user.roles[0], organizationId: current.organization_id, action: 'question_edit', entityType: 'question', entityId: id });
    return ok(updated);
  } catch (error) { return catchError(error); }
}
