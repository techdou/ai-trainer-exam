'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface WrongItem {
  id: string;
  item_id: string;
  wrong_count: number;
  resolved: boolean;
  last_wrong_at: string;
  question_type: string;
  stem: string;
  options: Record<string, string> | null;
  answer_key: unknown;
  explanation: string | null;
  knowledge_point: string | null;
}

interface WrongListData {
  items: WrongItem[];
  total: number;
  page: number;
  pageSize: number;
}

export default function WrongItemsPage() {
  const router = useRouter();
  const [data, setData] = useState<WrongListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [result, setResult] = useState<{ correct: boolean; correctAnswer: string; explanation: string | null } | null>(null);
  const [checking, setChecking] = useState(false);

  const loadWrongItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/student/practice/wrong?resolved=${showResolved}&limit=20`);
      if (res.status === 401) { router.push('/login'); return; }
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [router, showResolved]);

  useEffect(() => { loadWrongItems(); }, [loadWrongItems]);

  const handleCheck = async (questionId: string) => {
    if (!selectedAnswer) return;
    setChecking(true);
    try {
      const res = await fetch('/api/student/practice/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, userAnswer: selectedAnswer }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
      }
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-lg text-muted-foreground">正在加载错题本...</div>
      </div>
    );
  }

  const reviewingItem = data?.items.find(i => i.id === reviewingId);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">错题本</h1>
        <p className="text-muted-foreground">之前做错的题目会出现在这里，多练几次就能记住</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={!showResolved ? 'default' : 'outline'}
          onClick={() => { setShowResolved(false); setReviewingId(null); setResult(null); }}
        >
          待复习 ({data?.total ?? 0})
        </Button>
        <Button
          variant={showResolved ? 'default' : 'outline'}
          onClick={() => { setShowResolved(true); setReviewingId(null); setResult(null); }}
        >
          已掌握
        </Button>
      </div>

      {/* Review mode */}
      {reviewingItem ? (
        <div>
          <Button variant="ghost" onClick={() => { setReviewingId(null); setResult(null); setSelectedAnswer(''); loadWrongItems(); }} className="mb-4">
            ← 返回列表
          </Button>
          <Card className="p-6 mb-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                错了 {reviewingItem.wrong_count} 次
              </span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {reviewingItem.question_type === 'true_false' ? '判断题' : '单选题'}
              </span>
              {reviewingItem.knowledge_point && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {reviewingItem.knowledge_point}
                </span>
              )}
            </div>
            <p className="mb-4 text-lg leading-relaxed">{reviewingItem.stem}</p>
            <div className="space-y-3">
              {(reviewingItem.question_type === 'true_false' ? ['A', 'B'] : ['A', 'B', 'C', 'D']).map(key => {
                const optionText = reviewingItem.question_type === 'true_false'
                  ? (key === 'A' ? '正确' : '错误')
                  : reviewingItem.options?.[key] || '';
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
                        ? 'border-green-500 bg-green-50'
                        : isWrongSelection
                          ? 'border-red-500 bg-red-50'
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

          {result && (
            <Card className={`p-4 mb-4 ${result.correct ? 'border-green-500/50' : 'border-red-500/50'}`}>
              {result.correct ? (
                <span className="text-lg font-medium text-green-600">✓ 做对了！这道题你已经掌握了</span>
              ) : (
                <span className="text-lg font-medium text-red-600">✗ 还是做错了，没关系，继续加油</span>
              )}
              {result.explanation && (
                <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">解析：</span>{result.explanation}
                </div>
              )}
            </Card>
          )}

          {!result && (
            <Button
              size="lg"
              className="w-full text-base"
              onClick={() => handleCheck(reviewingItem.item_id)}
              disabled={!selectedAnswer || checking}
            >
              {checking ? '提交中...' : '提交答案'}
            </Button>
          )}
        </div>
      ) : (
        /* List mode */
        <div className="space-y-3">
          {data?.items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {showResolved ? '还没有已掌握的错题' : '太棒了！没有错题需要复习'}
            </div>
          ) : (
            data?.items.map(item => (
              <Card
                key={item.id}
                className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => { setReviewingId(item.id); setSelectedAnswer(''); setResult(null); }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive font-medium text-sm">
                    {item.wrong_count}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base leading-relaxed line-clamp-2">{item.stem}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {item.question_type === 'true_false' ? '判断题' : '单选题'}
                      </span>
                      {item.knowledge_point && (
                        <span className="text-xs text-muted-foreground">{item.knowledge_point}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(item.last_wrong_at).toLocaleDateString()}
                  </span>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
