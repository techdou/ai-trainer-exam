import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { updateQuestion, retireQuestion } from '@/server/question-bank';
import { insertAudit } from '@/server/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(request, ['school_admin', 'super_admin', 'question_editor']);

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action === 'retire') {
      await retireQuestion(id);
      await insertAudit({
        actorId: user.id,
        action: 'question_retire',
        entityType: 'question',
        entityId: id,
      });
      return Response.json({ success: true });
    }

    const updated = await updateQuestion(id, {
      stem: body.stem,
      options: body.options,
      answer_key: body.answerKey,
      explanation: body.explanation,
      knowledge_point: body.knowledgePoint,
      difficulty: body.difficulty,
    }, user.id);

    if (!updated) {
      return Response.json({ success: false, error: '题目不存在' }, { status: 404 });
    }

    await insertAudit({
      actorId: user.id,
      action: 'question_edit',
      entityType: 'question',
      entityId: id,
    });

    return Response.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '更新失败';
    const status = msg.includes('权限') || msg.includes('登录') ? 403 : 500;
    return Response.json({ success: false, error: msg }, { status });
  }
}
