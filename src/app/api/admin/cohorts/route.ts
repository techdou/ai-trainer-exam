import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbOne, dbQuery } from '@/server/db';
import { ok, fail, catchError, parseBody } from '@/lib/api';
import { assertOrganizationScope } from '@/server/exam-security';

const createSchema=z.object({name:z.string().trim().min(2).max(200),organizationId:z.string().uuid().optional()});
export async function GET(req: NextRequest){
 try{
  const user=await requireRole(req,['super_admin','school_admin','teacher']); const requested=new URL(req.url).searchParams.get('organizationId');
  if(requested) assertOrganizationScope(user,requested);
  const args:unknown[]=[]; const clauses=['c.deleted_at IS NULL'];
  if(user.roles.includes('teacher')){args.push(user.id);clauses.push(`EXISTS(SELECT 1 FROM teacher_cohort_grants g WHERE g.cohort_id=c.id AND g.teacher_id=$${args.length})`);}
  else if(requested){args.push(requested);clauses.push(`c.organization_id=$${args.length}`);}
  else if(!user.roles.includes('super_admin')){args.push(user.organizationId);clauses.push(`c.organization_id=$${args.length}`);}
  const rows=await dbQuery<{id:string;name:string;organization_id:string;organization_name:string;student_count:string;created_at:string}>(
   `SELECT c.id,c.name,c.organization_id,o.name organization_name,
    (SELECT count(*)::text FROM enrollments e WHERE e.cohort_id=c.id AND e.status='active') student_count,c.created_at
    FROM cohorts c JOIN organizations o ON o.id=c.organization_id WHERE ${clauses.join(' AND ')} ORDER BY c.created_at DESC`,...args);
  return ok(rows.map(c=>({id:c.id,name:c.name,organizationId:c.organization_id,organizationName:c.organization_name,studentCount:Number(c.student_count),createdAt:c.created_at})));
 }catch(error){return catchError(error)}
}
export async function POST(req:NextRequest){
 try{
  const user=await requireRole(req,['super_admin','school_admin']); const body=await parseBody(req,createSchema);
  const orgId=user.roles.includes('super_admin')?body.organizationId:user.organizationId; if(!orgId)return fail(400,'请选择所属学校'); assertOrganizationScope(user,orgId);
  const org=await dbOne<{id:string}>('SELECT id FROM organizations WHERE id=$1 AND status=\'active\'',orgId); if(!org)return fail(404,'所属学校不存在或已停用');
  const row=await dbOne<{id:string}>('INSERT INTO cohorts(name,organization_id) VALUES($1,$2) RETURNING id',body.name,orgId); return ok({id:row!.id},{status:201});
 }catch(error){return catchError(error)}
}
