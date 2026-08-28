/**
 * 素材迁移脚本：将 public/training/ 下的本地图片上传到对象存储,
 * 并在 asset_manifests 表中注册为 published 状态。
 *
 * 用途：
 *   - 部署到新环境后，本地图片不在 public 目录时也能通过对象存储访问
 *   - 统一素材管理入口，不再依赖 public 静态文件
 *
 * 用法：
 *   pnpm tsx scripts/db/migrate-assets.mts
 *
 * 行为：
 *   - 按 SHA256 去重，已上传的同文件跳过
 *   - 仅上传图片文件（.jpg .jpeg .png .webp .gif .svg）
 *   - 输出每张图片的新 URL，可用于更新任务模板 config.imageUrl
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import pg from 'pg';
import { getDbUrl, loadEnv } from 'coze-coding-dev-sdk';
import { createHash, randomUUID } from 'node:crypto';
import { getStorage } from '../../src/server/object-storage';
import { loadEnvLocal } from './_env.mjs';

loadEnv();
loadEnvLocal();

const db = new pg.Client({ connectionString: await getDbUrl() });
await db.connect();

// ── S3Storage 与服务端同一 env 驱动构造(自部署 MinIO 凭证走 AWS_* 环境变量),不再硬编码空凭证 ──
const storage = getStorage();

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const WORKSPACE = process.env.COZE_WORKSPACE_PATH ?? process.cwd();

/** Recursively collect image files from a directory */
async function collectImages(baseDir: string, prefix = ''): Promise<Array<{ path: string; relativePath: string }>> {
  const results: Array<{ path: string; relativePath: string }> = [];
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(baseDir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(...await collectImages(fullPath, relPath));
      } else if (IMAGE_EXTENSIONS.includes(extname(entry.name).toLowerCase())) {
        results.push({ path: fullPath, relativePath: relPath });
      }
    }
  } catch {
    // directory doesn't exist
  }
  return results;
}

async function main() {
  console.log('=== Asset Migration: local images -> object storage ===\n');

  // Get org ID for scoping
  const org = (await db.query<{ id: string }>(
    `SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1`,
  )).rows[0];
  if (!org) throw new Error('No active organization found. Run seed-core first.');
  console.log(`Organization: ${org.id}\n`);

  // Collect images
  const trainingDir = join(WORKSPACE, 'public', 'training');
  const taskImagesDir = join(WORKSPACE, 'public', 'task-images');

  const [trainingImgs, taskImgs] = await Promise.all([
    collectImages(trainingDir, 'training'),
    collectImages(taskImagesDir, 'task-images'),
  ]);
  const allImages = [...trainingImgs, ...taskImgs];

  console.log(`Found ${allImages.length} local images to migrate.\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<{ fileName: string; assetId: string; url: string }> = [];

  for (const img of allImages) {
    try {
      const buffer = await readFile(img.path);
      const checksum = createHash('sha256').update(buffer).digest('hex');

      // Check if already uploaded (by checksum)
      const existing = (await db.query<{ id: string }>(
        `SELECT id FROM asset_manifests WHERE checksum=$1 AND media_kind='image' LIMIT 1`,
        [checksum],
      )).rows[0];

      if (existing) {
        console.log(`  SKIP (duplicate): ${img.relativePath}`);
        skipped++;
        results.push({ fileName: img.relativePath, assetId: existing.id, url: `/api/admin/media/assets?id=${existing.id}` });
        continue;
      }

      // Upload to object storage via SDK
      const ext = extname(img.path).replace('.', '');
      const fileName = `media/${org.id}/image/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
      const contentType = CONTENT_TYPES[extname(img.path).toLowerCase()] ?? 'application/octet-stream';

      const objectKey = await storage.uploadFile({
        fileContent: buffer,
        fileName,
        contentType,
      });

      // Register in asset_manifests as published
      const asset = (await db.query<{ id: string }>(
        `INSERT INTO asset_manifests(organization_id, media_kind, object_key, checksum, version, status, category, meta, created_at, updated_at)
         VALUES($1, 'image', $2, $3, 1, 'published', $4, $5, NOW(), NOW())
         RETURNING id`,
        [org.id, objectKey, checksum, 'migrated', { originalFileName: img.relativePath, contentType, size: buffer.length, source: 'asset_migration' }],
      )).rows[0];

      const url = `/api/admin/media/assets?id=${asset!.id}`;
      console.log(`  OK: ${img.relativePath} -> ${url}`);
      results.push({ fileName: img.relativePath, assetId: asset!.id, url });
      migrated++;
    } catch (err) {
      console.error(`  FAIL: ${img.relativePath} -> ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n=== Done: ${migrated} migrated, ${skipped} skipped, ${failed} failed, ${allImages.length} total ===\n`);

  // Output summary table for reference
  if (results.length > 0) {
    console.log('Asset URL mapping (copy these to update task templates if needed):');
    console.log('');
    for (const r of results) {
      console.log(`  ${r.fileName}`);
      console.log(`    -> ${r.url}`);
    }
  }

  await db.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
