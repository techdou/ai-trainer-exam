'use client';

/**
 * AI 实训课堂: 三门由易到难的分步实训课(情感分类 → 意图分派 → 内容审核),
 * 核心是"标注 → 训练 → 观察结果 → 改标注 → 再训练"的反馈闭环,
 * 让零基础学员亲手体会"训练数据质量决定模型效果"(AI 训练师职业的核心)。
 * 模型为纯前端朴素贝叶斯(见 model.ts), 不依赖后端。
 * 课程定义见 courses.ts; 进度存 localStorage, 关掉页面不丢。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft, BookOpen, Pencil, Rocket, LineChart, Lightbulb, CheckCircle2,
  RotateCcw, Lock, ChevronLeft, ChevronRight, Play,
} from 'lucide-react';
import { LAB_COURSES, LAB_STORAGE_KEY, type LabelTone } from './courses';
import { trainNaiveBayes, predict, confidence } from './model';

interface CourseState {
  step: number;
  labels: Record<number, number>;
  completed: boolean;
  bestAccuracy?: number;
}

interface LabState {
  currentCourse: string | null;
  courses: Record<string, CourseState>;
}

const STEPS = [
  { title: '认识任务', icon: BookOpen },
  { title: '动手标注', icon: Pencil },
  { title: '训练模型', icon: Rocket },
  { title: '看结果', icon: LineChart },
  { title: '总结', icon: Lightbulb },
];

/** 标签色调 → 具体样式(全部字面量, 供 Tailwind 扫描) */
const TONE: Record<LabelTone, { btn: string; idle: string; chip: string; dot: string }> = {
  success: {
    btn: 'border-success bg-success/10 text-success',
    idle: 'border-border hover:border-success/40',
    chip: 'bg-success/15 text-success',
    dot: 'bg-success',
  },
  destructive: {
    btn: 'border-destructive bg-destructive/10 text-destructive',
    idle: 'border-border hover:border-destructive/40',
    chip: 'bg-destructive/15 text-destructive',
    dot: 'bg-destructive',
  },
  warning: {
    btn: 'border-warning bg-warning/10 text-warning-foreground',
    idle: 'border-border hover:border-warning/40',
    chip: 'bg-warning/15 text-warning-foreground',
    dot: 'bg-warning',
  },
  accent: {
    btn: 'border-accent bg-accent/10 text-accent',
    idle: 'border-border hover:border-accent/40',
    chip: 'bg-accent/15 text-accent',
    dot: 'bg-accent',
  },
  primary: {
    btn: 'border-primary bg-primary/10 text-primary',
    idle: 'border-border hover:border-primary/40',
    chip: 'bg-primary/15 text-primary',
    dot: 'bg-primary',
  },
};

