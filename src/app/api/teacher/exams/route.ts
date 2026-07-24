import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, fail, catchError } from '@/lib/api';
export async function POST(request:NextRequest){
 try{await requireRole(request,['teacher']);return fail(403,'为保证试卷冻结和考务审计，正式考试只能由学校管理员在考务管理中创建');}catch(error){return catchError(error)}
}
export async function GET(request:NextRequest){
 try{
  const user=await requireRole(request,['teacher','school_admin','super_admin']); const status=new URL(request.url).searchParams.get('status');
  const args:unknown[]=[];const clauses=['s.deleted_at IS NULL'];
  if(status){args.push(status);clauses.push(`s.status=$${args.length}`)}
  if(user.roles.includes('teacher')){args.push(user.id);clauses.push(`EXISTS(SELECT 1 FROM teacher_cohort_grants g WHERE g.cohort_id=s.cohort_id AND g.teacher_id=$${args.length})`)}
  else if(!user.roles.includes('super_admin')){args.push(user.organizationId);clauses.push(`s.organization_id=$${args.length}`)}
  const rows=await dbQuery(`SELECT s.id,s.title,s.cohort_id,s.exam_start_at,s.exam_end_at,s.late_entry_minutes,s.status,s.paper_id,s.created_at,p.title paper_title,p.duration_minutes
   FROM exam_schedules s JOIN exam_papers p ON p.id=s.paper_id WHERE ${clauses.join(' AND ')} ORDER BY s.exam_start_at DESC`,...args);
  return ok({items:rows});
 }catch(error){return catchError(error)}
}
