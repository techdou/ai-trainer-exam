'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent } from '@/components/ui/card';
import { Award, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';

interface ExamResult {
  id: string;
  scheduleTitle: string;
  totalScore: number;
  maxScore: number;
  passed: boolean;
  status: string;
  createdAt: string;
}

export default function StudentResultsPage() {
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadResults = () => {
    setLoading(true);
    setError(null);
    apiFetch<ExamResult[]>('/api/student/results').then(r => {
      if (r.ok && r.data) {
        setResults(r.data);
      } else {
        setError(r.error || '加载成绩失败，请稍后重试');
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    loadResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-center py-12 text-lg text-muted-foreground">加载中...</div>;

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">我的成绩</h1>
        <div className="text-center py-12">
          <p className="text-lg text-destructive mb-3">{error}</p>
          <button
            onClick={loadResults}
            className="inline-flex items-center gap-1 px-5 py-2.5 rounded-lg border-2 border-primary text-primary font-medium hover:bg-secondary transition-colors"
          >
            <RotateCcw className="w-4 h-4" aria-hidden /> 重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">我的成绩</h1>

      {results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Award className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <div className="text-lg text-muted-foreground">暂无考试成绩</div>
            <p className="text-base text-muted-foreground mt-1">完成考试后，成绩会显示在这里</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {results.map(r => (
            <Card key={r.id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                    r.passed ? 'bg-success/10' : 'bg-destructive/10'
                  }`}>
                    {r.passed ? (
                      <CheckCircle2 className="w-6 h-6 text-success" />
                    ) : (
                      <XCircle className="w-6 h-6 text-destructive" />
                    )}
                  </div>
                  <div>
                    <div className="text-lg font-medium">{r.scheduleTitle}</div>
                    <div className="text-base text-muted-foreground">
                      {r.passed ? '及格' : '未及格'} · {r.status === 'adjusted' ? '已复核' : '自动评分'} · {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-foreground">
                    {r.totalScore}
                  </div>
                  <div className="text-base text-muted-foreground">满分 {r.maxScore}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
