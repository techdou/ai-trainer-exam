'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent } from '@/components/ui/card';
import { Award } from 'lucide-react';

interface ExamResult {
  id: string;
  userEmail: string;
  userName: string;
  scheduleTitle: string;
  theoryScore: number;
  totalScore: number;
  maxScore: number;
  passed: boolean;
  status: string;
  createdAt: string;
}

export default function ResultsPage() {
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ExamResult[]>('/api/admin/results').then(r => {
      if (r.ok && r.data) setResults(r.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">成绩管理</h1>

      {results.length === 0 ? (
        <div className="text-center py-12 text-gray-500">暂无成绩数据</div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium">学员</th>
                  <th className="px-4 py-3 text-left font-medium">考试</th>
                  <th className="px-4 py-3 text-center font-medium">理论分</th>
                  <th className="px-4 py-3 text-center font-medium">总分</th>
                  <th className="px-4 py-3 text-center font-medium">结果</th>
                  <th className="px-4 py-3 text-left font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.userName || '—'}</div>
                      <div className="text-sm text-gray-400">{r.userEmail}</div>
                    </td>
                    <td className="px-4 py-3">{r.scheduleTitle}</td>
                    <td className="px-4 py-3 text-center">{r.theoryScore}</td>
                    <td className="px-4 py-3 text-center font-bold">{r.totalScore}/{r.maxScore}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                        r.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        <Award className="w-3.5 h-3.5" />
                        {r.passed ? '通过' : '未通过'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-sm ${
                        r.status === 'auto_graded' ? 'bg-blue-50 text-blue-700' :
                        r.status === 'confirmed' ? 'bg-green-50 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {r.status === 'auto_graded' ? '自动评分' :
                         r.status === 'confirmed' ? '已确认' :
                         r.status === 'pending' ? '待评分' : r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
