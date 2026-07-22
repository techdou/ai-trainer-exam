import { NextResponse } from 'next/server';
import { requireRole } from '@/server/auth';
import { parseDocx } from '@/server/docx-importer';
import { bulkInsertQuestions, type QuestionInsertRow } from '@/server/question-bank';
import { insertAudit } from '@/server/audit';
type BankType = 'practice' | 'exam';

/** POST /api/admin/import — 管理员上传 DOCX 题库文件 */
export async function POST(request: Request) {
  await requireRole(request, [
    'super_admin', 'school_admin', 'question_editor',
  ]);

  const formData = await request.formData();
  const file = formData.get('file');
  const bankType = (formData.get('bank_type') as BankType) || 'practice';

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: '请上传文件' },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parseDocx(buffer);

  // 转换 ParsedQuestion → QuestionInsertRow（snake_case，与 DB 列一致）
  const questionsToInsert: QuestionInsertRow[] = result.questions.map((q) => ({
    question_type: q.questionType,
    stem: q.stem,
    options: q.options.length > 0 ? q.options : null,
    answer_key: q.answerKey,
    explanation: null,
    knowledge_point: null,
    difficulty: 3,
    source: 'theory-questions.docx',
    source_version: null,
    practice_only: bankType === 'practice',
    legal_review_required: false,
    organization_id: null,
  }));

  const insertResult = await bulkInsertQuestions(questionsToInsert, bankType);

  await insertAudit({
    actorId: 'system',
    action: 'question.import',
    entityType: 'question',
    entityId: bankType,
    details: JSON.stringify({ inserted: insertResult.inserted, total: result.questions.length }),
  });

  return NextResponse.json({
    success: true,
    data: {
      inserted: insertResult.inserted,
      skipped: insertResult.skipped,
      issues: result.issues.length,
      stats: result.stats,
    },
  });
}
