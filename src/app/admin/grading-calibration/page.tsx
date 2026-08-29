'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { apiFetch, getToken } from '@/lib/session-client';
import { AnnotationCanvas, type AnnotationData, type AnnotationTool } from '@/components/annotation-canvas';
import { SlidersHorizontal, Save, Eye, Loader2, Image as ImageIcon, RefreshCw, Upload } from 'lucide-react';

interface TaskTemplate {
  id: string;
  taskType: string;
  title: string;
  instructions: string | null;
  difficulty: number;
  config: Record<string, unknown>;
  gradingConfig?: Record<string, unknown>;
  answerKey?: unknown;
  reviewStatus?: string;
}

interface AvailableImage {
  url: string;
  label: string;
  source: 'local' | 'studio';
}

const TOOL_FROM_TYPE: Record<string, AnnotationTool> = {
  image_annotation: 'bbox',
  bounding_box: 'bbox',
  point_annotation: 'point',
  polyline_annotation: 'polyline',
  polygon_annotation: 'polygon',
};

const TYPE_LABELS: Record<string, string> = {
  image_annotation: '框选标注（IoU）',
  bounding_box: '框选标注（IoU）',
  point_annotation: '打点标注',
  polyline_annotation: '折线标注（Chamfer）',
  polygon_annotation: '轮廓标注（IoU）',
};

const TOOL_LABELS: Record<string, string> = {
  bbox: '框选',
  point: '打点',
  polyline: '折线',
  polygon: '轮廓',
};

function extractImageUrl(config: Record<string, unknown>): string | undefined {
  return typeof config.imageUrl === 'string' ? config.imageUrl : undefined;
}

function extractLabels(config: Record<string, unknown>): string[] {
  const raw = config.targetLabels ?? config.labels;
  return Array.isArray(raw) ? raw.map(String) : ['target'];
}

function extractAttributes(config: Record<string, unknown>): Record<string, string[]> | undefined {
  const raw = config.attributes;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, string[]>
    : undefined;
}

/** Convert answer_key DB format to canvas AnnotationData. */
function answerKeyToCanvas(answerKey: unknown): AnnotationData {
  const rec = answerKey && typeof answerKey === 'object' && !Array.isArray(answerKey) ? answerKey as Record<string, unknown> : {};
  return {
    boxes: Array.isArray(rec.boxes) ? rec.boxes as AnnotationData['boxes'] : [],
    points: Array.isArray(rec.points) ? rec.points as AnnotationData['points'] : [],
    lines: Array.isArray(rec.lines) ? rec.lines as AnnotationData['lines'] : [],
    polygons: Array.isArray(rec.polygons) ? rec.polygons as AnnotationData['polygons'] : [],
  };
}

/** Convert canvas AnnotationData to answer_key DB format. */
function canvasToAnswerKey(data: AnnotationData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (data.boxes?.length) out.boxes = data.boxes;
  if (data.points?.length) out.points = data.points;
  if (data.lines?.length) out.lines = data.lines;
  if (data.polygons?.length) out.polygons = data.polygons;
  return out;
}

