'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/session-client';
import { toast } from 'sonner';
import { Image as ImageIcon, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExamTaskInput, ExcelRows, StatsTable, FileClassify, type Config } from '@/components/exam-task-input';
import { AnnotationFeedback, isAnnotationTaskType } from '@/components/annotation-feedback';

// ─── 类型 ──────────────────────────────────────────────────────

interface TaskItem {
  id: string;
  title: string;
  taskType: string;
  instructions: string;
  difficulty: number;
  practiceOnly: boolean;
  config: TaskConfig | null;
  lastAttempt: { score: number; passed: boolean } | null;
}

interface TaskConfig {
  // excel_delete_rows
  columns?: string[];
  dataRows?: string[][];
  rowIds?: string[];
  // stats_table
  rows?: string[][];
  editableCells?: string[];
  // file_classify
  categories?: string[];
  files?: { id?: string; name: string; size: string }[];
  // image_clean
  images?: { id: string; description: string; url?: string; issues?: string[] }[];
  // image_annotation
  imageUrl?: string;
  targetLabels?: string[];
  // text_sentiment
  texts?: { id: string; content: string }[];
  labels?: string[];
  // audio_transcription
  audioUrl?: string;
  // shared
  instructions?: string;
  // excel_comprehensive
  classColumnIndex?: number;
  scoreColumnIndices?: number[];
  totalColumnIndex?: number;
  colorOptions?: string[];
}

interface SubmitResult {
  correct: boolean;
  score: number;
  feedback: string;
  passed: boolean;
  details?: Record<string, unknown>;
  answerKey?: unknown;
}

// ─── 主页面 ────────────────────────────────────────────────────