/** 渲染课程文案里的 **加粗** 标记 */
function renderBold(text: string) {
  return text.split('**').map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

export default function LabPage() {
  const [state, setState] = useState<LabState>({ currentCourse: null, courses: {} });
  const [loaded, setLoaded] = useState(false);
  const [cursor, setCursor] = useState(0);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LabState;
        // 结构守卫: 形状不对(手动改动/未来版本)直接丢弃, 避免渲染崩溃
        if (parsed && typeof parsed === 'object' && typeof parsed.courses === 'object' && parsed.courses !== null) {
          setState({ currentCourse: typeof parsed.currentCourse === 'string' ? parsed.currentCourse : null, courses: parsed.courses });
        }
      }
    } catch { /* 损坏的本地数据直接重置 */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(state));
    } catch { /* 隐私模式/配额满时放弃持久化, 不影响本页进度 */ }
  }, [state, loaded]);

  const course = LAB_COURSES.find(c => c.id === state.currentCourse) ?? null;
  const courseState = course ? (state.courses[course.id] ?? { step: 1, labels: {}, completed: false }) : null;

  const patchCourse = (patch: Partial<CourseState>) => {
    if (!course) return;
    setState(prev => ({
      ...prev,
      courses: { ...prev.courses, [course.id]: { ...(prev.courses[course.id] ?? { step: 1, labels: {}, completed: false }), ...patch } },
    }));
  };

  const openCourse = (id: string) => {
    setCursor(0);
    setState(prev => ({ ...prev, currentCourse: id }));
  };

  const goto = (step: number) => patchCourse({ step });

  // 一旦通过过某课(completed 或留有最佳成绩记录)就永久解锁, 重修不再反锁后续课
  const isUnlocked = (index: number) =>
    index === 0 || (() => {
      const prev = state.courses[LAB_COURSES[index - 1].id];
      return Boolean(prev?.completed || prev?.bestAccuracy !== undefined);
    })();
  const finishedCount = LAB_COURSES.filter(c => state.courses[c.id]?.completed).length;

  /* ---------- 课程内通用数据 ---------- */
  const labeledCount = courseState ? Object.keys(courseState.labels).length : 0;
  const labelKeys = course ? course.labels.map(l => l.key) : [];
  const trainingData = useMemo(
    () => (course && courseState
      ? course.samples.filter(s => courseState.labels[s.id] !== undefined)
        .map(s => ({ text: s.text, label: labelKeys[courseState.labels[s.id]] }))
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [course, courseState?.labels],
  );
  const results = useMemo(() => {
    if (!course || !trainingData.length) return [];
    const model = trainNaiveBayes(trainingData, labelKeys);
    return course.tests.map(t => ({
      ...t,
      prediction: predict(model, labelKeys, t.text),
      confidence: confidence(model, labelKeys, t.text),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingData]);
  const accuracy = results.length ? results.filter(r => r.prediction === r.truth).length / results.length : 0;
  const model = useMemo(
    () => (course && trainingData.length ? trainNaiveBayes(trainingData, labelKeys) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trainingData],
  );

  // 首次算出结果时记录该课历史最佳准确率
  useEffect(() => {
    if (course && courseState && results.length && courseState.step === 4) {
      const pct = Math.round(accuracy * 100);
      if (courseState.bestAccuracy === undefined || pct > courseState.bestAccuracy) patchCourse({ bestAccuracy: pct });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.length, accuracy]);

  // 进入标注步骤时, 定位到第一个未标注的样本
  useEffect(() => {
    if (!course || !courseState || courseState.step !== 2) return;
    const first = course.samples.findIndex(s => courseState.labels[s.id] === undefined);
    setCursor(first === -1 ? 0 : first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id, courseState?.step]);

  if (!loaded) return <div className="py-16 text-center text-lg text-muted-foreground">加载中…</div>;

  /* ---------- 课程大厅 ---------- */
  if (!course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 text-3xl font-bold">AI 实训课堂</h1>
        <p className="mb-2 text-base text-muted-foreground">
          亲手训练 AI 模型，体会「训练数据的质量决定模型的好坏」
        </p>
        <p className="mb-6 text-sm text-muted-foreground">已完成 {finishedCount} / {LAB_COURSES.length} 门 · 完成上一门自动解锁下一门</p>

        <div className="space-y-4">
          {LAB_COURSES.map((c, i) => {
            const cs = state.courses[c.id];
            const unlocked = isUnlocked(i);
            const labeled = cs ? Object.keys(cs.labels).length : 0;
            const inProgress = Boolean(cs) && !cs?.completed && labeled > 0;
            return (
              <div key={c.id}>
                <button
                  onClick={() => unlocked && openCourse(c.id)}
                  disabled={!unlocked}
                  className={`flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition-colors ${
                    unlocked ? 'border-border bg-card hover:border-primary/40' : 'border-border bg-muted/40 opacity-70'
                  }`}
                >
                  <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-3xl ${unlocked ? 'bg-primary/10' : 'bg-muted grayscale'}`} aria-hidden>
                    {c.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold">第 {i + 1} 课 · {c.title}</span>
                      <span className={`rounded px-2 py-0.5 text-sm font-medium ${
                        c.difficulty === '入门' ? 'bg-success/15 text-success'
                          : c.difficulty === '进阶' ? 'bg-warning/15 text-warning-foreground'
                            : 'bg-destructive/15 text-destructive'
                      }`}>{c.difficulty}</span>
                      {cs?.completed && <span className="text-sm font-medium text-success">✓ 已完成 · 最佳 {cs.bestAccuracy ?? '—'} 分</span>}
                      {!cs?.completed && inProgress && <span className="text-sm text-muted-foreground">进行中 {labeled}/{c.samples.length} 条</span>}
                    </span>
                    <span className="mt-1 block text-base text-muted-foreground">{c.scene}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {c.labels.map(l => (
                        <span key={l.key} className={`rounded px-2 py-0.5 text-sm ${TONE[l.tone].chip}`}>{l.name}</span>
                      ))}
                      <span className="rounded bg-muted px-2 py-0.5 text-sm text-muted-foreground">{c.samples.length} 条标注</span>
                    </span>
                    {!unlocked && (
                      <span className="mt-2 flex items-center gap-1 text-sm">
                        <Lock className="h-3.5 w-3.5" aria-hidden /> 完成「{LAB_COURSES[i - 1].title}」后解锁
                      </span>
                    )}
                  </span>
                  {unlocked && (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden>
                      {cs?.completed ? <RotateCcw className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ---------- 课程内 ---------- */
  if (!courseState) return null;
  const currentSample = course.samples[cursor];
  const chosenLabel = courseState.labels[currentSample.id];
  const allLabeled = labeledCount >= course.samples.length;

  const chooseLabel = (labelIndex: number) => {
    const isNew = courseState.labels[currentSample.id] === undefined;
    setState(prev => {
      const cs = prev.courses[course.id] ?? { step: 2, labels: {}, completed: false };
      return { ...prev, courses: { ...prev.courses, [course.id]: { ...cs, labels: { ...cs.labels, [currentSample.id]: labelIndex } } } };
    });
    // 新标注自动跳到下一条(修改旧标注则留在原地, 方便对比); 先取消在途跳转, 避免手动导航被叠加
    if (jumpTimer.current) clearTimeout(jumpTimer.current);
    if (isNew && cursor < course.samples.length - 1) {
      jumpTimer.current = setTimeout(() => setCursor(c => Math.min(c + 1, course.samples.length - 1)), 250);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <button
        onClick={() => setState(prev => ({ ...prev, currentCourse: null }))}
        className="mb-3 flex items-center gap-1 text-base text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> 返回课程列表
      </button>
      <h1 className="mb-1 text-2xl font-bold">{course.emoji} {course.title}</h1>

      {/* 步骤进度条: 完成打勾, 当前高亮 */}
      <div className="mb-6 mt-4 flex items-center justify-between gap-1">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < courseState.step || (n === 5 && courseState.completed);
          const active = n === courseState.step;
          const Icon = s.icon;
          return (
            <button
              key={n}
              onClick={() => n <= courseState.step && goto(n)}
              disabled={n > courseState.step}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-sm transition-colors ${
                active ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="flex items-center gap-1">
                {done && <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />}
                {!active && !done && <Lock className="h-3.5 w-3.5" aria-hidden />}
                {n}. {s.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* 步骤 1: 认识任务 */}
      {courseState.step === 1 && (
        <Card><CardContent className="space-y-4 py-6">
          <h2 className="text-xl font-bold">AI 是怎么「学会」干活的？</h2>
          {course.intro.map((para, i) => (
            <p key={i} className="text-lg leading-relaxed">{renderBold(para)}</p>
          ))}
          <div className="rounded-lg border bg-secondary/30 p-4">
            <p className="mb-2 font-medium">你要打的标签</p>
            <div className="space-y-2">
              {course.labels.map(l => (
                <p key={l.key} className="flex items-center gap-2 text-lg">
                  <span className={`rounded px-2 py-0.5 font-medium ${TONE[l.tone].chip}`}>{l.name}</span>
                  <span className="text-base text-muted-foreground">{l.desc}</span>
                </p>
              ))}
            </div>
          </div>
          <p className="text-base text-muted-foreground">💡 标得越准，模型的判断就越准。标错了，模型也会跟着学错——这就是本课堂要你体会的核心。</p>
          <Button size="lg" className="w-full text-lg" onClick={() => goto(2)}>开始标注 →</Button>
        </CardContent></Card>
      )}

      {/* 步骤 2: 动手标注(逐条聚焦) */}
      {courseState.step === 2 && (
        <div className="space-y-3">
          <div className="sticky top-20 z-10 rounded-lg border bg-background/95 px-4 py-3 backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-base">第 <strong className="text-primary">{cursor + 1}</strong> / {course.samples.length} 条</span>
              <span className="text-sm text-muted-foreground">已标 {labeledCount} 条{allLabeled ? ' · 全部完成' : ''}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(labeledCount / course.samples.length) * 100}%` }} />
            </div>
          </div>

          <Card><CardContent className="space-y-3 py-5">
            <p className="text-lg leading-relaxed">{currentSample.text}</p>
            <p className="text-sm text-muted-foreground">💡 {currentSample.hint}</p>
            <div className={`flex gap-3 ${course.labels.length === 3 ? 'flex-col' : ''}`}>
              {course.labels.map((l, idx) => {
                const chosen = chosenLabel === idx;
                return (
                  <button
                    key={l.key}
                    onClick={() => chooseLabel(idx)}
                    className={`flex-1 rounded-lg border-2 px-3 py-3 text-base font-medium transition-colors ${
                      chosen ? TONE[l.tone].btn : TONE[l.tone].idle
                    }`}
                  >
                    {chosen ? '✓ ' : ''}{l.name}
                  </button>
                );
              })}
            </div>
          </CardContent></Card>

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline" size="lg"
              disabled={cursor === 0}
              onClick={() => setCursor(c => Math.max(c - 1, 0))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden /> 上一条
            </Button>
            {cursor < course.samples.length - 1 && (
              <Button variant="outline" size="lg" onClick={() => setCursor(c => Math.min(c + 1, course.samples.length - 1))}>
                下一条 <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>

          <Button
            size="lg" className="w-full text-lg"
            disabled={!allLabeled}
            onClick={() => goto(3)}
          >
            {allLabeled ? '标完了，去训练 →' : `还差 ${course.samples.length - labeledCount} 条没标（逐条标完会自动跳到下一条）`}
          </Button>
        </div>
      )}

      {/* 步骤 3: 训练模型 */}
      {courseState.step === 3 && (
        <Card><CardContent className="space-y-4 py-6 text-center">
          <Rocket className="mx-auto h-14 w-14 text-primary" aria-hidden />
          <h2 className="text-xl font-bold">训练完成！</h2>
          <p className="text-lg leading-relaxed">
            模型从你的 {trainingData.length} 条标注里，统计出了每类内容的用词规律：
          </p>
          {model && (
            <div className="space-y-2 text-left">
              {course.labels.map(l => (
                <div key={l.key} className="rounded-lg border p-3">
                  <p className="mb-2 flex items-center gap-2 font-medium">
                    <span className={`h-2.5 w-2.5 rounded-full ${TONE[l.tone].dot}`} aria-hidden /> 「{l.name}」类最常出现的词组
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {model.topTokens[l.key].map(t => (
                      <span key={t.token} className={`rounded px-2 py-0.5 text-sm ${TONE[l.tone].chip}`}>
                        {t.token} <span className="opacity-70">×{t.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-lg border bg-secondary/30 p-4 text-left">
            <p className="mb-2 font-medium">模型是怎么学的（朴素贝叶斯）</p>
            <p className="text-base leading-relaxed text-muted-foreground">
              它把每条内容切成两字一组（比如「质量很好」切成「质量/量很/很好」），
              统计每个词组在每一类里出现的次数。遇到新内容时，
              哪一类的词组出现得更多，就判成哪一类。这是最经典的文本分类方法之一。
            </p>
          </div>
          <p className="text-base text-muted-foreground">现在看看它学得怎么样——用 {course.tests.length} 条它没见过的内容考考它。</p>
          <Button size="lg" className="w-full text-lg" onClick={() => goto(4)}>开始测试 →</Button>
        </CardContent></Card>
      )}

      {/* 步骤 4: 看结果(反馈闭环的关键) */}
      {courseState.step === 4 && (
        <div className="space-y-4">
          <Card><CardContent className="py-6 text-center">
            <div className="text-5xl font-bold text-primary">{Math.round(accuracy * 100)}%</div>
            <p className="mt-2 text-base text-muted-foreground">
              测试准确率：{results.filter(r => r.prediction === r.truth).length} / {results.length} 条判断正确
            </p>
            {accuracy === 1 ? (
              <p className="mt-2 font-medium text-success">✓ 满分！你的标注质量非常高，模型学到了准确的规律。</p>
            ) : (
              <p className="mt-2 font-medium text-warning">⚠ 有判断错的——原因见下方分析。</p>
            )}
          </CardContent></Card>

          {results.map(r => {
            const correct = r.prediction === r.truth;
            const predName = course.labels.find(l => l.key === r.prediction)?.name ?? r.prediction;
            const truthName = course.labels.find(l => l.key === r.truth)?.name ?? r.truth;
            return (
              <div key={r.id} className={`rounded-lg border-l-4 bg-card border p-4 ${correct ? 'border-l-success' : 'border-l-destructive'}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base leading-relaxed">{r.text}</p>
                  <span className={`shrink-0 rounded px-2 py-1 text-sm font-medium ${correct ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                    {correct ? '✓ 判对了' : '✗ 判错了'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  模型判断：<strong>{predName}</strong>（{Math.round(r.confidence * 100)}% 确定）
                  {!correct && <> · 正确答案：<strong>{truthName}</strong></>}
                </p>
              </div>
            );
          })}

          {accuracy < 1 && (
            <div className="rounded-xl border-2 border-dashed border-warning/50 bg-warning/5 p-4">
              <p className="mb-1 font-medium text-warning-foreground">🔁 模型为什么会错？两种可能：</p>
              <ol className="list-decimal space-y-1 pl-5 text-base leading-relaxed">
                <li>某几条训练数据标错了——模型跟着学错。回去检查标注，改正后重新训练。</li>
                <li>{course.improveHint}</li>
              </ol>
              <Button variant="outline" className="mt-3" onClick={() => goto(2)}>
                <RotateCcw className="mr-1 h-4 w-4" aria-hidden /> 回去改标注
              </Button>
            </div>
          )}
          <Button size="lg" className="w-full text-lg" onClick={() => { patchCourse({ step: 5, completed: true, bestAccuracy: Math.max(courseState.bestAccuracy ?? 0, Math.round(accuracy * 100)) }); }}>
            我体会到了，去总结 →
          </Button>
        </div>
      )}

      {/* 步骤 5: 总结 */}
      {courseState.step === 5 && (
        <Card><CardContent className="space-y-4 py-6">
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden />
            <h2 className="mt-2 text-xl font-bold">第 {LAB_COURSES.findIndex(c => c.id === course.id) + 1} 课完成！</h2>
            {courseState.bestAccuracy !== undefined && (
              <p className="mt-1 text-base text-muted-foreground">本课最佳测试准确率：{courseState.bestAccuracy} 分</p>
            )}
          </div>
          <div className="space-y-3">
            {course.summary.map((line, i) => (
              <p key={i} className="flex items-start gap-2 text-lg leading-relaxed">
                <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-success" aria-hidden />{line}
              </p>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 text-base" onClick={() => goto(4)}>再看一次结果</Button>
            <Button
              variant="outline" className="flex-1 text-base"
              onClick={() => { patchCourse({ step: 1, labels: {}, completed: false }); setCursor(0); }}
            >
              重新上这一课
            </Button>
          </div>
          <Button size="lg" className="w-full text-lg" onClick={() => setState(prev => ({ ...prev, currentCourse: null }))}>
            {finishedCount >= LAB_COURSES.length ? '完成全部课程，返回课程列表 →' : '返回课程列表 →'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {finishedCount >= LAB_COURSES.length
              ? '三门实训全部完成——你已经体验了 AI 训练师从标注到调优的完整工作循环。'
              : `完成全部 ${LAB_COURSES.length} 门课程，解锁更多实训类型（当前 ${finishedCount}/${LAB_COURSES.length}）。`}
          </p>
        </CardContent></Card>
      )}
    </div>
  );
}