export default function GradingCalibrationPage() {
  const [bankType, setBankType] = useState<'practice' | 'exam'>('practice');
  const [tasks, setTasks] = useState<TaskTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [currentTask, setCurrentTask] = useState<TaskTemplate | null>(null);
  const [annotation, setAnnotation] = useState<AnnotationData>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showJson, setShowJson] = useState(false);

  // Image management
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [availableImages, setAvailableImages] = useState<AvailableImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchTasks = useCallback(async (bank: 'practice' | 'exam') => {
    setLoading(true);
    try {
      const res = await apiFetch<TaskTemplate[]>(
        `/api/admin/task-templates?bankType=${bank}&annotationOnly=true&includeAnswerKey=true`,
      );
      if (res.ok && res.data) {
        setTasks(res.data);
      } else {
        toast.error(res.error ?? '加载任务列表失败');
        setTasks([]);
      }
    } catch {
      toast.error('加载任务列表失败');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchImages = useCallback(async () => {
    setLoadingImages(true);
    try {
      const res = await apiFetch<AvailableImage[]>('/api/admin/media/images');
      if (res.ok && res.data) {
        setAvailableImages(res.data);
      }
    } catch {
      // Silent fail — not critical
    } finally {
      setLoadingImages(false);
    }
  }, []);

  useEffect(() => { fetchTasks(bankType); }, [bankType, fetchTasks]);
  useEffect(() => { fetchImages(); }, [fetchImages]);

  // load answer_key into canvas when task selected
  useEffect(() => {
    const task = tasks.find((t) => t.id === selectedId) ?? null;
    setCurrentTask(task);
    setAnnotation(answerKeyToCanvas(task?.answerKey));
    setImageUrlInput(extractImageUrl(task?.config ?? {}) ?? '');
    setShowImagePanel(false);
  }, [selectedId, tasks]);

  const handleSaveAnswerKey = async () => {
    if (!currentTask) return;
    setSaving(true);
    try {
      const answerKey = canvasToAnswerKey(annotation);
      const res = await apiFetch<{ id: string }>(`/api/admin/task-templates`, {
        method: 'PUT',
        body: { bankType, id: currentTask.id, answerKey },
      });
      if (res.ok) {
        toast.success('标准答案已保存');
        // Update local state
        const updated = tasks.map(t => t.id === currentTask.id ? { ...t, answerKey } : t);
        setTasks(updated);
      } else {
        toast.error(res.error ?? '保存失败');
      }
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveImage = async () => {
    if (!currentTask || !imageUrlInput.trim()) return;
    setSavingImage(true);
    try {
      const res = await apiFetch<{ id: string }>(`/api/admin/task-templates`, {
        method: 'PUT',
        body: { bankType, id: currentTask.id, config: { imageUrl: imageUrlInput.trim() } },
      });
      if (res.ok) {
        toast.success('图片已更新——请在新图上重新校准标注');
        // Update local state
        const newConfig = { ...currentTask.config, imageUrl: imageUrlInput.trim() };
        const updated = tasks.map(t => t.id === currentTask.id ? { ...t, config: newConfig } : t);
        setTasks(updated);
        setCurrentTask({ ...currentTask, config: newConfig });
        // Clear annotations since they won't match the new image
        setAnnotation({});
        setShowImagePanel(false);
      } else {
        toast.error(res.error ?? '更新图片失败');
      }
    } catch {
      toast.error('更新图片失败');
    } finally {
      setSavingImage(false);
    }
  };

  const handleUploadImage = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'calibration');
      // token 存在 sessionStorage(全站约定),走统一 getToken();裸 localStorage 读法永远取不到 token。
      const token = getToken();
      const res = await fetch('/api/admin/media/upload-image', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const json = await res.json();
      if (json.success && json.data?.imageUrl) {
        setImageUrlInput(json.data.imageUrl);
        toast.success(`已上传：${json.data.fileName ?? file.name}`);
        await fetchImages();
      } else {
        toast.error(json.error ?? '上传失败');
      }
    } catch {
      toast.error('上传失败');
    } finally {
      setUploading(false);
    }
  };

  const tool = currentTask ? TOOL_FROM_TYPE[currentTask.taskType] ?? 'bbox' : 'bbox';
  const imageUrl = currentTask ? extractImageUrl(currentTask.config) : undefined;
  const labels = currentTask ? extractLabels(currentTask.config) : ['target'];
  const attributesConfig = currentTask ? extractAttributes(currentTask.config) : undefined;
  const totalAnnotations = (annotation.boxes?.length ?? 0) + (annotation.points?.length ?? 0) + (annotation.lines?.length ?? 0) + (annotation.polygons?.length ?? 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SlidersHorizontal className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">评分校准</h1>
          <p className="text-sm text-muted-foreground">为标注类实操任务校准标准答案</p>
        </div>
      </div>

      {/* Task selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImageIcon className="h-5 w-5" />
            选择任务
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={bankType} onValueChange={(v) => setBankType(v as 'practice' | 'exam')}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="practice">练习</SelectItem>
                <SelectItem value="exam">考试</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="min-w-[280px] flex-1">
                <SelectValue placeholder="—— 选择任务 ——" />
              </SelectTrigger>
              <SelectContent>
                {tasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}（难度 {t.difficulty}）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>

      {/* Canvas area */}
      {currentTask && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span>{currentTask.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{TYPE_LABELS[currentTask.taskType] ?? currentTask.taskType}</Badge>
                <Badge variant="outline">{TOOL_LABELS[tool] ?? tool}</Badge>
                <Badge variant="outline">难度 {currentTask.difficulty}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowImagePanel(s => !s)}
                >
                  <ImageIcon className="mr-1 h-4 w-4" />
                  更换图片
                </Button>
              </div>
            </CardTitle>
            {currentTask.instructions && (
              <p className="text-sm text-muted-foreground">{currentTask.instructions}</p>
            )}
          </CardHeader>
          <CardContent>
            {/* Image change panel */}
            {showImagePanel && (
              <div className="mb-4 rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="text-sm font-medium">更换图片</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="/training/gen/your-image.jpg"
                    className="flex-1 min-w-[260px]"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveImage}
                    disabled={savingImage || !imageUrlInput.trim() || imageUrlInput.trim() === imageUrl}
                  >
                    {savingImage ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                    应用图片
                  </Button>
                </div>
                {/* Available images dropdown */}
                <div className="flex items-center gap-2">
                  <Select onValueChange={(v) => setImageUrlInput(v)}>
                    <SelectTrigger className="min-w-[280px]">
                      <SelectValue placeholder="从可用图片中选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {loadingImages && <SelectItem value="__loading" disabled>加载中...</SelectItem>}
                      {availableImages.map((img) => (
                        <SelectItem key={img.url} value={img.url}>
                          {img.label} ({img.source === 'local' ? '本地' : '工作台'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" onClick={fetchImages} disabled={loadingImages}>
                    <RefreshCw className={`h-4 w-4 ${loadingImages ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                {availableImages.length === 0 && !loadingImages && (
                  <p className="text-xs text-muted-foreground">
                    暂无可用图片。可在下方上传文件，或通过媒体工作台生成。
                  </p>
                )}
                {/* Upload new image */}
                <div className="flex items-center gap-2 border-t pt-3">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? '上传中...' : '上传图片'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadImage(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">
                    支持 JPG / PNG / WebP，最大 10MB。上传至云存储后立即可用。
                  </span>
                </div>
                {imageUrlInput.trim() !== imageUrl && imageUrlInput.trim() && (
                  <p className="text-xs text-amber-600">
                    更换图片会清除已画的标注——应用后请重新校准。
                  </p>
                )}
              </div>
            )}

            {/* Current image preview */}
            {imageUrl ? (
              <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                <span>当前图片：</span>
                <code className="rounded bg-muted px-1.5 py-0.5">{imageUrl}</code>
              </div>
            ) : null}

            {imageUrl ? (
              <AnnotationCanvas
                imageUrl={imageUrl}
                tool={tool}
                labels={labels}
                attributesConfig={attributesConfig}
                value={annotation}
                onChange={setAnnotation}
                minHeight={420}
              />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-muted-foreground">
                <span>该任务尚未配置图片。</span>
                <Button variant="outline" size="sm" onClick={() => setShowImagePanel(true)}>
                  <ImageIcon className="mr-1 h-4 w-4" /> 设置图片地址
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Save bar & JSON preview */}
      {currentTask && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span>标准答案</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowJson((s) => !s)}>
                  <Eye className="mr-1 h-4 w-4" />
                  {showJson ? '收起 JSON' : '查看 JSON'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveAnswerKey}
                  disabled={saving || totalAnnotations === 0}
                >
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  保存标准答案
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              {annotation.boxes?.length ? <Badge>选框 {annotation.boxes.length}</Badge> : null}
              {annotation.points?.length ? <Badge>点 {annotation.points.length}</Badge> : null}
              {annotation.lines?.length ? <Badge>折线 {annotation.lines.length}</Badge> : null}
              {annotation.polygons?.length ? <Badge>轮廓 {annotation.polygons.length}</Badge> : null}
              {totalAnnotations === 0 && <span className="text-sm text-muted-foreground">暂无标注，请在上方画布中绘制。</span>}
            </div>
            {showJson && (
              <pre className="max-h-64 overflow-auto rounded-lg border bg-muted p-4 text-xs">
                {JSON.stringify(canvasToAnswerKey(annotation), null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