export default function TaskPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  // 判分反馈可视化需要回显学员刚才提交的标注,与 result 同生命周期。
  const [lastSubmission, setLastSubmission] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<TaskItem[]>('/api/student/practice/task')
      .then(data => {
        if (data.ok && data.data) {
          setTasks(
            data.data.map(t => ({
              ...t,
              config: t.config ?? null,
            })),
          );
        } else {
          toast.error(data.error || '加载任务失败');
        }
      })
      .catch(() => toast.error('网络错误，请稍后重试'))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = useCallback(
    async (submission: unknown) => {
      if (!activeTask) return;
      setSubmitting(true);
      try {
        const res = await apiFetch<SubmitResult>(
          '/api/student/practice/submit',
          {
            method: 'POST',
            body: {
              taskId: activeTask.id,
              submission,
            },
          },
        );
        if (res.ok && res.data) {
          setResult(res.data);
          setLastSubmission(submission);
        } else {
          toast.error(res.error || '提交失败');
        }
      } catch {
        toast.error('网络错误，请稍后重试');
      } finally {
        setSubmitting(false);
      }
    },
    [activeTask],
  );

  // ─── 列表视图 ───
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground text-lg">正在加载任务...</p>
      </div>
    );
  }

  if (result && activeTask) {
    return (
      <ResultView
        result={result}
        task={activeTask}
        submission={lastSubmission}
        onRetry={() => {
          setResult(null);
        }}
        onBack={() => {
          setResult(null);
          setActiveTask(null);
          setLastSubmission(null);
        }}
      />
    );
  }

  if (activeTask) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <button
          onClick={() => setActiveTask(null)}
          className="text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 text-base transition-colors"
        >
          ← 返回任务列表
        </button>
        <TaskWorkspace
          task={activeTask}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold">实操任务</h1>
      <p className="text-muted-foreground mb-6 text-base">
        通过实操练习掌握人工智能训练师的核心技能。每个任务完成后会自动评分并记录。
      </p>
      <div className="space-y-3">
        {tasks.map(task => (
          <button
            key={task.id}
            onClick={() => {
              setActiveTask(task);
              setResult(null);
            }}
            className="hover:border-primary bg-card flex w-full items-center justify-between rounded-xl border p-5 text-left transition-all hover:shadow-sm"
          >
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-lg font-semibold">{task.title}</span>
                <DifficultyBadge level={task.difficulty} />
              </div>
              <p className="text-muted-foreground line-clamp-1 text-base">
                {task.instructions}
              </p>
            </div>
            {task.lastAttempt ? (
              <span
                className={`ml-4 shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  task.lastAttempt.passed
                    ? 'bg-success/10 text-success'
                    : 'bg-destructive/10 text-destructive'
                }`}
              >
                {task.lastAttempt.passed ? '✓ 已通过' : `上次 ${task.lastAttempt.score}分`}
              </span>
            ) : (
              <span className="text-primary ml-4 shrink-0 text-sm font-medium">开始 →</span>
            )}
          </button>
        ))}
        {tasks.length === 0 && (
          <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
            <p className="text-lg">暂无实操任务</p>
            <p className="mt-1 text-sm">请等待老师发布任务</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 辅助组件 ──────────────────────────────────────────────────

function DifficultyBadge({ level }: { level: number }) {
  const labels = ['', '简单', '中等', '较难'];
  const colors = [
    '',
    'bg-success/10 text-success',
    'bg-warning/10 text-warning',
    'bg-destructive/10 text-destructive',
  ];
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${colors[level] || colors[1]}`}>
      {labels[level] || '简单'}
    </span>
  );
}

function ResultView({
  result,
  task,
  submission,
  onRetry,
  onBack,
}: {
  result: SubmitResult;
  task: TaskItem;
  submission: unknown;
  onRetry: () => void;
  onBack: () => void;
}) {
  const showAnnotationFeedback =
    isAnnotationTaskType(task.taskType) && !!result.details && result.answerKey !== undefined;
  return (
    <div className={`mx-auto px-4 py-12 ${showAnnotationFeedback ? 'max-w-3xl' : 'max-w-lg'}`}>
      <div className="bg-card rounded-2xl border p-8 text-center">
        <div
          className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
            result.passed ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
          }`}
        >
          {result.passed ? '✓' : '!'}
        </div>
        <h2 className="mb-1 text-xl font-bold">
          {result.passed ? '做对了！' : '还需努力'}
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">任务：{task.title}</p>
        <div className="bg-muted mb-6 rounded-xl py-4">
          <span className="text-3xl font-bold">{Math.round(result.score)}</span>
          <span className="text-muted-foreground">分</span>
        </div>
        {result.feedback && (
          <div
            className={`mb-6 rounded-lg p-4 text-left text-sm ${
              result.passed ? 'bg-success/5 text-success' : 'bg-warning/5 text-warning'
            }`}
          >
            <p className="font-medium">反馈</p>
            <p className="mt-1">{result.feedback}</p>
          </div>
        )}
        {showAnnotationFeedback && (
          <div className="mb-6 text-left">
            <p className="mb-2 text-sm font-medium">哪里对、哪里偏——蓝色是你的标注，绿色虚线是标准答案</p>
            <AnnotationFeedback
              taskType={task.taskType}
              imageUrl={task.config?.imageUrl}
              submission={submission}
              answerKey={result.answerKey}
              details={result.details as Parameters<typeof AnnotationFeedback>[0]['details']}
            />
          </div>
        )}
        <div className="flex gap-3">
          <Button variant="outline" className="h-12 flex-1 rounded-xl text-base" onClick={onRetry}>
            再做一次
          </Button>
          <Button className="h-12 flex-1 rounded-xl text-base" onClick={onBack}>
            返回列表
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 任务工作区路由 ────────────────────────────────────────────

function TaskWorkspace({
  task,
  submitting,
  onSubmit,
}: {
  task: TaskItem;
  submitting: boolean;
  onSubmit: (submission: unknown) => void;
}) {
  const cfg = task.config;

  return (
    <div>
      <div className="bg-secondary/50 mb-4 rounded-xl p-4">
        <h2 className="mb-1 text-xl font-bold">{task.title}</h2>
        <p className="text-muted-foreground text-base">
          {cfg?.instructions || task.instructions}
        </p>
      </div>

      {task.taskType === 'excel_delete_rows' && (
        <ExcelDeleteRowsTask
          config={cfg}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      )}
      {task.taskType === 'stats_table' && (
        <StatsTableFillTask
          config={cfg}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      )}
      {task.taskType === 'file_classify' && (
        <FileClassificationTask
          config={cfg}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      )}
      {task.taskType === 'image_clean' && (
        <ImageCleaningTask
          config={cfg}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      )}
      {task.taskType === 'text_sentiment' && (
        <TextSentimentTask
          config={cfg}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      )}
      {task.taskType === 'audio_transcription' && (
        <AudioTranscriptionTask
          config={cfg}
          submitting={submitting}
          onSubmit={onSubmit}
        />
      )}
      {/* 标注类与通用题型统一走 ExamTaskInput(与考试端同一实现, 单一事实来源,
          避免练习页像素坐标组件缺属性支持导致 bbox 题永远扣分的旧 bug)。 */}
      {GENERIC_TASK_TYPES.includes(task.taskType) && (
        <GenericTaskWorkspace task={task} submitting={submitting} onSubmit={onSubmit} />
      )}
      {!SPECIAL_TASK_TYPES.includes(task.taskType) &&
        !GENERIC_TASK_TYPES.includes(task.taskType) && <GenericTaskPlaceholder title={task.title} />}
    </div>
  );
}

/** 有专属工作区组件的题型(历史实现, 工作正常, 不动)。 */
const SPECIAL_TASK_TYPES = [
  'excel_delete_rows',
  'stats_table',
  'file_classify',
  'image_clean',
  'text_sentiment',
  'audio_transcription',
];

/** 走通用 ExamTaskInput 工作区的题型: 4 种标注 + 3 种新题型。 */
const GENERIC_TASK_TYPES = [
  'image_annotation',
  'bounding_box',
  'point_annotation',
  'polyline_annotation',
  'polygon_annotation',
  'data_labeling',
  'dataset_quality',
  'composite_task',
  'excel_comprehensive',
];

/** 通用任务工作区: ExamTaskInput 受控输入 + 统一提交按钮。 */
function GenericTaskWorkspace({
  task,
  submitting,
  onSubmit,
}: {
  task: TaskItem;
  submitting: boolean;
  onSubmit: (submission: unknown) => void;
}) {
  const [value, setValue] = useState<unknown>(null);
  return (
    <div className="space-y-4">
      <ExamTaskInput
        content={{ taskType: task.taskType, config: task.config ?? {} }}
        value={value}
        onChange={setValue}
        disabled={submitting}
      />
      <Button
        size="lg"
        className="h-12 w-full rounded-xl text-lg"
        onClick={() => onSubmit(value)}
        disabled={submitting || value === null}
      >
        {submitting ? '提交中...' : '提交答案'}
      </Button>
    </div>
  );
}

// ─── 1. Excel 删行任务 ─────────────────────────────────────────

interface TaskProps {
  config: TaskConfig | null;
  submitting: boolean;
  onSubmit: (submission: unknown) => void;
}

function ExcelDeleteRowsTask({ config, submitting, onSubmit }: TaskProps) {
  // 统一走 ExamTaskInput 同款组件(Univer 内核), 练习与考试同构。
  // 显式提交: onChange 只更新本地状态,由提交按钮触发 onSubmit,防止初始化命令自动提交。
  const [answer, setAnswer] = useState<unknown>(null);
  return (
    <div className="space-y-4">
      <ExcelRows config={(config ?? {}) as Config} value={null} onChange={setAnswer} disabled={submitting} />
      <Button size="lg" className="w-full" disabled={submitting || answer == null} onClick={() => onSubmit(answer)}>
        {submitting ? '评分中…' : '提交答案'}
      </Button>
    </div>
  );
}

// ─── 2. 统计表填写任务 ────────────────────────────────────────

function StatsTableFillTask({ config, submitting, onSubmit }: TaskProps) {
  const [answer, setAnswer] = useState<unknown>(null);
  return (
    <div className="space-y-4">
      <StatsTable config={(config ?? {}) as Config} value={null} onChange={setAnswer} disabled={submitting} />
      <Button size="lg" className="w-full" disabled={submitting || answer == null} onClick={() => onSubmit(answer)}>
        {submitting ? '评分中…' : '提交答案'}
      </Button>
    </div>
  );
}

// ─── 3. 文件分类任务 ──────────────────────────────────────────

function FileClassificationTask({ config, submitting, onSubmit }: TaskProps) {
  // 统一走 FileSortBoard(拖拽归档), 显式提交
  const [answer, setAnswer] = useState<unknown>(null);
  return (
    <div className="space-y-4">
      <FileClassify config={(config ?? {}) as Config} value={null} onChange={setAnswer} disabled={submitting} />
      <Button size="lg" className="w-full" disabled={submitting || answer == null} onClick={() => onSubmit(answer)}>
        {submitting ? '评分中…' : '提交答案'}
      </Button>
    </div>
  );
}
function ImageCleaningTask({ config, submitting, onSubmit }: TaskProps) {
  const images = config?.images ?? [];
  const [decisions, setDecisions] = useState<Record<string, 'keep' | 'discard'>>({});

  const handleDecide = (imgId: string, decision: 'keep' | 'discard') => {
    setDecisions(prev => ({ ...prev, [imgId]: decision }));
  };

  const handleSubmit = () => {
    onSubmit({ decisions });
  };

  const allDecided = images.every(img => decisions[img.id]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {images.map(img => {
          const decision = decisions[img.id];
          return (
            <div
              key={img.id}
              className={`bg-card rounded-xl border p-4 transition-all ${
                decision === 'keep'
                  ? 'border-success'
                  : decision === 'discard'
                    ? 'border-destructive'
                    : ''
              }`}
            >
              <div className="mb-3 overflow-hidden rounded-lg border bg-muted">
                {img.url ? <img src={img.url} alt={img.description} className="max-h-96 w-full object-contain" /> : <div className="flex h-36 flex-col items-center justify-center gap-1 text-muted-foreground"><ImageIcon className="w-10 h-10" aria-hidden /><span className="text-sm">图片占位</span></div>}
              </div>
              <p className="mb-3 text-sm font-medium">{img.description}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDecide(img.id, 'keep')}
                  className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg py-2 text-base font-medium transition-colors ${
                    decision === 'keep'
                      ? 'bg-success text-success-foreground'
                      : 'bg-secondary hover:bg-secondary/70 text-secondary-foreground'
                  }`}
                >
                  ✓ 保留
                </button>
                <button
                  onClick={() => handleDecide(img.id, 'discard')}
                  className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg py-2 text-base font-medium transition-colors ${
                    decision === 'discard'
                      ? 'bg-destructive text-destructive-foreground'
                      : 'bg-secondary hover:bg-secondary/70 text-secondary-foreground'
                  }`}
                >
                  ✗ 丢弃
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <SubmitButton
        submitting={submitting}
        disabled={!allDecided}
        onClick={handleSubmit}
        label="提交评分"
      />
    </div>
  );
}

// ─── 5. 文本情感标注任务 ──────────────────────────────────────

function TextSentimentTask({ config, submitting, onSubmit }: TaskProps) {
  const texts = config?.texts ?? [];
  const labels = config?.labels ?? ['正面', '负面', '中性'];
  const [sentiments, setSentiments] = useState<Record<string, string>>({});

  const handleSelect = (textId: string, label: string) => {
    setSentiments(prev => ({ ...prev, [textId]: label }));
  };

  const handleSubmit = () => {
    onSubmit({ sentiments });
  };

  const allLabeled = texts.every(t => sentiments[t.id]);
  const labelColors: Record<string, string> = {
    '正面': 'bg-success text-success-foreground',
    '负面': 'bg-destructive text-destructive-foreground',
    '中性': 'bg-muted text-muted-foreground',
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {texts.map(t => (
          <div key={t.id} className="bg-card rounded-xl border p-4">
            <p className="mb-3 text-base">{t.content}</p>
            <div className="flex flex-wrap gap-2">
              {labels.map(label => {
                const selected = sentiments[t.id] === label;
                return (
                  <button
                    key={label}
                    onClick={() => handleSelect(t.id, label)}
                    className={`flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-base font-medium transition-colors ${
                      selected
                        ? labelColors[label] ?? 'bg-primary text-primary-foreground'
                        : 'bg-secondary hover:bg-secondary/70 text-secondary-foreground'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <SubmitButton
        submitting={submitting}
        disabled={!allLabeled}
        onClick={handleSubmit}
        label="提交评分"
      />
    </div>
  );
}


// ─── 7. 音频转写任务 ──────────────────────────────────────────

function AudioTranscriptionTask({ config, submitting, onSubmit }: TaskProps) {
  const audioUrl = config?.audioUrl ?? '';
  const [transcript, setTranscript] = useState('');

  const handleSubmit = () => {
    onSubmit({ transcript });
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border p-4">
        {audioUrl ? (
          <audio controls className="w-full">
            <source src={audioUrl} />
            您的浏览器不支持音频播放
          </audio>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="flex flex-col items-center gap-1 text-center">
              <Music className="w-10 h-10 text-muted-foreground" aria-hidden />
              <p className="text-muted-foreground text-sm">音频区域 - 请听音频并转写</p>
            </div>
          </div>
        )}
      </div>
      <div>
        <label className="mb-2 block text-base font-medium">请输入听到的文字：</label>
        <textarea
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          rows={5}
          className="bg-card focus:border-primary w-full rounded-xl border p-4 text-base outline-none transition-colors"
          placeholder="在此输入转写内容..."
          aria-label="转写文本输入"
        />
      </div>
      <SubmitButton
        submitting={submitting}
        disabled={!transcript.trim()}
        onClick={handleSubmit}
        label="提交评分"
      />
    </div>
  );
}

// ─── 占位组件 ─────────────────────────────────────────────────

function GenericTaskPlaceholder({ title }: { title: string }) {
  return (
    <div className="bg-card flex min-h-[300px] flex-col items-center justify-center rounded-xl border">
      <p className="text-muted-foreground text-lg">{title}</p>
      <p className="text-muted-foreground mt-2 text-sm">该任务类型暂未上线，敬请期待</p>
    </div>
  );
}

// ─── 共享提交按钮 ─────────────────────────────────────────────

function SubmitButton({
  submitting,
  disabled,
  onClick,
  label,
}: {
  submitting: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={submitting || disabled}
      className="h-12 w-full rounded-xl text-lg font-medium disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:cursor-not-allowed"
    >
      {submitting ? '评分中...' : label}
    </Button>
  );
}
