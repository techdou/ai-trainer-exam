'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Image, AudioLines, Loader2, Copy, Check, Download } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/session-client';

interface GeneratedItem {
  id: string;
  type: 'image' | 'audio';
  url: string;
  prompt: string;
  category: string;
  createdAt: string;
}

const IMAGE_PRESETS = [
  { label: '街景拍摄', prompt: '城市街道照片，包含行人和车辆，适合图片标注训练' },
  { label: '产品照片', prompt: '电商产品图片，白色背景，适合文件分类练习' },
  { label: '自然风光', prompt: '自然风景照片，山水树木，适合图像清洗练习' },
  { label: '文档扫描', prompt: '带有噪点和倾斜的扫描文档图片，适合OCR训练' },
];

const AUDIO_PRESETS = [
  { label: '客服对话', prompt: '您好，请问有什么可以帮您的吗？我想咨询一下产品的保修政策。', speaker: 'zh_female_xiaohe_uranus_bigtts' },
  { label: '新闻播报', prompt: '今天的天气预报：明天白天晴转多云，气温二十到二十八度，适合户外活动。', speaker: 'zh_male_m191_uranus_bigtts' },
  { label: '课堂讲解', prompt: '同学们好，今天我们来学习数据标注的基本概念。数据标注是指给原始数据添加标签的过程。', speaker: 'zh_female_vv_uranus_bigtts' },
];

const VOICE_OPTIONS = [
  { value: 'zh_female_xiaohe_uranus_bigtts', label: '小何 (女声，通用)' },
  { value: 'zh_female_vv_uranus_bigtts', label: 'Vivi (女声，中英)' },
  { value: 'zh_male_m191_uranus_bigtts', label: '云舟 (男声，通用)' },
  { value: 'zh_male_taocheng_uranus_bigtts', label: '小天 (男声，通用)' },
  { value: 'zh_female_xueayi_saturn_bigtts', label: '雪阿姨 (女声，儿童读物)' },
];

