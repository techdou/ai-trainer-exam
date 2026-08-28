import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError, requireRole } from '@/server/auth';
import { dbTx } from '@/server/db';
import { handler, ok, fail, parseBody } from '@/lib/api';
import { gradeByType, normalizeTrueFalseAnswer, MAX_GRADING_INPUT_BYTES } from '@/server/grading';
import { getScheduleForStudent } from '@/server/exam-security';

const boundedInput = z.unknown().refine(
  v => { try { return JSON.stringify(v ?? {}).length <= MAX_GRADING_INPUT_BYTES; } catch { return false; } },
  { message: '单题提交内容过大' },
);
const schema = z.object({
  scheduleId: z.string().min(1),
  attemptId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128).optional(),
  responses: z.array(z.object({ itemId: z.string().min(1), response: boundedInput, workspaceSnapshot: boundedInput.optional() })).max(300).default([]),
  // 兼容旧客户端，迁移期后可移除。
  answers: z.array(z.object({ questionId: z.string().min(1), answer: z.string() })).max(300).optional(),
});

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function hash(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex'); }
function normalizeQuestionResponse(graderId: string, response: unknown): unknown {
  const raw = typeof response === 'string' ? response : (response as { answer?: unknown; selectedOption?: unknown; text?: unknown } | null)?.answer ?? (response as { selectedOption?: unknown } | null)?.selectedOption;
  if (graderId === 'true_false') return { answer: normalizeTrueFalseAnswer(raw) };
  if (graderId === 'fill_in_blank') return { text: String(typeof response === 'string' ? response : raw ?? '').trim() };
  if (graderId === 'prompt_description') return { text: String(typeof response === 'string' ? response : raw ?? '').trim() };
  if (graderId === 'single_choice') return { selectedOption: String(raw ?? '').trim().toUpperCase() };
  // 未知题型不归一,原样交给评分器判 invalid,绝不默认按单选处理。
  return response ?? {};
}
function sectionColumn(section: string): 'theory'|'cleaning'|'image_annotation'|'text_annotation'|'audio'|'statistics' {
  if (section === 'theory') return 'theory';
  if (section === 'image_annotation') return 'image_annotation';
  if (section === 'text_annotation') return 'text_annotation';
  if (section === 'audio') return 'audio';
  if (section === 'statistics') return 'statistics';
  return 'cleaning';
}

export const POST = handler(async (request: Request) => {
  const user = await requireRole(request, ['student']);
  const body = await parseBody(request, schema);
  const schedule = await getScheduleForStudent(body.scheduleId, user.id);
  if (!schedule) return fail(404, '考试不存在或您未被安排参加');

  const legacy = (body.answers ?? []).map(a => ({ itemId: a.questionId, response: a.answer, workspaceSnapshot: {} }));
  const supplied = [...body.responses, ...legacy];
  const submissionHash = hash({ attemptId: body.attemptId, responses: supplied });
  const idempotencyKey = body.idempotencyKey ?? submissionHash;

  const result = await dbTx(async client => {
    const scheduleLock = await client.query<{ status: string; results_released: boolean }>(
      `SELECT status,results_released
         FROM exam_schedules
        WHERE id=$1 AND deleted_at IS NULL
        FOR UPDATE`,
      [body.scheduleId],
    );
    const lockedSchedule = scheduleLock.rows[0];
    if (!lockedSchedule) throw new ApiError(404, '考试安排不存在');
    if (lockedSchedule.results_released || ['results_released', 'archived'].includes(lockedSchedule.status)) {
      throw new ApiError(409, '成绩已发布，不能再提交答卷');
    }
    const attemptResult = await client.query<{
      id:string;status:string;server_deadline:Date|null;submission_hash:string|null;submit_receipt:string|null;
    }>(`SELECT id,status,server_deadline,submission_hash,submit_receipt FROM exam_attempts
        WHERE id=$1 AND schedule_id=$2 AND user_id=$3 FOR UPDATE`,[body.attemptId,body.scheduleId,user.id]);
    const attempt = attemptResult.rows[0];
    if (!attempt) throw new ApiError(404, '考试记录不存在');
    if (['submitted','grading','graded','released'].includes(attempt.status)) {
      if (attempt.submission_hash === submissionHash && attempt.submit_receipt) return { receipt: attempt.submit_receipt, duplicate: true };
      throw new ApiError(409, '考试已经提交，不能重复交卷');
    }
    if (attempt.status !== 'in_progress') throw new ApiError(409, '考试状态不允许交卷');
    // 宽限校验使用事务内数据库时间,与“考试计时以数据库时间为唯一权威”的约定一致。
    const now = (await client.query<{ now: Date }>('SELECT now() AS now')).rows[0].now.getTime();
    const deadline = attempt.server_deadline ? new Date(attempt.server_deadline).getTime() : new Date(schedule.exam_end_at).getTime();
    if (now > deadline + schedule.submit_grace_seconds * 1000) throw new ApiError(409, '已超过交卷宽限时间');

    const paperItems = (await client.query<{
      id:string;item_type:string;score:number;section:string;item_snapshot:Record<string,unknown>;
      answer_key_snapshot:unknown;grading_config_snapshot:unknown;grader_id:string;grader_version:string;
    }>(`SELECT id,item_type,score,section,item_snapshot,answer_key_snapshot,grading_config_snapshot,grader_id,grader_version
        FROM exam_paper_items WHERE paper_id=$1 ORDER BY sort_order`,[schedule.paper_id])).rows;
    if (!paperItems.length) throw new ApiError(409, '试卷为空');
    // grader_id 缺失(历史数据未回填)时评分器会判"未知评分器"静默给 0 分, 必须显式拦截让考务修复。
    if (paperItems.some(item => !item.grader_id)) throw new ApiError(409, '试卷存在未配置评分器的题目，请联系考务人员处理');
    const validIds = new Set(paperItems.map(item => item.id));
    for (const response of supplied) if (!validIds.has(response.itemId)) throw new ApiError(400, '提交中包含不属于本试卷的题目');

    for (const response of supplied) {
      const item = paperItems.find(x => x.id === response.itemId)!;
      await client.query(
        `INSERT INTO exam_responses (attempt_id,item_id,item_type,response,workspace_snapshot,saved_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,NOW(),NOW(),NOW())
         ON CONFLICT (attempt_id,item_id) DO UPDATE SET response=EXCLUDED.response,workspace_snapshot=EXCLUDED.workspace_snapshot,saved_at=NOW(),updated_at=NOW()`,
        // 必须 JSON.stringify: node-pg 只自动序列化对象,字符串(如选项 'C')会原样发给 jsonb 列报 22P02。
        [attempt.id,item.id,item.item_type,JSON.stringify(response.response ?? {}),JSON.stringify(response.workspaceSnapshot ?? {})],
      );
    }

    const saved = (await client.query<{ item_id:string;response:unknown;workspace_snapshot:unknown }>('SELECT item_id,response,workspace_snapshot FROM exam_responses WHERE attempt_id=$1',[attempt.id])).rows;
    const responseMap = new Map<string, { item_id:string; response:unknown; workspace_snapshot:unknown }>(saved.map(row => [row.item_id, row]));
    const sectionScores = { theory:0, cleaning:0, image_annotation:0, text_annotation:0, audio:0, statistics:0 };
    let totalScore = 0;
    const details: Array<Record<string,unknown>> = [];

    await client.query(`UPDATE exam_attempts SET status='grading',updated_at=NOW() WHERE id=$1`,[attempt.id]);
    for (const item of paperItems) {
      const savedResponse = responseMap.get(item.id);
      const normalized = item.item_type === 'question'
        ? normalizeQuestionResponse(item.grader_id, savedResponse?.response)
        : (savedResponse?.response ?? {});
      const graded = gradeByType(item.grader_id, normalized, item.answer_key_snapshot);
      const max = Number(item.score);
      const score = Math.round(graded.score * max * 100) / 100;
      totalScore += score;
      sectionScores[sectionColumn(item.section)] += score;
      details.push({ itemId:item.id,itemType:item.item_type,section:item.section,score,maxScore:max,correct:graded.correct,graderVersion:graded.graderVersion,details:graded.details ?? {} });
      await client.query(
        `INSERT INTO exam_responses
          (attempt_id,item_id,item_type,response,workspace_snapshot,saved_at,score,max_score,grader_version,grading_detail,graded_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,NOW(),$6,$7,$8,$9::jsonb,NOW(),NOW(),NOW())
         ON CONFLICT (attempt_id,item_id) DO UPDATE SET
          score=EXCLUDED.score,max_score=EXCLUDED.max_score,grader_version=EXCLUDED.grader_version,
          grading_detail=EXCLUDED.grading_detail,graded_at=NOW(),updated_at=NOW()`,
        // response/workspace_snapshot 从 jsonb 读出后可能是字符串(如 'C'),同样要重新序列化。
        [attempt.id,item.id,item.item_type,JSON.stringify(savedResponse?.response ?? {}),JSON.stringify(savedResponse?.workspace_snapshot ?? {}),score,max,graded.graderVersion,JSON.stringify({ correct:graded.correct,feedback:graded.feedback,details:graded.details ?? {} })],
      );
    }

    const maxScore = paperItems.reduce((sum,item)=>sum+Number(item.score),0);
    totalScore = Math.round(totalScore*100)/100;
    const passed = totalScore >= Number(schedule.pass_score);
    const engineVersions = [...new Set(details.map(d=>String(d.graderVersion)))].sort().join(',');
    const receipt = randomUUID();
    await client.query(
      `INSERT INTO exam_scores
        (attempt_id,schedule_id,user_id,theory_score,cleaning_score,image_annotation_score,text_annotation_score,audio_score,statistics_score,total_score,max_score,passed,engine_version,paper_version,auto_score_detail,original_total,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$10,'auto_graded',NOW(),NOW())
       ON CONFLICT (attempt_id) DO UPDATE SET
        theory_score=EXCLUDED.theory_score,cleaning_score=EXCLUDED.cleaning_score,image_annotation_score=EXCLUDED.image_annotation_score,
        text_annotation_score=EXCLUDED.text_annotation_score,audio_score=EXCLUDED.audio_score,statistics_score=EXCLUDED.statistics_score,
        total_score=EXCLUDED.total_score,max_score=EXCLUDED.max_score,passed=EXCLUDED.passed,engine_version=EXCLUDED.engine_version,
        paper_version=EXCLUDED.paper_version,auto_score_detail=EXCLUDED.auto_score_detail,original_total=EXCLUDED.original_total,status='auto_graded',updated_at=NOW()`,
      [attempt.id,body.scheduleId,user.id,sectionScores.theory,sectionScores.cleaning,sectionScores.image_annotation,sectionScores.text_annotation,sectionScores.audio,sectionScores.statistics,totalScore,maxScore,passed,engineVersions,schedule.paper_version,{ items:details,submissionHash }],
    );
    await client.query(
      `UPDATE exam_attempts SET status='graded',submitted_at=NOW(),submission_hash=$2,submit_receipt=$3,idempotency_key=$4,updated_at=NOW() WHERE id=$1`,
      [attempt.id,submissionHash,receipt,idempotencyKey],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_id,actor_role,organization_id,action,entity_type,entity_id,detail,created_at)
       VALUES ($1,'student',$2,'exam_submit','exam_attempt',$3,$4,NOW())`,
      [user.id,schedule.organization_id,attempt.id,{ receipt,submissionHash,itemCount:paperItems.length }],
    );
    return { receipt, duplicate:false };
  });

  return ok({ attemptId:body.attemptId,receipt:result.receipt,duplicate:result.duplicate,submitted:true,resultAvailable:false,message:'交卷成功。成绩将在学校发布后显示。' });
});
