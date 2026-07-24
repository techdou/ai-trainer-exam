import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { dbOne, dbExec } from '@/server/db';
import { ok, catchError, parseBody } from '@/lib/api';
import { generateImage } from '@/server/media/providers';
import { mediaObjectKey, sha256, uploadObject } from '@/server/object-storage';
const schema=z.object({prompt:z.string().trim().min(5).max(4000),size:z.string().max(30).default('2K'),category:z.string().trim().max(100).default('general'),targetBank:z.enum(['practice','exam']).default('practice')});
export async function POST(request:Request){
 try{
  const user=await requireRole(request,['super_admin','school_admin','question_editor']);const body=await parseBody(request,schema);
  const job=await dbOne<{id:string}>(`INSERT INTO media_generation_jobs(organization_id,media_kind,provider,status,prompt,params,created_by,created_at,updated_at)
    VALUES($1,'image','pending','processing',$2,$3,$4,NOW(),NOW()) RETURNING id`,user.organizationId,body.prompt,{size:body.size,category:body.category,targetBank:body.targetBank},user.id);
  try{
   const generated=await generateImage(body.prompt,body.size,request.headers);const key=mediaObjectKey(user.organizationId,'image',generated.extension);await uploadObject(key,generated.buffer,generated.contentType);const checksum=sha256(generated.buffer);
   const asset=await dbOne<{id:string}>(`INSERT INTO asset_manifests(organization_id,media_kind,object_key,checksum,version,status,category,meta,job_id,created_at,updated_at)
    VALUES($1,'image',$2,$3,1,'draft',$4,$5,$6,NOW(),NOW()) RETURNING id`,user.organizationId,key,checksum,body.category,{prompt:body.prompt,targetBank:body.targetBank,contentType:generated.contentType,provider:generated.provider,...generated.metadata},job!.id);
   await dbExec(`UPDATE media_generation_jobs SET provider=$1,status='succeeded',result_object_key=$2,checksum=$3,updated_at=NOW() WHERE id=$4`,generated.provider,key,checksum,job!.id);
   return ok({assetId:asset!.id,jobId:job!.id,previewUrl:`/api/admin/media/assets?id=${asset!.id}`,checksum,status:'draft',provider:generated.provider});
  }catch(error){await dbExec(`UPDATE media_generation_jobs SET status='failed',error=$1,updated_at=NOW() WHERE id=$2`,error instanceof Error?error.message:'生成失败',job!.id);throw error}
 }catch(error){return catchError(error)}
}
