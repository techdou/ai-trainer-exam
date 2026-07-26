import { randomUUID, createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

let client: S3Client | null = null;
function getClient(): S3Client {
  if (client) return client;
  const endpoint = process.env.COZE_BUCKET_ENDPOINT_URL;
  if (!endpoint) throw new Error('对象存储未配置：缺少 COZE_BUCKET_ENDPOINT_URL');
  client = new S3Client({
    endpoint,
    region: process.env.AWS_REGION || process.env.COZE_BUCKET_REGION || 'auto',
    forcePathStyle: process.env.COZE_BUCKET_FORCE_PATH_STYLE === 'true',
  });
  return client;
}
function bucket(): string {
  const name = process.env.COZE_BUCKET_NAME;
  if (!name) throw new Error('对象存储未配置：缺少 COZE_BUCKET_NAME');
  return name;
}
export function sha256(buffer: Buffer): string { return createHash('sha256').update(buffer).digest('hex'); }
export function mediaObjectKey(organizationId: string | null, kind: 'image'|'audio', extension: string): string {
  const safeExt = extension.replace(/[^a-z0-9]/gi,'').toLowerCase() || 'bin';
  return `media/${organizationId ?? 'global'}/${kind}/${new Date().toISOString().slice(0,10)}/${randomUUID()}.${safeExt}`;
}
export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, Metadata: { sha256: sha256(body) } }));
}
export async function readObject(key: string): Promise<{ body: Uint8Array; contentType: string; length?: number }> {
  const response = await getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!response.Body) throw new Error('素材内容不存在');
  const bytes = await response.Body.transformToByteArray();
  return { body: bytes, contentType: response.ContentType || 'application/octet-stream', length: response.ContentLength };
}
