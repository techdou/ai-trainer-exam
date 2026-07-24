import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbOne, dbQuery, dbTx } from '@/server/db';
import { ok, fail, catchError, parseBody } from '@/lib/api';
import { assertOrganizationScope } from '@/server/exam-security';
import { readObject } from '@/server/object-storage';
const reviewSchema=z.object({assetId:z.string().uuid(),action:z.enum(['approve','reject','publish']),reviewNotes:z.string().trim().min(2).max(1000),transcript:z.string().max(5000).optional()});
export async function GET(request:Request){
 try{
  const user=await requireRole(request,['super_admin','school_admin','question_editor','question_reviewer','auditor']);const p=new URL(request.url).searchParams;const id=p.get('id');
  if(id){const asset=await dbOne<{id:string;organization_id:string|null;object_key:string;status:string;media_kind:string;meta:Record<string,unknown>}>(`SELECT id,organization_id,object_key,status,media_kind,meta FROM asset_manifests WHERE id=$1`,id);if(!asset)return fail(404,'素材不存在');assertOrganizationScope(user,asset.organization_id);const object=await readObject(asset.object_key);return new Response(object.body,{headers:{'Content-Type':object.contentType,'Content-Length':String(object.length??object.body.byteLength),'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}})}
  const args:unknown[]=[];let where='TRUE';if(!user.roles.includes('super_admin')){args.push(user.organizationId);where=`organization_id=$${args.length}`};const rows=await dbQuery(`SELECT id,media_kind,checksum,version,status,review_notes,transcript,category,meta,created_at,updated_at FROM asset_manifests WHERE ${where} ORDER BY created_at DESC LIMIT 200`,...args);return ok(rows);
 }catch(error){return catchError(error)}
}
export async function PATCH(request:Request){
 try{
  const user=await requireRole(request,['super_admin','school_admin','question_reviewer']);const body=await parseBody(request,reviewSchema);
  const asset=await dbOne<{id:string;organization_id:string|null;status:string;media_kind:string;transcript:string|null;meta:Record<string,unknown>}>(`SELECT id,organization_id,status,media_kind,transcript,meta FROM asset_manifests WHERE id=$1`,body.assetId);if(!asset)return fail(404,'素材不存在');assertOrganizationScope(user,asset.organization_id);
  if(body.action==='publish'&&asset.status!=='reviewed')return fail(409,'素材必须先审核通过才能发布');if(asset.media_kind==='audio'&&body.action!=='reject'&&!(body.transcript??asset.transcript)?.trim())return fail(400,'音频素材必须确认标准转写');
  const status=body.action==='approve'?'reviewed':body.action==='reject'?'rejected':'published';
  await dbTx(async client=>{await client.query(`UPDATE asset_manifests SET status=$1,review_notes=$2,reviewed_by=$3,transcript=COALESCE($4,transcript),updated_at=NOW() WHERE id=$5`,[status,body.reviewNotes,user.id,body.transcript??null,body.assetId]);await client.query(`INSERT INTO audit_logs(actor_id,actor_role,organization_id,action,entity_type,entity_id,detail) VALUES($1,$2,$3,$4,'asset_manifest',$5,$6)`,[user.id,user.roles[0]??null,asset.organization_id,`asset_${body.action}`,body.assetId,{notes:body.reviewNotes,status}]);});return ok({assetId:body.assetId,status});
 }catch(error){return catchError(error)}
}
