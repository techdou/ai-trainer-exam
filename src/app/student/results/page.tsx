'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent } from '@/components/ui/card';
import { Award, CheckCircle2, XCircle } from 'lucide-react';

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

  useEffect(() => {
    apiFetch<ExamResult[]>('/api/student/results').then(r => {
      if (r.ok && r.data) setResults(r.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">我的成绩</h1>

      {results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <div className="text-lg text-gray-500">暂无考试成绩</div>
            <p className="text-base text-gray-400 mt-1">完成考试后，成绩会显示在这里</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {results.map(r => (
            <Card key={r.id}>
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                    r.passed ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    {r.passed ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-500" />
                    )}
                  </div>
                  <div>
                    <div className="text-lg font-medium">{r.scheduleTitle}</div>
                    <div className="text-base text-gray-500">
                      {r.status === 'adjusted' ? '已复核' : '自动评分'} · {new Date(r.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${r.passed ? 'text-green-600' : 'text-red-500'}`}>
                    {r.totalScore}
                  </div>
                  <div className="text-base text-gray-400">满分 {r.maxScore}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
