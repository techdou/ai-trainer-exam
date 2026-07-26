import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { catchError, ok, parseBody } from '@/lib/api';
import { insertAudit } from '@/server/audit';

const createSchema = z.object({name:z.string().trim().min(2).max(200),code:z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9_-]+$/,'只能包含字母、数字、下划线和短横线'),contact:z.string().trim().max(200).optional()});
export async function GET(request:NextRequest){
 try{const user=await requireRole(request,['super_admin','school_admin']);const rows=await dbQuery<{id:string;name:string;code:string;contact:string|null;status:string;created_at:string;cohort_count:string;student_count:string}>(
 `SELECT o.id,o.name,o.code,o.contact,o.status,o.created_at,
 (SELECT COUNT(*)::text FROM cohorts c WHERE c.organization_id=o.id AND c.deleted_at IS NULL) cohort_count,
 (SELECT COUNT(DISTINCT e.user_id)::text FROM enrollments e JOIN cohorts c ON c.id=e.cohort_id WHERE c.organization_id=o.id AND e.status='active') student_count
 FROM organizations o WHERE o.deleted_at IS NULL AND ($1::text IS NULL OR o.id=$1) ORDER BY o.created_at DESC`,user.roles.includes('super_admin')?null:user.organizationId);
 return ok(rows.map(row=>({id:row.id,name:row.name,code:row.code,contact:row.contact,status:row.status,createdAt:row.created_at,cohortCount:Number(row.cohort_count),studentCount:Number(row.student_count)})));
 }catch(error){return catchError(error)}
}
export async function POST(request:NextRequest){
 try{const user=await requireRole(request,['super_admin']);const body=await parseBody(request,createSchema);const rows=await dbQuery<{id:string}>(`INSERT INTO organizations(name,code,contact,status) VALUES($1,$2,$3,'active') RETURNING id`,body.name,body.code,body.contact??null);await insertAudit({actorId:user.id,actorRole:user.roles[0],action:'organization.create',entityType:'organization',entityId:rows[0]?.id??null,organizationId:rows[0]?.id??null,details:body.name});return ok({id:rows[0]?.id},{status:201})}catch(error){return catchError(error)}
}
