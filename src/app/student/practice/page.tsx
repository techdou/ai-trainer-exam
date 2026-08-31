'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { apiFetch } from '@/lib/session-client';
import { DialogueView } from '@/components/dialogue-bubble';
import { toast } from 'sonner';

interface PracticeQuestion {
  id: string;
  question_type: string;
  stem: string;
  options: Record<string, unknown>;
  difficulty: string;
  knowledge_point: string;
}

interface CheckResult {
  correct: boolean;
  correctAnswer: string;
  feedback?: string;
  explanation: string | null;
  knowledgePoint: string | null;
}

export default function TheoryPracticePage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<PracticeQuestion[]>('/api/student/practice/questions?limit=10');
      if (r.ok && r.data) {
        setQuestions(r.data);
        setCurrentIdx(0);
        setSelectedAnswer('');
        setResult(null);
        setStats({ correct: 0, total: 0 });
        setLoadError(null);
      } else {
        // 考试锁定期后端返回 423"练习已锁定"等业务错误,必须透出,不能误显示"🎉 全部题目已刷完！做对的题已自动跳过，做错的题都在「错题本」里，去复习吧。"。
        setQuestions([]);
        setLoadError(r.error || '加载练习题失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const handleCheck = async () => {
    if (!selectedAnswer || !questions[currentIdx]) return;
    setChecking(true);
    try {
      const r = await apiFetch<CheckResult>('/api/student/practice/check', {
        method: 'POST',
        body: {
          questionId: questions[currentIdx].id,
          userAnswer: selectedAnswer,
        },
      });
      if (r.ok && r.data) {
        setResult(r.data);
        setStats(prev => ({
          correct: prev.correct + (r.data!.correct ? 1 : 0),
          total: prev.total + 1,
        }));
      } else {
        const msg = r.error || '提交失败，请稍后重试';
        toast.error(msg);
      }
    } catch {
      toast.error('网络连接失败，请稍后重试');
    } finally {
      setChecking(false);
    }
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(prev => prev + 1);
      setSelectedAnswer('');
      setResult(null);
    } else {
      loadQuestions();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-lg text-muted-foreground">正在加载练习题...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-lg text-muted-foreground text-center px-4">{loadError}</div>
        <Button onClick={() => loadQuestions()}>重试</Button>
        <Button variant="outline" onClick={() => router.push('/student/home')}>返回首页</Button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="text-lg text-muted-foreground">暂无可练习的题目</div>
        <p className="text-sm text-muted-foreground">请等待管理员导入并发布题目后再来练习。</p>
        <Button onClick={() => router.push('/student/home')}>返回首页</Button>
      </div>
    );
  }

  const q = questions[currentIdx];
  const isTrueFalse = q.question_type === 'true_false';
  const isFillInBlank = q.question_type === 'fill_in_blank';
  const isPromptDescription = q.question_type === 'prompt_description';
  const isDialogue = q.question_type === 'dialogue_sentiment';
  // 选项键按题目实际 options 渲染(题库支持 A-F),与考试页动态过滤同构;dialogue/target 等素材键被正则排除。
  const optionKeys = isTrueFalse ? ['A', 'B'] : Object.keys(q.options ?? {}).filter(k => /^[A-F]$/.test(k)).sort();
  // 脏题防御:客观选项题缺选项(<2)时无法作答——历史上 seed 导入过 0 选项题,
  // 提交按钮会因选不了答案永久禁用造成界面死锁。这里降级为可跳过的警示占位。
  const isDirtyOptionQuestion = !isTrueFalse && !isFillInBlank && !isPromptDescription && !isDialogue && optionKeys.length < 2;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Progress bar */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          第 {currentIdx + 1} / {questions.length} 题
        </span>
        <span className="text-sm font-medium">
          做对了 {stats.correct} 题 / 共做 {stats.total} 题
        </span>
      </div>

      {/* Progress */}
      <div className="mb-6 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question card */}
      <Card className="p-5 mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {isPromptDescription ? '提示词描述题' : isDialogue ? '对话情绪判读题' : isFillInBlank ? '填空题' : isTrueFalse ? '判断题' : '单选题'}
          </span>
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            难度：{q.difficulty}
          </span>
        </div>
        <p className="mb-4 text-lg leading-relaxed whitespace-pre-wrap">{q.stem}</p>

        {isPromptDescription ? (
          <div className="space-y-4">
            {typeof q.options?.image === 'string' && q.options.image && (
              <div className="overflow-hidden rounded-lg border-2 border-border">
                <img
                  src={q.options.image}
                  alt="提示词描述素材"
                  className="max-h-96 w-full object-contain"
                  loading="lazy"
                />
              </div>
            )}
            <textarea
              value={selectedAnswer}
              onChange={e => !result && setSelectedAnswer(e.target.value)}
              disabled={!!result}
              placeholder="请仔细观察图片，用自然语言描述图片内容，撰写一段提示词。描述应包含画面中的主体、颜色、场景、动作、风格等关键信息。"
              rows={6}
              className="w-full resize-y rounded-lg border-2 border-border p-4 text-lg leading-relaxed focus:border-primary focus:outline-none disabled:opacity-60"
            />
            {result && (
              <div className={`rounded-lg border-2 p-4 ${result.correct ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10'}`}>
                <span className="text-base">
                  {result.correct ? '✓ 做对了！' : '✗ 再看看图片中有哪些关键信息没有描述到'}
                </span>
                {result.feedback && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{result.feedback}</p>
                )}
              </div>
            )}
          </div>
        ) : isFillInBlank ? (
          <div className="space-y-3">
            <input
              type="text"
              value={selectedAnswer}
              onChange={e => !result && setSelectedAnswer(e.target.value)}
              disabled={!!result}
              placeholder="请在此输入你的答案"
              className="w-full rounded-lg border-2 border-border p-4 text-lg focus:border-primary focus:outline-none disabled:opacity-60"
            />
            {result && (
              <div className={`rounded-lg border-2 p-4 ${result.correct ? 'border-success bg-success/10' : 'border-destructive bg-destructive/10'}`}>
                <span className="text-base">
                  {result.correct ? '✓ 回答正确' : `✗ 参考答案：${result.correctAnswer}`}
                </span>
              </div>
            )}
          </div>
        ) : (
        <div className="space-y-3">
          {isDialogue && <DialogueView dialogue={q.options?.dialogue} target={q.options?.target} />}
          {isDirtyOptionQuestion && (
            <div className="rounded-lg border-2 border-dashed border-destructive/40 bg-destructive/5 p-4 text-sm text-muted-foreground">
              该题数据异常（选项缺失），不影响其他题目——请跳过继续刷题，已反馈给老师修复。
            </div>
          )}
          {optionKeys.map(key => {
            const optionText = isTrueFalse
              ? (key === 'A' ? '正确' : '错误')
              : String(q.options?.[key] ?? '');
            const isSelected = selectedAnswer === key;
            const isCorrectAnswer = result?.correctAnswer === key;
            const isWrongSelection = result && isSelected && !result.correct;

            return (
              <button
                key={key}
                onClick={() => !result && setSelectedAnswer(key)}
                disabled={!!result}
                className={[
                  'flex w-full items-start gap-3 rounded-lg border-2 px-4 py-3 text-left transition-colors',
                  result && isCorrectAnswer
                    ? 'border-success bg-success/10'
                    : isWrongSelection
                      ? 'border-destructive bg-destructive/10'
                      : isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                  !result ? 'cursor-pointer' : 'cursor-default',
                ].join(' ')}
              >
                <span className={`flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full border-2 font-medium text-sm ${
                  isSelected && !result ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                }`}>
                  {key}
                </span>
                <span className="pt-1 text-lg">{optionText}</span>
                {result && isCorrectAnswer && (
                  <span className="ml-auto pt-1 text-success font-medium text-sm">✓ 正确答案</span>
                )}
                {isWrongSelection && (
                  <span className="ml-auto pt-1 text-destructive font-medium text-sm">✗ 你的选择</span>
                )}
              </button>
            );
          })}
        </div>
        )}
      </Card>

      {/* Feedback */}
      {result && (
        <Card className={`p-4 mb-4 ${result.correct ? 'border-success/50' : 'border-destructive/50'}`}>
          <div className="flex items-center gap-2 mb-2">
            {result.correct ? (
              <span className="text-lg font-medium text-success">✓ 做对了！</span>
            ) : (
              <span className="text-lg font-medium text-destructive">✗ 答错了，没关系，多练几次就记住了</span>
            )}
          </div>
          {result.explanation && (
            <div className="text-sm text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">解析：</span>
              {result.explanation}
            </div>
          )}
          {result.knowledgePoint && (
            <div className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">知识点：</span>
              {result.knowledgePoint}
            </div>
          )}
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {isDirtyOptionQuestion && !result ? (
          /* 脏题占位:唯一出口是跳过,绝不让学生锁死在本题 */
          <Button size="lg" className="flex-1 text-lg" variant="outline" onClick={handleNext}>
            跳过此题 →
          </Button>
        ) : !result ? (
          <Button
            size="lg"
            className="flex-1 text-lg"
            onClick={handleCheck}
            disabled={!selectedAnswer || checking}
          >
            {checking ? '提交中...' : '提交答案'}
          </Button>
        ) : (
          <Button size="lg" className="flex-1 text-lg" onClick={handleNext}>
            {currentIdx < questions.length - 1 ? '下一题 →' : '继续刷下一批（自动跳过已做对的题）'}
          </Button>
        )}
      </div>
    </div>
  );
}
