'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface PracticeQuestion {
  id: string;
  question_type: string;
  stem: string;
  options: Record<string, string>;
  difficulty: string;
  knowledge_point: string;
  explanation: string | null;
}

interface CheckResult {
  correct: boolean;
  correctAnswer: string;
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

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/student/practice/questions?module=theory&limit=10');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json();
      if (json.success) {
        setQuestions(json.data);
        setCurrentIdx(0);
        setSelectedAnswer('');
        setResult(null);
        setStats({ correct: 0, total: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const handleCheck = async () => {
    if (!selectedAnswer || !questions[currentIdx]) return;
    setChecking(true);
    try {
      const res = await fetch('/api/student/practice/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: questions[currentIdx].id,
          userAnswer: selectedAnswer,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
        setStats(prev => ({
          correct: prev.correct + (json.data.correct ? 1 : 0),
          total: prev.total + 1,
        }));
      }
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
  const optionKeys = isTrueFalse ? ['A', 'B'] : ['A', 'B', 'C', 'D'];

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
      <Card className="p-6 mb-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {isTrueFalse ? '判断题' : '单选题'}
          </span>
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            难度：{q.difficulty}
          </span>
        </div>
        <p className="mb-4 text-lg leading-relaxed whitespace-pre-wrap">{q.stem}</p>

        <div className="space-y-3">
          {optionKeys.map(key => {
            const optionText = isTrueFalse
              ? (key === 'A' ? '正确' : '错误')
              : q.options?.[key] || '';
            const isSelected = selectedAnswer === key;
            const isCorrectAnswer = result?.correctAnswer === key;
            const isWrongSelection = result && isSelected && !result.correct;

            return (
              <button
                key={key}
                onClick={() => !result && setSelectedAnswer(key)}
                disabled={!!result}
                className={[
                  'flex w-full items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors',
                  result && isCorrectAnswer
                    ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                    : isWrongSelection
                      ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                      : isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                  !result ? 'cursor-pointer' : 'cursor-default',
                ].join(' ')}
              >
                <span className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full border-2 font-medium text-sm">
                  {key}
                </span>
                <span className="pt-1 text-base">{optionText}</span>
                {result && isCorrectAnswer && (
                  <span className="ml-auto pt-1 text-green-600 font-medium text-sm">✓ 正确答案</span>
                )}
                {isWrongSelection && (
                  <span className="ml-auto pt-1 text-red-600 font-medium text-sm">✗ 你的选择</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Feedback */}
      {result && (
        <Card className={`p-4 mb-4 ${result.correct ? 'border-green-500/50' : 'border-red-500/50'}`}>
          <div className="flex items-center gap-2 mb-2">
            {result.correct ? (
              <span className="text-lg font-medium text-green-600">✓ 做对了！</span>
            ) : (
              <span className="text-lg font-medium text-red-600">✗ 答错了，没关系，多练几次就记住了</span>
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
        {!result ? (
          <Button
            size="lg"
            className="flex-1 text-base"
            onClick={handleCheck}
            disabled={!selectedAnswer || checking}
          >
            {checking ? '提交中...' : '提交答案'}
          </Button>
        ) : (
          <Button size="lg" className="flex-1 text-base" onClick={handleNext}>
            {currentIdx < questions.length - 1 ? '下一题 →' : '再来一组'}
          </Button>
        )}
      </div>
    </div>
  );
}
