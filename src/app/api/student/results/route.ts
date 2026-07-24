import { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, catchError } from '@/lib/api';
export async function GET(req:NextRequest){
 try{
  const user=await requireRole(req,['student']);
  const rows=await dbQuery<{id:string;schedule_id:string;schedule_title:string;total_score:number;max_score:number;passed:boolean;status:string;created_at:string}>(
   `SELECT sc.id,sc.schedule_id,s.title schedule_title,sc.total_score,sc.max_score,sc.passed,sc.status,sc.created_at
      FROM exam_scores sc JOIN exam_schedules s ON s.id=sc.schedule_id
     WHERE sc.user_id=$1 AND sc.status='published' AND s.results_released=true
       AND (s.results_release_at IS NULL OR s.results_release_at<=NOW()) ORDER BY sc.created_at DESC`,user.id);
  return ok(rows.map(r=>({id:r.id,scheduleId:r.schedule_id,scheduleTitle:r.schedule_title,totalScore:Number(r.total_score),maxScore:Number(r.max_score),passed:r.passed,status:r.status,createdAt:r.created_at})));
 }catch(error){return catchError(error)}
}
