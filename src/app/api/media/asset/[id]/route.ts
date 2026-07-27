import { dbOne } from '@/server/db';
import { readObject } from '@/server/object-storage';

/**
 * Public media proxy: reads an asset from object storage and streams it back.
 * No auth required — images/audio for training tasks are not sensitive.
 *
 * URL format: /api/media/asset/<uuid>
 *
 * This avoids presigned URL expiration issues entirely.
 * Browser caches via Cache-Control headers.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;

    // Validate UUID format to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return new Response('Invalid asset ID', { status: 400 });
    }

    const asset = await dbOne<{ object_key: string; media_kind: string; status: string }>(
      `SELECT object_key, media_kind, status
       FROM asset_manifests
       WHERE id = $1 AND deleted_at IS NULL`,
      id,
    );

    if (!asset) {
      return new Response('Asset not found', { status: 404 });
    }

    const object = await readObject(asset.object_key);
    const bytes = new Uint8Array(object.body);

    return new Response(bytes, {
      headers: {
        'Content-Type': object.contentType,
        'Content-Length': String(object.length ?? bytes.byteLength),
        // Cache for 1 day in browser, 7 days in CDN
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(`Media proxy error: ${message}`, { status: 500 });
  }
}
