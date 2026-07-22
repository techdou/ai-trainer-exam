import { NextRequest } from 'next/server';
import { TTSClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { requireRole } from '@/server/auth';
import { ok, fail } from '@/lib/api';

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(request, ['super_admin', 'school_admin', 'teacher', 'question_editor']);
    if (!user) return fail(401, '请先登录');

    const body = await request.json();
    const { text, speaker, category } = body as {
      text: string;
      speaker?: string;
      category?: string;
    };

    if (!text || !text.trim()) {
      return fail(400, '请输入需要合成的文本');
    }

    const config = new Config();
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = new TTSClient(config, customHeaders);

    const response = await client.synthesize({
      uid: 'media-studio',
      text: text.trim(),
      speaker: speaker || 'zh_female_xiaohe_uranus_bigtts',
      audioFormat: 'mp3',
      sampleRate: 24000,
    });

    return ok({
      audioUri: response.audioUri,
      audioSize: response.audioSize,
      text: text.trim(),
      category: category || 'general',
    });
  } catch (err) {
    console.error('[admin/media/generate-audio] POST error:', err);
    return fail(500, '音频合成失败，请稍后再试');
  }
}
