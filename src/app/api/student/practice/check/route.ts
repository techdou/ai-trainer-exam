import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { assertPracticeUnlocked } from '@/server/exam-security';
import { dbExec, dbOne } from '@/server/db';
import { insertAudit } from '@/server/audit';
import { catchError, fail, ok, parseBody } from '@/lib/api';
import { gradeByType, normalizeTrueFalseAnswer, parseSingleChoiceAnswerKey, parseTrueFalseAnswerKey, parseFillInBlankAnswerKey } from '@/server/grading';
const schema=z.object({questionId:z.string().uuid(),answer:z.union([z.string(),z.boolean()]).optional(),userAnswer:z.union([z.string(),z.boolean()]).optional()});
export async function POST(request:Request){
 try{
  const user=await requireRole(request,['student']);await assertPracticeUnlocked(user);const body=await parseBody(request,schema);const finalAnswer=body.answer??body.userAnswer;if(finalAnswer===undefined)return fail(400,'请选择答案');
  const q=await dbOne<{answer_key:unknown;explanation:string|null;knowledge_point:string|null;question_type:string}>(
   `SELECT answer_key,explanation,knowledge_point,question_type FROM practice_question_items
    WHERE id=$1 AND review_status='published' AND deleted_at IS NULL AND (organization_id=$2 OR organization_id IS NULL)`,body.questionId,user.organizationId);
  if(!q)return fail(404,'题目不存在或未发布');
  let answerKey:unknown,submission:unknown;
  if(q.question_type==='true_false'){
   const correct=parseTrueFalseAnswerKey(q.answer_key);
   if(correct===null)return fail(500,'题目答案配置异常，请联系老师');
   answerKey={correctAnswer:correct};submission={answer:normalizeTrueFalseAnswer(finalAnswer)};
  }else if(q.question_type==='fill_in_blank'){
   const acceptable=parseFillInBlankAnswerKey(q.answer_key);
   if(!acceptable)return fail(500,'题目答案配置异常，请联系老师');
   answerKey={acceptable};submission={text:String(finalAnswer)};
  }else{
   const key=parseSingleChoiceAnswerKey(q.answer_key);
   if(!key)return fail(500,'题目答案配置异常，请联系老师');
   answerKey={correctOption:key};submission={selectedOption:String(finalAnswer).trim().toUpperCase()};
  }
  const graded=gradeByType(q.question_type==='true_false'?'true_false':q.question_type==='fill_in_blank'?'fill_in_blank':'single_choice',submission,answerKey); const score=graded.correct?1:0;
  await dbExec(`INSERT INTO practice_attempts(user_id,item_type,item_id,status,score,max_score,passed,feedback,workspace_snapshot,operation_log,engine_version,submitted_at,created_at,updated_at)
    VALUES($1,'theory_question',$2,'completed',$3,1,$4,$5,$6,'[]'::jsonb,$7,NOW(),NOW(),NOW())`,user.id,body.questionId,score,graded.correct,{feedback:graded.feedback},{answer:finalAnswer},graded.graderVersion);
  if(graded.correct)await dbExec(`UPDATE practice_wrong_items SET resolved=true,updated_at=NOW() WHERE user_id=$1 AND item_type='theory_question' AND item_id=$2`,user.id,body.questionId);
  else await dbExec(`INSERT INTO practice_wrong_items(user_id,item_type,item_id,wrong_count,resolved,last_wrong_at,created_at,updated_at)
   VALUES($1,'theory_question',$2,1,false,NOW(),NOW(),NOW()) ON CONFLICT(user_id,item_type,item_id) DO UPDATE SET wrong_count=practice_wrong_items.wrong_count+1,resolved=false,last_wrong_at=NOW(),updated_at=NOW()`,user.id,body.questionId);
  await insertAudit({actorId:user.id,actorRole:'student',organizationId:user.organizationId,action:'practice_answer',entityType:'question',entityId:body.questionId});
  return ok({correct:graded.correct,correctAnswer:q.question_type==='true_false'?((answerKey as {correctAnswer:boolean}).correctAnswer?'A':'B'):q.question_type==='fill_in_blank'?((answerKey as {acceptable:string[]}).acceptable[0]??''):(answerKey as {correctOption:string}).correctOption,explanation:q.explanation,knowledgePoint:q.knowledge_point});
 }catch(error){return catchError(error)}
}
