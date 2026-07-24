import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, catchError } from '@/lib/api';
export async function GET(request:NextRequest){
 try{
  const user=await requireRole(request,['teacher','school_admin','super_admin']); const args:unknown[]=[]; let scope='TRUE';
  if(user.roles.includes('teacher')){args.push(user.id);scope=`EXISTS(SELECT 1 FROM teacher_cohort_grants g WHERE g.cohort_id=e.cohort_id AND g.teacher_id=$${args.length})`;}
  else if(!user.roles.includes('super_admin')){args.push(user.organizationId);scope=`c.organization_id=$${args.length}`;}
  const students=await dbQuery<{id:string;display_name:string;email:string;created_at:string;total_attempts:string;passed_attempts:string}>(
   `SELECT p.id,p.display_name,p.email,p.created_at,count(pa.id)::text total_attempts,
     count(pa.id) FILTER(WHERE pa.passed)::text passed_attempts
     FROM profiles p JOIN enrollments e ON e.user_id=p.id AND e.status='active' JOIN cohorts c ON c.id=e.cohort_id
     LEFT JOIN practice_attempts pa ON pa.user_id=p.id WHERE ${scope}
     GROUP BY p.id ORDER BY p.display_name`,...args);
  return ok({items:students.map(s=>({id:s.id,display_name:s.display_name,displayName:s.display_name,email:s.email,createdAt:s.created_at,totalAttempts:Number(s.total_attempts),passedAttempts:Number(s.passed_attempts),correctRate:Number(s.total_attempts)?Math.round(Number(s.passed_attempts)/Number(s.total_attempts)*100):null})),total:students.length});
 }catch(error){return catchError(error)}
}
