import { readdir } from 'fs/promises';
import { join } from 'path';
import { requireRole } from '@/server/auth';
import { dbQuery } from '@/server/db';
import { ok, catchError } from '@/lib/api';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];

/** Recursively scan a public subdirectory for image files. */
async function scanLocalImages(
  baseDir: string,
  urlPrefix: string,
): Promise<Array<{ url: string; label: string; source: 'local' }>> {
  const results: Array<{ url: string; label: string; source: 'local' }> = [];
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(baseDir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await scanLocalImages(fullPath, `${urlPrefix}/${entry.name}`));
      } else if (IMAGE_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        results.push({
          url: `${urlPrefix}/${entry.name}`,
          label: entry.name,
          source: 'local' as const,
        });
      }
    }
  } catch {
    // Directory might not exist
  }
  return results;
}


export async function GET(request: Request) {
  try {
    await requireRole(request, ['super_admin', 'school_admin', 'question_editor', 'question_reviewer', 'teacher']);

    const workspacePath = process.env.COZE_WORKSPACE_PATH ?? '/workspace/projects';

    // Scan local public directories for images
    const [trainingImages, taskImages] = await Promise.all([
      scanLocalImages(join(workspacePath, 'public', 'training'), '/training'),
      scanLocalImages(join(workspacePath, 'public', 'task-images'), '/task-images'),
    ]);
    const localImages = [...trainingImages, ...taskImages].map(({ url, label }) => ({
      url,
      label,
      source: 'local' as const,
    }));

    // Scan media studio assets (published images only) — return asset:UUID format
    const studioAssets = await dbQuery<{ id: string; object_key: string; category: string | null; meta: Record<string, unknown> }>(
      `SELECT id, object_key, category, meta FROM asset_manifests
        WHERE media_kind = 'image' AND status IN ('published','draft')
        ORDER BY created_at DESC LIMIT 200`,
    );

    const studioImages: Array<{ url: string; label: string; source: 'studio'; assetId: string }> = [];
    for (const a of studioAssets) {
      const labelText = a.meta?.prompt?.toString().slice(0, 30) ?? (a.meta?.originalFileName as string | undefined)?.slice(0, 30) ?? a.id.slice(0, 8);
      studioImages.push({
        url: `/api/media/asset/${a.id}`,
        label: `${a.category ?? 'studio'} - ${labelText}`,
        source: 'studio' as const,
        assetId: a.id,
      });
    }

    return ok([...localImages, ...studioImages]);
  } catch (error) {
    return catchError(error);
  }
}
