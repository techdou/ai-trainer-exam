import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { parseDocx } from '@/server/docx-importer';
import { bulkInsertQuestions, type QuestionInsertRow } from '@/server/question-bank';
import { insertAudit } from '@/server/audit';
import { handler, ok, fail } from '@/lib/api';

type BankType = 'practice' | 'exam';
const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const bankSchema = z.enum(['practice', 'exam']);

/** POST /api/admin/import — 管理员上传 DOCX 题库文件。导入后全部进入待审核状态。 */
export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin', 'question_editor']);
  const formData = await request.formData();
  const file = formData.get('file');
  const bankResult = bankSchema.safeParse(formData.get('bank_type') ?? 'practice');
  if (!bankResult.success) return fail(400, '题库类型不正确');
  const bankType: BankType = bankResult.data;

  if (!(file instanceof File)) return fail(400, '请上传 DOCX 文件');
  const lowerName = file.name.toLowerCase();
  const allowedMime = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
  ]);
  if (!lowerName.endsWith('.docx') || (file.type && !allowedMime.has(file.type))) return fail(400, '只允许上传 .docx 文件');
  if (file.size <= 0 || file.size > MAX_DOCX_BYTES) return fail(400, '文件大小必须在 1 字节至 10MB 之间');
  if (!user.organizationId && !user.roles.includes('super_admin')) return fail(403, '账号未绑定机构');

  const buffer = Buffer.from(await file.arrayBuffer());
  // DOCX 本质是 ZIP；先检查文件头，拦截伪造扩展名。
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return fail(400, '文件不是有效的 DOCX 文档');

  const result = await parseDocx(buffer);
  if (!result.questions.length) return fail(400, '文档中没有识别到可导入题目');
  const organizationId = user.organizationId ?? null;
  const questionsToInsert: QuestionInsertRow[] = result.questions.map(q => ({
    question_type: q.questionType,
    stem: q.stem,
    options: q.options.length > 0 ? q.options : null,
    answer_key: q.answerKey,
    explanation: null,
    knowledge_point: null,
    difficulty: 1,
    source: file.name,
    source_version: new Date().toISOString(),
    practice_only: bankType === 'practice',
    legal_review_required: /劳动法|劳动合同法|网络安全法|数据安全法|个人信息保护法|反不正当竞争法/.test(q.stem),
    organization_id: organizationId,
  }));

  const insertResult = await bulkInsertQuestions(questionsToInsert, bankType);
  await insertAudit({
    actorId: user.id,
    action: 'question.import',
    entityType: `${bankType}_question_items`,
    entityId: bankType,
    details: JSON.stringify({ organizationId, filename: file.name, size: file.size, inserted: insertResult.inserted, skipped: insertResult.skipped, parsed: result.questions.length }),
  });

  return ok({
    inserted: insertResult.inserted,
    skipped: insertResult.skipped,
    parserIssues: result.issues,
    errors: insertResult.errors.slice(0, 100),
    stats: result.stats,
    reviewStatus: 'imported_unreviewed',
  });
});
