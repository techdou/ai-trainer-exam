import { NextRequest } from 'next/server';
import { ImageGenerationClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { requireRole } from '@/server/auth';
import { ok, fail } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin', 'school_admin', 'teacher', 'question_editor']);
    if (!user) return fail(401, '请先登录');

    const body = await request.json();
    const { prompt, size, category } = body as { prompt: string; size?: string; category?: string };

    if (!prompt || !prompt.trim()) {
      return fail(400, '请输入图片描述');
    }

    const config = new Config();
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = new ImageGenerationClient(config, customHeaders);

    const response = await client.generate({
      prompt: prompt.trim(),
      size: size || '2K',
    });

    const helper = client.getResponseHelper(response);

    if (helper.success && helper.imageUrls.length > 0) {
      return ok({
        imageUrl: helper.imageUrls[0],
        prompt: prompt.trim(),
        category: category || 'general',
      });
    }

    return fail(500, helper.errorMessages.join('; ') || '图片生成失败，请重试');
  } catch (err) {
    console.error('[admin/media/generate-image] POST error:', err);
    return fail(500, '图片生成失败，请稍后再试');
  }
}
