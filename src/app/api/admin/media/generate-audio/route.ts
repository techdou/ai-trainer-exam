import { z } from 'zod';
import { organizationScope, requireRole } from '@/server/auth';
import { dbOne, dbExec } from '@/server/db';
import { ok, catchError, parseBody } from '@/lib/api';
import { generateAudio } from '@/server/media/providers';
import { mediaObjectKey, sha256, uploadObject } from '@/server/object-storage';
const schema=z.object({text:z.string().trim().min(2).max(5000),speaker:z.string().max(100).default('zh_female_xiaohe_uranus_bigtts'),category:z.string().trim().max(100).default('general'),targetBank:z.enum(['practice','exam']).default('practice')});
export async function POST(request:Request){
 try{
  const user=await requireRole(request,['super_admin','school_admin','question_editor']);const body=await parseBody(request,schema);
  const organizationId=user.roles.includes('super_admin')?user.organizationId:organizationScope(user);
  const job=await dbOne<{id:string}>(`INSERT INTO media_generation_jobs(organization_id,media_kind,provider,status,prompt,params,created_by,created_at,updated_at)
   VALUES($1,'audio','pending','processing',$2,$3,$4,NOW(),NOW()) RETURNING id`,organizationId,body.text,{speaker:body.speaker,category:body.category,targetBank:body.targetBank},user.id);
  try{
   const generated=await generateAudio(body.text,body.speaker,request.headers);const key=mediaObjectKey(organizationId,'audio',generated.extension);await uploadObject(key,generated.buffer,generated.contentType);const checksum=sha256(generated.buffer);
   const asset=await dbOne<{id:string}>(`INSERT INTO asset_manifests(organization_id,media_kind,object_key,checksum,version,status,category,transcript,meta,job_id,created_at,updated_at)
    VALUES($1,'audio',$2,$3,1,'draft',$4,$5,$6,$7,NOW(),NOW()) RETURNING id`,organizationId,key,checksum,body.category,body.text,{targetBank:body.targetBank,contentType:generated.contentType,provider:generated.provider,...generated.metadata},job!.id);
   await dbExec(`UPDATE media_generation_jobs SET provider=$1,status='succeeded',result_object_key=$2,checksum=$3,updated_at=NOW() WHERE id=$4`,generated.provider,key,checksum,job!.id);
   return ok({assetId:asset!.id,jobId:job!.id,previewUrl:`/api/admin/media/assets?id=${asset!.id}`,checksum,status:'draft',provider:generated.provider});
  }catch(error){await dbExec(`UPDATE media_generation_jobs SET status='failed',error=$1,updated_at=NOW() WHERE id=$2`,error instanceof Error?error.message:'生成失败',job!.id);throw error}
 }catch(error){return catchError(error)}
}