export default function MediaStudioPage() {
  const [activeTab, setActiveTab] = useState<'image' | 'audio'>('image');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState('2K');
  const [audioText, setAudioText] = useState('');
  const [audioSpeaker, setAudioSpeaker] = useState('zh_female_xiaohe_uranus_bigtts');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<GeneratedItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const generateImage = useCallback(async () => {
    if (!imagePrompt.trim()) {
      toast.error('请输入图片描述');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{ imageUrl: string; prompt: string; category: string }>('/api/admin/media/generate-image', {
        method: 'POST',
        body: { prompt: imagePrompt, size: imageSize },
      });
      if (data.ok && data.data) {
        const newItem: GeneratedItem = {
          id: crypto.randomUUID(),
          type: 'image',
          url: data.data.imageUrl,
          prompt: data.data.prompt,
          category: data.data.category,
          createdAt: new Date().toISOString(),
        };
        setItems((prev) => [newItem, ...prev]);
        toast.success('图片生成成功');
      } else {
        toast.error(data.error || '图片生成失败');
      }
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }, [imagePrompt, imageSize]);

  const generateAudio = useCallback(async () => {
    if (!audioText.trim()) {
      toast.error('请输入需要合成的文本');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{ audioUri: string; text: string; category: string }>('/api/admin/media/generate-audio', {
        method: 'POST',
        body: { text: audioText, speaker: audioSpeaker },
      });
      if (data.ok && data.data) {
        const newItem: GeneratedItem = {
          id: crypto.randomUUID(),
          type: 'audio',
          url: data.data.audioUri,
          prompt: data.data.text,
          category: data.data.category,
          createdAt: new Date().toISOString(),
        };
        setItems((prev) => [newItem, ...prev]);
        toast.success('音频合成成功');
      } else {
        toast.error(data.error || '音频合成失败');
      }
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }, [audioText, audioSpeaker]);

  const copyUrl = useCallback((item: GeneratedItem) => {
    navigator.clipboard.writeText(item.url);
    setCopiedId(item.id);
    toast.success('链接已复制');
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const downloadFile = useCallback(async (item: GeneratedItem) => {
    try {
      const response = await fetch(item.url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `media-${item.id}.${item.type === 'image' ? 'png' : 'mp3'}`;
      link.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error('下载失败');
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">素材工坊</h1>
        <p className="text-base text-muted-foreground">
          使用 AI 生成图片和音频素材，用于制作图片标注、音频转写等实操题目
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant={activeTab === 'image' ? 'default' : 'outline'}
          onClick={() => setActiveTab('image')}
          className="min-h-[44px] text-base"
        >
          <Image className="w-5 h-5 mr-2" />
          图片生成
        </Button>
        <Button
          variant={activeTab === 'audio' ? 'default' : 'outline'}
          onClick={() => setActiveTab('audio')}
          className="min-h-[44px] text-base"
        >
          <AudioLines className="w-5 h-5 mr-2" />
          音频合成
        </Button>
      </div>

      {activeTab === 'image' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">生成图片</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base">快捷模板</Label>
                <div className="flex flex-wrap gap-2">
                  {IMAGE_PRESETS.map((p) => (
                    <Button
                      key={p.label}
                      variant="outline"
                      size="sm"
                      onClick={() => setImagePrompt(p.prompt)}
                      className="min-h-[36px]"
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-base">图片描述</Label>
                <Textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="描述你想要生成的图片内容..."
                  rows={4}
                  className="text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">分辨率</Label>
                <Select value={imageSize} onValueChange={setImageSize}>
                  <SelectTrigger className="min-h-[44px] text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2K" className="text-base">2K 标准清晰度</SelectItem>
                    <SelectItem value="4K" className="text-base">4K 高清画质</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={generateImage}
                disabled={loading}
                className="w-full min-h-[48px] text-lg"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" />正在生成...</>
                ) : (
                  <><Image className="w-5 h-5 mr-2" />生成图片</>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">已生成素材 ({items.filter(i => i.type === 'image').length})</CardTitle>
            </CardHeader>
            <CardContent>
              {items.filter(i => i.type === 'image').length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Image className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-base">暂无生成的图片</p>
                  <p className="text-sm mt-1">输入描述后点击「生成图片」</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 max-h-[600px] overflow-y-auto">
                  {items.filter(i => i.type === 'image').map((item) => (
                    <div key={item.id} className="rounded-lg border overflow-hidden">
                      <img
                        src={item.url}
                        alt={item.prompt}
                        className="w-full h-40 object-cover"
                        loading="lazy"
                      />
                      <div className="p-3 space-y-2">
                        <p className="text-sm text-muted-foreground line-clamp-2">{item.prompt}</p>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => copyUrl(item)} className="min-h-[36px]">
                            {copiedId === item.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            <span className="ml-1">复制链接</span>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => downloadFile(item)} className="min-h-[36px]">
                            <Download className="w-4 h-4" />
                            <span className="ml-1">下载</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">合成音频</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base">快捷模板</Label>
                <div className="flex flex-wrap gap-2">
                  {AUDIO_PRESETS.map((p) => (
                    <Button
                      key={p.label}
                      variant="outline"
                      size="sm"
                      onClick={() => { setAudioText(p.prompt); setAudioSpeaker(p.speaker); }}
                      className="min-h-[36px]"
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-base">输入文本</Label>
                <Textarea
                  value={audioText}
                  onChange={(e) => setAudioText(e.target.value)}
                  placeholder="输入需要转换为语音的文本内容..."
                  rows={5}
                  className="text-base"
                />
                <p className="text-sm text-muted-foreground">{audioText.length} 字</p>
              </div>
              <div className="space-y-2">
                <Label className="text-base">说话人</Label>
                <Select value={audioSpeaker} onValueChange={setAudioSpeaker}>
                  <SelectTrigger className="min-h-[44px] text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_OPTIONS.map((v) => (
                      <SelectItem key={v.value} value={v.value} className="text-base">
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={generateAudio}
                disabled={loading}
                className="w-full min-h-[48px] text-lg"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" />正在合成...</>
                ) : (
                  <><AudioLines className="w-5 h-5 mr-2" />合成音频</>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">已生成音频 ({items.filter(i => i.type === 'audio').length})</CardTitle>
            </CardHeader>
            <CardContent>
              {items.filter(i => i.type === 'audio').length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <AudioLines className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-base">暂无生成的音频</p>
                  <p className="text-sm mt-1">输入文本后点击「合成音频」</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {items.filter(i => i.type === 'audio').map((item) => (
                    <div key={item.id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-muted-foreground line-clamp-3 flex-1">{item.prompt}</p>
                        <Badge variant="secondary">音频</Badge>
                      </div>
                      <audio controls src={item.url} className="w-full" />
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => copyUrl(item)} className="min-h-[36px]">
                          {copiedId === item.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          <span className="ml-1">复制链接</span>
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadFile(item)} className="min-h-[36px]">
                          <Download className="w-4 h-4" />
                          <span className="ml-1">下载</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <div className="flex-1">
              <p className="font-medium text-foreground mb-1">使用说明</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>生成的图片可用于图片标注、图像清洗、文件分类等实操题目</li>
                <li>生成的音频可用于音频转写练习</li>
                <li>点击「复制链接」可将素材URL粘贴到题目配置中</li>
                <li>点击「下载」可保存素材到本地</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
