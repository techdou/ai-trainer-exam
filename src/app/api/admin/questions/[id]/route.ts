import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { updateQuestion, retireQuestion, getQuestionById } from '@/server/question-bank';
import { insertAudit } from '@/server/audit';
import { catchError, fail, ok, parseBody } from '@/lib/api';
import { assertOrganizationScope } from '@/server/exam-security';

const schema = z.object({
  action: z.enum(['retire']).optional(), stem: z.string().trim().min(2).max(5000).optional(),
  options: z.record(z.string(), z.string()).optional(), answerKey: z.union([z.string(),z.boolean()]).optional(),
  explanation: z.string().max(5000).nullable().optional(), knowledgePoint: z.string().max(200).nullable().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(request, ['school_admin','super_admin','question_editor']);
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
    const updated = await updateQuestion(id, {
      stem: body.stem, options: body.options, answer_key: body.answerKey === undefined ? undefined : JSON.stringify(body.answerKey),
      explanation: body.explanation ?? undefined, knowledge_point: body.knowledgePoint ?? undefined, difficulty: body.difficulty,
    }, user.id);
    await insertAudit({ actorId: user.id, actorRole: user.roles[0], organizationId: current.organization_id, action: 'question_edit', entityType: 'question', entityId: id });
    return ok(updated);
  } catch (error) { return catchError(error); }
}
