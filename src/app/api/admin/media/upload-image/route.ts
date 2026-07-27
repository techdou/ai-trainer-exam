import { S3Storage } from 'coze-coding-dev-sdk';
import { organizationScope, requireRole } from '@/server/auth';
import { dbOne } from '@/server/db';
import { ok, fail, catchError } from '@/lib/api';
import { sha256 } from '@/server/object-storage';
import { randomUUID } from 'node:crypto';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function extensionFromType(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    default: return 'bin';
  }
}

let storageInstance: S3Storage | null = null;
function getStorage(): S3Storage {
  if (storageInstance) return storageInstance;
  storageInstance = new S3Storage({
    endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
    accessKey: '',
    secretKey: '',
    bucketName: process.env.COZE_BUCKET_NAME,
    region: 'cn-beijing',
  });
  return storageInstance;
}

export async function POST(request: Request) {
  try {
    const user = await requireRole(request, ['super_admin', 'school_admin', 'question_editor']);

    const formData = await request.formData();
    const file = formData.get('file');
    const category = (formData.get('category') as string | null)?.trim() || 'uploaded';

    if (!file || !(file instanceof File)) {
      return fail(400, '请选择图片文件');
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return fail(400, `不支持的图片格式: ${file.type}，请使用 JPG/PNG/WebP`);
    }

    if (file.size > MAX_SIZE) {
      return fail(400, `图片大小不能超过 10MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = extensionFromType(file.type);
    const organizationId = user.roles.includes('super_admin') ? user.organizationId : organizationScope(user);

    // Upload to object storage via SDK
    const storage = getStorage();
    const fileName = `media/${organizationId ?? 'global'}/image/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
    const objectKey = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type,
    });

    const checksum = sha256(buffer);

    const asset = await dbOne<{ id: string }>(
      `INSERT INTO asset_manifests(organization_id, media_kind, object_key, checksum, version, status, category, meta, created_at, updated_at)
       VALUES($1, 'image', $2, $3, 1, 'published', $4, $5, NOW(), NOW())
       RETURNING id`,
      organizationId,
      objectKey,
      checksum,
      category,
      {
        originalFileName: file.name,
        contentType: file.type,
        uploadedBy: user.id,
        size: file.size,
        source: 'manual_upload',
      },
    );

    // Generate a presigned URL so <img> tags can load it directly (no auth header needed)
    const presignedUrl = await getStorage().generatePresignedUrl({ key: objectKey, expireTime: 86400 });

    return ok({
      assetId: asset!.id,
      url: presignedUrl,
      fileName: file.name,
      size: file.size,
    });
  } catch (error) {
    return catchError(error);
  }
}
