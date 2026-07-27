import { randomUUID, createHash } from 'node:crypto';
import { S3Storage } from 'coze-coding-dev-sdk';

let storage: S3Storage | null = null;

function getStorage(): S3Storage {
  if (storage) return storage;
  const endpoint = process.env.COZE_BUCKET_ENDPOINT_URL;
  const bucketName = process.env.COZE_BUCKET_NAME;
  if (!endpoint || !bucketName) {
    throw new Error('对象存储未配置：缺少 COZE_BUCKET_ENDPOINT_URL 或 COZE_BUCKET_NAME');
  }
  // S3Storage uses empty credentials — the platform S3 proxy handles auth transparently
  storage = new S3Storage({
    endpointUrl: endpoint,
    accessKey: '',
    secretKey: '',
    bucketName,
    region: process.env.AWS_REGION || process.env.COZE_BUCKET_REGION || 'cn-beijing',
  });
  return storage;
}

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function mediaObjectKey(organizationId: string | null, kind: 'image' | 'audio', extension: string): string {
  const safeExt = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `media/${organizationId ?? 'global'}/${kind}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${safeExt}`;
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const objectKey = await getStorage().uploadFile({
    fileContent: body,
    fileName: key,
    contentType,
  });
  return objectKey;
}

export async function readObject(key: string): Promise<{ body: Uint8Array; contentType: string; length?: number }> {
  const buffer = await getStorage().readFile({ fileKey: key });
  return {
    body: new Uint8Array(buffer),
    contentType: guessContentType(key),
    length: buffer.length,
  };
}

function guessContentType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
  };
  return types[ext ?? ''] ?? 'application/octet-stream';
}
