'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface TaskInfo {
  id: string;
  title: string;
  taskType: string;
  instructions: string;
  difficulty: number;
  practiceOnly: boolean;
  configPreview: { description: string; type: string };
  lastAttempt: { id: string; score: number; correct: boolean; createdAt: string } | null;
}

type Phase = 'list' | 'working' | 'result';

/* ------------------------------------------------------------------ */
/*  主页面                                                             */
/* ------------------------------------------------------------------ */
export default function TaskPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('list');
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTask, setCurrentTask] = useState<TaskInfo | null>(null);
  const [result, setResult] = useState<{ correct: boolean; score: number; feedback: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 获取任务列表
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch('/api/student/practice/task', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success) setTasks(data.data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  // 开始任务
  const startTask = useCallback((task: TaskInfo) => {
    setCurrentTask(task);
    setPhase('working');
    setResult(null);
  }, []);

  // 提交答案
  const submitAnswer = useCallback(async (submission: unknown, graderId: string) => {
    if (!currentTask) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/student/practice/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ taskId: currentTask.id, submission, graderId }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        setPhase('result');
      } else {
        alert(data.error || '提交失败');
      }
    } catch {
      alert('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  }, [currentTask]);

  // 返回列表
  const backToList = useCallback(() => {
    setPhase('list');
    setCurrentTask(null);
    setResult(null);
    // 刷新列表
    setLoading(true);
    (async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch('/api/student/practice/task', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success) setTasks(data.data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const taskTypeLabel: Record<string, string> = {
    excel_delete_rows: 'Excel删行',
    stats_table: '统计表填写',
    stats_table_fill: '统计表填写',
    file_classify: '文件分类',
    file_classification: '文件分类',
    image_clean: '图片清洗',
    image_cleaning: '图片清洗',
    image_annotate: '图片标注',
    image_annotation: '图片标注',
    text_sentiment: '文本情感',
    audio_transcription: '音频转写',
  };

  const difficultyLabel = (d: number) => d <= 1 ? '入门' : d <= 2 ? '基础' : d <= 3 ? '进阶' : '挑战';

  /* ---- 列表视图 ---- */
  if (phase === 'list') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push('/student/home')}
            className="text-[oklch(0.45_0.09_175)] hover:underline text-lg"
            aria-label="返回首页"
          >
            ← 返回
          </button>
          <h1 className="text-2xl font-bold">实操练习</h1>
        </div>

        {loading ? (
          <div className="text-center py-12 text-lg text-gray-500">加载中…</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg text-gray-500">暂无实操作业</p>
            <p className="text-sm text-gray-400 mt-2">请联系老师安排实操作业</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => startTask(t)}
                className="w-full text-left p-5 rounded-xl border-2 border-[oklch(0.90_0.02_95)] hover:border-[oklch(0.45_0.09_175)] bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-[oklch(0.45_0.09_175)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block px-2 py-0.5 rounded text-sm font-medium bg-[oklch(0.96_0.02_155)] text-[oklch(0.45_0.09_175)]">
                        {taskTypeLabel[t.taskType] || t.taskType}
                      </span>
                      <span className="text-sm text-gray-500">
                        {difficultyLabel(t.difficulty)}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold">{t.title}</h2>
                    {t.instructions && (
                      <p className="text-gray-600 mt-1 line-clamp-2">{t.instructions}</p>
                    )}
                  </div>
                  <div className="ml-4 flex-shrink-0 text-right">
                    {t.lastAttempt ? (
                      t.lastAttempt.correct ? (
                        <span className="text-[oklch(0.55_0.12_155)] font-bold text-lg">✓ 已通过</span>
                      ) : (
                        <span className="text-[oklch(0.55_0.15_25)] font-medium">得 {t.lastAttempt.score} 分</span>
                      )
                    ) : (
                      <span className="text-[oklch(0.68_0.15_60)] font-medium">开始练习</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ---- 工作区视图 ---- */
  if (phase === 'working' && currentTask) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={backToList}
            className="text-[oklch(0.45_0.09_175)] hover:underline text-lg"
            aria-label="返回列表"
          >
            ← 返回
          </button>
          <h1 className="text-xl font-bold">{currentTask.title}</h1>
        </div>

        {currentTask.instructions && (
          <div className="bg-[oklch(0.96_0.02_155)] border border-[oklch(0.88_0.04_155)] rounded-lg p-4 mb-4">
            <p className="text-lg font-medium">{currentTask.instructions}</p>
          </div>
        )}

        <TaskWorkspace
          taskType={currentTask.taskType}
          onSubmit={submitAnswer}
          submitting={submitting}
        />
      </div>
    );
  }

  /* ---- 结果视图 ---- */
  if (phase === 'result' && result) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        {result.correct ? (
          <>
            <div className="text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-[oklch(0.55_0.12_155)] mb-2">做对了！</h2>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">✗</div>
            <h2 className="text-2xl font-bold text-[oklch(0.55_0.15_25)] mb-2">还需努力</h2>
          </>
        )}
        <p className="text-lg mb-2">得分：{result.score} 分</p>
        {result.feedback && (
          <p className="text-gray-600 mb-6">{result.feedback}</p>
        )}
        <div className="flex gap-4 justify-center">
          <button
            onClick={backToList}
            className="px-6 py-3 rounded-lg border-2 border-[oklch(0.45_0.09_175)] text-[oklch(0.45_0.09_175)] font-bold text-lg hover:bg-[oklch(0.96_0.02_155)] transition-colors"
          >
            返回列表
          </button>
          {currentTask && !result.correct && (
            <button
              onClick={() => { setPhase('working'); setResult(null); }}
              className="px-6 py-3 rounded-lg bg-[oklch(0.45_0.09_175)] text-white font-bold text-lg hover:opacity-90 transition-opacity"
            >
              再试一次
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Task Workspace — 根据任务类型渲染不同交互界面                        */
/* ------------------------------------------------------------------ */
interface TaskWorkspaceProps {
  taskType: string;
  onSubmit: (submission: unknown, graderId: string) => Promise<void>;
  submitting: boolean;
}

function TaskWorkspace({ taskType, onSubmit, submitting }: TaskWorkspaceProps) {
  switch (taskType) {
    case 'excel_delete_rows':
      return <ExcelDeleteRowsTask onSubmit={onSubmit} submitting={submitting} />;
    case 'stats_table':
    case 'stats_table_fill':
      return <StatsTableFillTask onSubmit={onSubmit} submitting={submitting} />;
    case 'file_classify':
    case 'file_classification':
      return <FileClassificationTask onSubmit={onSubmit} submitting={submitting} />;
    case 'image_clean':
    case 'image_cleaning':
      return <ImageCleaningTask onSubmit={onSubmit} submitting={submitting} />;
    case 'text_sentiment':
      return <TextSentimentTask onSubmit={onSubmit} submitting={submitting} />;
    case 'image_annotate':
    case 'image_annotation':
      return <ImageAnnotationTask onSubmit={onSubmit} submitting={submitting} />;
    case 'audio_transcription':
      return <AudioTranscriptionTask onSubmit={onSubmit} submitting={submitting} />;
    default:
      return <GenericTaskPlaceholder taskType={taskType} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Excel 删行任务                                                     */
/* ------------------------------------------------------------------ */
interface ExcelDeleteRowsProps {
  onSubmit: (submission: unknown, graderId: string) => Promise<void>;
  submitting: boolean;
}

function ExcelDeleteRowsTask({ onSubmit, submitting }: ExcelDeleteRowsProps) {
  // 模拟数据：学员需要删除"不合格"的行
  const initialData = [
    { id: 1, name: '张三', age: '25', score: '85', status: '合格' },
    { id: 2, name: '李四', age: '-5', score: '72', status: '合格' },     // 异常：年龄为负
    { id: 3, name: '王五', age: '30', score: '-10', status: '合格' },    // 异常：分数为负
    { id: 4, name: '赵六', age: '28', score: '90', status: '合格' },
    { id: 5, name: '', age: '22', score: '65', status: '合格' },         // 异常：姓名为空
    { id: 6, name: '孙七', age: '35', score: '78', status: '不合格' },   // 异常：状态不合格
    { id: 7, name: '周八', age: '40', score: '95', status: '合格' },
    { id: 8, name: '吴九', age: 'abc', score: '88', status: '合格' },   // 异常：年龄非数字
  ];

  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const toggleRow = (id: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    onSubmit(
      { deletedRowIds: Array.from(selectedRows).sort() },
      'excel_delete_rows',
    );
  };

  return (
    <div>
      <p className="text-lg mb-3 text-gray-700">
        请选出数据中有问题的行，点击选中后提交。问题行包括：姓名为空、年龄异常（负数或非数字）、分数为负、状态为"不合格"的记录。
      </p>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 w-12">选择</th>
              <th className="px-4 py-3">序号</th>
              <th className="px-4 py-3">姓名</th>
              <th className="px-4 py-3">年龄</th>
              <th className="px-4 py-3">分数</th>
              <th className="px-4 py-3">状态</th>
            </tr>
          </thead>
          <tbody>
            {initialData.map((row, i) => (
              <tr
                key={row.id}
                className={`border-t cursor-pointer transition-colors ${
                  selectedRows.has(row.id)
                    ? 'bg-red-50 hover:bg-red-100'
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => toggleRow(row.id)}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedRows.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    className="w-5 h-5 accent-[oklch(0.55_0.15_25)]"
                    aria-label={`选择第${i + 1}行`}
                  />
                </td>
                <td className="px-4 py-3">{row.id}</td>
                <td className="px-4 py-3">{row.name || <span className="text-red-500 italic">（空）</span>}</td>
                <td className="px-4 py-3">{row.age}</td>
                <td className="px-4 py-3">{row.score}</td>
                <td className="px-4 py-3">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <span className="text-lg">已选择 {selectedRows.size} 行</span>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-8 py-3 rounded-lg bg-[oklch(0.45_0.09_175)] text-white font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? '提交中…' : '提交答案'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  统计表填写任务                                                      */
/* ------------------------------------------------------------------ */
interface StatsTableFillProps {
  onSubmit: (submission: unknown, graderId: string) => Promise<void>;
  submitting: boolean;
}

function StatsTableFillTask({ onSubmit, submitting }: StatsTableFillProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  const fields = [
    { key: 'total_records', label: '数据总条数' },
    { key: 'valid_records', label: '有效数据条数' },
    { key: 'avg_score', label: '平均分数' },
    { key: 'max_score', label: '最高分' },
    { key: 'min_score', label: '最低分' },
  ];

  const handleChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const handleSubmit = () => {
    const numericValues: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      numericValues[k] = Number(v);
    }
    onSubmit({ values: numericValues }, 'stats_table_fill');
  };

  return (
    <div>
      <p className="text-lg mb-3 text-gray-700">
        根据给定的数据集，请填写以下统计指标。所有数值请填写整数或小数。
      </p>

      <div className="bg-white border rounded-lg divide-y">
        {fields.map(f => (
          <div key={f.key} className="flex items-center px-4 py-3">
            <label className="flex-1 text-lg" htmlFor={f.key}>{f.label}</label>
            <input
              id={f.key}
              type="text"
              inputMode="decimal"
              className="w-40 px-3 py-2 border rounded-lg text-lg text-right focus:outline-none focus:ring-2 focus:ring-[oklch(0.45_0.09_175)]"
              placeholder="请输入"
              value={values[f.key] || ''}
              onChange={e => handleChange(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-8 py-3 rounded-lg bg-[oklch(0.45_0.09_175)] text-white font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? '提交中…' : '提交答案'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  文件分类任务                                                        */
/* ------------------------------------------------------------------ */
interface FileClassificationProps {
  onSubmit: (submission: unknown, graderId: string) => Promise<void>;
  submitting: boolean;
}

function FileClassificationTask({ onSubmit, submitting }: FileClassificationProps) {
  const files = [
    { id: 'f1', name: 'report.docx', type: '文档' },
    { id: 'f2', name: 'photo.jpg', type: '图片' },
    { id: 'f3', name: 'data.xlsx', type: '表格' },
    { id: 'f4', name: 'video.mp4', type: '视频' },
    { id: 'f5', name: 'notes.txt', type: '文档' },
    { id: 'f6', name: 'screenshot.png', type: '图片' },
    { id: 'f7', name: 'backup.csv', type: '表格' },
    { id: 'f8', name: 'music.mp3', type: '音频' },
  ];

  const categories = ['文档', '图片', '表格', '视频', '音频'];

  const [classification, setClassification] = useState<Record<string, string>>({});

  const handleClassify = (fileId: string, category: string) => {
    setClassification(prev => ({ ...prev, [fileId]: category }));
  };

  const handleSubmit = () => {
    onSubmit({ classification }, 'file_classification');
  };

  const classified = Object.keys(classification).length;

  return (
    <div>
      <p className="text-lg mb-3 text-gray-700">
        请将以下文件分到正确的类别中。每个文件选择一个类别。
      </p>

      <div className="space-y-3">
        {files.map(f => (
          <div key={f.id} className="flex items-center gap-4 p-3 border rounded-lg bg-white">
            <span className="text-lg font-medium w-48">{f.name}</span>
            <div className="flex gap-2 flex-wrap">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => handleClassify(f.id, cat)}
                  className={`px-3 py-1.5 rounded-lg text-base font-medium transition-colors ${
                    classification[f.id] === cat
                      ? 'bg-[oklch(0.45_0.09_175)] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <span className="text-lg">已分类 {classified}/{files.length} 个文件</span>
        <button
          onClick={handleSubmit}
          disabled={submitting || classified < files.length}
          className="px-8 py-3 rounded-lg bg-[oklch(0.45_0.09_175)] text-white font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? '提交中…' : '提交答案'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  图片清洗任务                                                        */
/* ------------------------------------------------------------------ */
interface ImageCleaningProps {
  onSubmit: (submission: unknown, graderId: string) => Promise<void>;
  submitting: boolean;
}

function ImageCleaningTask({ onSubmit, submitting }: ImageCleaningProps) {
  const images = [
    { id: 'img1', label: '图片1：猫', quality: 'good' as const },
    { id: 'img2', label: '图片2：模糊狗', quality: 'blurry' as const },
    { id: 'img3', label: '图片3：鸟', quality: 'good' as const },
    { id: 'img4', label: '图片4：过曝花', quality: 'overexposed' as const },
    { id: 'img5', label: '图片5：鱼', quality: 'good' as const },
    { id: 'img6', label: '图片6：全黑', quality: 'blank' as const },
  ];

  const [decisions, setDecisions] = useState<Record<string, string>>({});

  const handleDecision = (imgId: string, decision: string) => {
    setDecisions(prev => ({ ...prev, [imgId]: decision }));
  };

  const handleSubmit = () => {
    onSubmit({ decisions }, 'image_cleaning');
  };

  const decided = Object.keys(decisions).length;

  return (
    <div>
      <p className="text-lg mb-3 text-gray-700">
        检查每张图片，判断是否可以保留。模糊、过曝、全黑等质量不合格的图片应标记为"丢弃"。
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {images.map(img => (
          <div key={img.id} className="border rounded-lg p-4 bg-white">
            <div className="h-32 bg-gray-100 rounded mb-3 flex items-center justify-center text-gray-500 text-sm">
              {img.label}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleDecision(img.id, 'keep')}
                className={`flex-1 py-2 rounded-lg font-medium text-base transition-colors ${
                  decisions[img.id] === 'keep'
                    ? 'bg-[oklch(0.55_0.12_155)] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ✓ 保留
              </button>
              <button
                onClick={() => handleDecision(img.id, 'discard')}
                className={`flex-1 py-2 rounded-lg font-medium text-base transition-colors ${
                  decisions[img.id] === 'discard'
                    ? 'bg-[oklch(0.55_0.15_25)] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ✗ 丢弃
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-4">
        <span className="text-lg">已判断 {decided}/{images.length} 张</span>
        <button
          onClick={handleSubmit}
          disabled={submitting || decided < images.length}
          className="px-8 py-3 rounded-lg bg-[oklch(0.45_0.09_175)] text-white font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? '提交中…' : '提交答案'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  文本情感标注任务                                                      */
/* ------------------------------------------------------------------ */
interface TextSentimentProps {
  onSubmit: (submission: unknown, graderId: string) => Promise<void>;
  submitting: boolean;
}

function TextSentimentTask({ onSubmit, submitting }: TextSentimentProps) {
  const samples = [
    { text: '今天天气真好，阳光明媚，心情很愉快！', sentiment: 'positive' },
    { text: '这个产品质量太差了，完全不推荐购买。', sentiment: 'negative' },
    { text: '我去超市买了一瓶水。', sentiment: 'neutral' },
    { text: '服务态度很好，下次还会再来。', sentiment: 'positive' },
    { text: '等了一个小时才送到，太让人失望了。', sentiment: 'negative' },
  ];

  const [answers, setAnswers] = useState<Record<number, string>>({});

  const handleSubmit = () => {
    onSubmit(
      {
        answers: samples.map((s, i) => ({ text: s.text, userLabel: answers[i] || '' })),
      },
      'text_sentiment',
    );
  };

  const allAnswered = samples.every((_, i) => answers[i]);

  return (
    <div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
        <h3 className="text-lg font-bold text-green-800 mb-1">文本情感标注</h3>
        <p className="text-base text-green-700">请阅读每条文本，判断其情感倾向：正面、负面 或 中性。</p>
      </div>
      <div className="space-y-4">
        {samples.map((s, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-4 bg-white">
            <p className="text-lg mb-3">{s.text}</p>
            <div className="flex gap-3">
              {[
                { value: 'positive', label: '正面', icon: '😊', color: 'bg-green-100 border-green-500' },
                { value: 'negative', label: '负面', icon: '😞', color: 'bg-red-100 border-red-500' },
                { value: 'neutral', label: '中性', icon: '😐', color: 'bg-gray-100 border-gray-500' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAnswers((prev) => ({ ...prev, [i]: opt.value }))}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 text-base font-medium transition-all ${
                    answers[i] === opt.value
                      ? `${opt.color} border-2 shadow-md`
                      : 'bg-white border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <span className="text-2xl mr-2">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={handleSubmit}
        disabled={!allAnswered || submitting}
        className="w-full mt-4 py-4 bg-green-600 text-white text-lg font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? '提交中...' : '提交答案'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  图片标注任务                                                          */
/* ------------------------------------------------------------------ */
interface ImageAnnotationProps {
  onSubmit: (submission: unknown, graderId: string) => Promise<void>;
  submitting: boolean;
}

function ImageAnnotationTask({ onSubmit, submitting }: ImageAnnotationProps) {
  const regions = [
    { id: 1, label: '人物', x: 20, y: 10, w: 40, h: 60 },
    { id: 2, label: '背景', x: 50, y: 50, w: 40, h: 40 },
  ];

  const handleSubmit = () => {
    onSubmit({ regions }, 'image_annotation');
  };

  return (
    <div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
        <h3 className="text-lg font-bold text-green-800 mb-1">图片标注</h3>
        <p className="text-base text-green-700">在图片中框选目标物体，并为其分配标签。下方已预置示例标注区域供参考。</p>
      </div>
      <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-gray-50 mb-4">
        <div
          className="relative w-full"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)',
            backgroundSize: '20px 20px',
            height: '400px',
          }}
        >
          {regions.map((r) => (
            <div
              key={r.id}
              className="absolute border-2 border-blue-500 bg-blue-200/30 flex items-start justify-between p-1"
              style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
            >
              <span className="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded">{r.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-800">
          已标注 <strong>{regions.length}</strong> 个区域。每个区域包含标签和位置坐标(x, y, w, h)。
        </p>
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full mt-4 py-4 bg-green-600 text-white text-lg font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? '提交中...' : '提交答案'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  音频转写任务                                                          */
/* ------------------------------------------------------------------ */
interface AudioTranscriptionProps {
  onSubmit: (submission: unknown, graderId: string) => Promise<void>;
  submitting: boolean;
}

function AudioTranscriptionTask({ onSubmit, submitting }: AudioTranscriptionProps) {
  const [transcript, setTranscript] = useState('');

  const phrases = ['欢迎使用人工智能训练师练习系统', '请按照提示完成数据标注任务'];

  const handleSubmit = () => {
    onSubmit({ transcript, expectedPhrases: phrases }, 'audio_transcription');
  };

  return (
    <div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
        <h3 className="text-lg font-bold text-green-800 mb-1">音频转写</h3>
        <p className="text-base text-green-700">请点击播放按钮听取音频，将听到的内容逐字转写到下方输入框中。</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-4">
        <div className="flex items-center gap-4 mb-4">
          <button
            className="w-14 h-14 rounded-full bg-green-600 text-white text-2xl flex items-center justify-center hover:bg-green-700"
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                const u = new SpeechSynthesisUtterance(phrases.join('。'));
                u.lang = 'zh-CN';
                u.rate = 0.8;
                window.speechSynthesis.speak(u);
              }
            }}
          >
            {'\u25B6'}
          </button>
          <div className="flex-1">
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-green-500 rounded-full"></div>
            </div>
            <p className="text-sm text-gray-500 mt-1">音频时长: 约 5 秒</p>
          </div>
        </div>
        <textarea
          className="w-full border border-gray-300 rounded-lg p-3 text-lg min-h-[120px] focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="在这里输入听到的文字..."
          value={transcript}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTranscript(e.target.value)}
        />
      </div>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-yellow-800">提示：可以反复点击播放按钮。转写时注意标点符号和准确用词。</p>
      </div>
      <button
        onClick={handleSubmit}
        disabled={transcript.trim().length === 0 || submitting}
        className="w-full mt-4 py-4 bg-green-600 text-white text-lg font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? '提交中...' : '提交答案'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  通用占位符                                                          */
/* ------------------------------------------------------------------ */
function GenericTaskPlaceholder({ taskType }: { taskType: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-xl text-gray-500">
        {taskType} 任务类型的工作区正在开发中
      </p>
      <p className="text-sm text-gray-400 mt-2">敬请期待</p>
    </div>
  );
}
