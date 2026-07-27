import { requireRole } from '@/server/auth';
import { dbTx, dbOne } from '@/server/db';
import { insertAudit } from '@/server/audit';
import { handler, ok, fail } from '@/lib/api';
import { THEORY_QUESTIONS, type TheoryQuestion } from '@/server/exam-theory-questions';

/**
 * POST /api/admin/seed-theory
 * 管理员一键导入初级理论考试题（100题）到当前环境的数据库。
 * 会先清除旧的理论题（所有来源），再导入新的 100 题。
 * 同时写入 practice_question_items 和 exam_question_items。
 */
export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['super_admin', 'school_admin']);

  const orgRow = await dbOne<{ id: string }>(
    "SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1",
  );
  if (!orgRow) return fail(500, '没有可用机构，请先初始化系统');
  const organizationId = orgRow.id;

  const result = await dbTx(async (client) => {
    // 清除所有旧理论题（所有来源）
    const oldSources = ['docx_import', 'manual', 'batch_seed', 'practice_copy', 'exam_theory_v1'];
    const delP = await client.query(
      `DELETE FROM practice_question_items WHERE source = ANY($1::text[])`,
      [oldSources],
    );
    const delE = await client.query(
      `DELETE FROM exam_question_items WHERE source = ANY($1::text[])`,
      [oldSources],
    );

    let practiceInserted = 0;
    let examInserted = 0;
    let skipped = 0;

    for (const q of THEORY_QUESTIONS) {
      const { options, answerKey } = buildFields(q);
      const contentHash = q.stem.replace(/\s+/g, '').toLowerCase();

      // practice（跳过已存在）
      const pExisting = await client.query(
        `SELECT 1 FROM practice_question_items WHERE organization_id=$1 AND regexp_replace(lower(stem),'\\s+','','g')=$2 LIMIT 1`,
        [organizationId, contentHash],
      );
      if (pExisting.rowCount) {
        skipped++;
        continue;
      }
      await client.query(
        `INSERT INTO practice_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,legal_review_required,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,NULL,$6,$7,'exam_theory_v1','published',1,true,false,NOW(),NOW())`,
        [organizationId, q.type, q.stem, options, answerKey, q.kp, q.difficulty],
      );
      practiceInserted++;

      // exam
      await client.query(
        `INSERT INTO exam_question_items(organization_id,question_type,stem,options,answer_key,explanation,knowledge_point,difficulty,source,review_status,published_version,practice_only,eligible_for_formal_exam,legal_review_required,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,NULL,$6,$7,'exam_theory_v1','published',1,false,true,false,NOW(),NOW())`,
        [organizationId, q.type, q.stem, options, answerKey, q.kp, q.difficulty],
      );
      examInserted++;
    }

    return {
      deletedPractice: delP.rowCount ?? 0,
      deletedExam: delE.rowCount ?? 0,
      practiceInserted,
      examInserted,
      skipped,
      total: THEORY_QUESTIONS.length,
    };
  });

  await insertAudit({
    actorId: user.id,
    action: 'question.import',
    entityType: 'theory_questions',
    entityId: 'batch',
    details: JSON.stringify({
      organizationId,
      ...result,
      source: 'exam_theory_v1',
    }),
  });

  return ok(result);
});

function buildFields(q: TheoryQuestion): { options: Record<string, string>; answerKey: string } {
  if (q.type === 'single_choice') {
    const opts: Record<string, string> = {};
    q.options.forEach((text, i) => {
      opts[String.fromCharCode(65 + i)] = text;
    });
    return { options: opts, answerKey: JSON.stringify(q.answer) };
  }
  if (q.type === 'true_false') {
    return { options: {}, answerKey: JSON.stringify(q.answer) };
  }
  return { options: {}, answerKey: JSON.stringify({ acceptable: q.acceptable }) };
}
