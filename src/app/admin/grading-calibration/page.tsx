'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/session-client';
import { AnnotationCanvas, type AnnotationData, type AnnotationTool } from '@/components/annotation-canvas';
import { SlidersHorizontal, Save, Eye, Loader2, Image as ImageIcon } from 'lucide-react';

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

const TOOL_FROM_TYPE: Record<string, AnnotationTool> = {
  image_annotation: 'bbox',
  bounding_box: 'bbox',
  point_annotation: 'point',
  polyline_annotation: 'polyline',
  polygon_annotation: 'polygon',
};

const TYPE_LABELS: Record<string, string> = {
  image_annotation: 'box annotation (IoU)',
  bounding_box: 'box annotation (IoU)',
  point_annotation: 'point annotation',
  polyline_annotation: 'polyline annotation (Chamfer)',
  polygon_annotation: 'contour annotation (IoU)',
};

const ANNOTATION_TYPES = ['image_annotation', 'bounding_box', 'point_annotation', 'polyline_annotation', 'polygon_annotation'];

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

  // --- placeholder for next sections ---
  const fetchTasks = useCallback(async (bank: 'practice' | 'exam') => {
    setLoading(true);
    try {
      const res = await apiFetch<TaskTemplate[]>(
        `/api/admin/task-templates?bankType=${bank}&annotationOnly=true&includeAnswerKey=true`,
      );
      if (res.ok && res.data) {
        setTasks(res.data);
      } else {
        toast.error(res.error ?? 'failed to load tasks');
        setTasks([]);
      }
    } catch {
      toast.error('failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(bankType); }, [bankType, fetchTasks]);

  // load answer_key into canvas when task selected
  useEffect(() => {
    const task = tasks.find((t) => t.id === selectedId) ?? null;
    setCurrentTask(task);
    setAnnotation(answerKeyToCanvas(task?.answerKey));
  }, [selectedId, tasks]);

  const handleSave = async () => {
    if (!currentTask) return;
    setSaving(true);
    try {
      const answerKey = canvasToAnswerKey(annotation);
      const res = await apiFetch<{ id: string }>(`/api/admin/task-templates`, {
        method: 'PUT',
        body: { bankType, id: currentTask.id, answerKey },
      });
      if (res.ok) {
        toast.success('answer key saved');
      } else {
        toast.error(res.error ?? 'save failed');
      }
    } catch {
      toast.error('save failed');
    } finally {
      setSaving(false);
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
          <h1 className="text-2xl font-bold">Grading Calibration</h1>
          <p className="text-sm text-muted-foreground">Calibrate answer keys for annotation tasks</p>
        </div>
      </div>

      {/* Task selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImageIcon className="h-5 w-5" />
            Select Task
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={bankType} onValueChange={(v) => setBankType(v as 'practice' | 'exam')}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="practice">Practice</SelectItem>
                <SelectItem value="exam">Exam</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="min-w-[280px] flex-1">
                <SelectValue placeholder="-- select task --" />
              </SelectTrigger>
              <SelectContent>
                {tasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title} ({t.difficulty}*)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>

      {/* Canvas area — appended in next edit */}
      {currentTask && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span>{currentTask.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{TYPE_LABELS[currentTask.taskType] ?? currentTask.taskType}</Badge>
                <Badge variant="outline">{tool}</Badge>
                <Badge variant="outline">D{currentTask.difficulty}</Badge>
              </div>
            </CardTitle>
            {currentTask.instructions && (
              <p className="text-sm text-muted-foreground">{currentTask.instructions}</p>
            )}
          </CardHeader>
          <CardContent>
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
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                This task has no image configured. Set imageUrl in config first.
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
              <span>Answer Key</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowJson((s) => !s)}>
                  <Eye className="mr-1 h-4 w-4" />
                  {showJson ? 'hide JSON' : 'view JSON'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || totalAnnotations === 0}
                >
                  {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  Save Answer Key
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              {annotation.boxes?.length ? <Badge>boxes: {annotation.boxes.length}</Badge> : null}
              {annotation.points?.length ? <Badge>points: {annotation.points.length}</Badge> : null}
              {annotation.lines?.length ? <Badge>lines: {annotation.lines.length}</Badge> : null}
              {annotation.polygons?.length ? <Badge>contours: {annotation.polygons.length}</Badge> : null}
              {totalAnnotations === 0 && <span className="text-sm text-muted-foreground">No annotations yet. Draw on the canvas above.</span>}
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
