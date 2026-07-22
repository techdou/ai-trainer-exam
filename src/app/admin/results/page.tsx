'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Award, CheckCircle2, XCircle, Eye, ChevronLeft, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface ExamResult {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  scheduleTitle: string;
  scheduleId: string;
  attemptId: string;
  theoryScore: number;
  cleaningScore: number;
  imageAnnotationScore: number;
  textAnnotationScore: number;
  audioScore: number;
  statisticsScore: number;
  totalScore: number;
  maxScore: number;
  passed: boolean;
  status: string;
  createdAt: string;
}

interface ScoreDetail {
  score: {
    id: string;
    attemptId: string;
    scheduleId: string;
    scores: {
      theory: number;
      cleaning: number;
      imageAnnotation: number;
      textAnnotation: number;
      audio: number;
      statistics: number;
      total: number;
      max: number;
    };
    passed: boolean;
    status: string;
    autoScoreDetail: Record<string, unknown> | null;
  };
  responses: Array<{
    id: string;
    itemId: string;
    itemType: string;
    response: unknown;
    score: number;
    stem: string | null;
    answerKey: unknown;
    questionType: string | null;
  }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  auto_scored: { label: '待复核', color: 'bg-amber-50 text-amber-700' },
  reviewed: { label: '已复核', color: 'bg-blue-50 text-blue-700' },
  published: { label: '已发布', color: 'bg-green-50 text-green-700' },
  pending: { label: '待评分', color: 'bg-gray-100 text-gray-600' },
};

export default function ResultsPage() {
  const [results, setResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScore, setSelectedScore] = useState<ScoreDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const loadResults = useCallback(() => {
    setLoading(true);
    apiFetch<ExamResult[]>('/api/admin/results').then(r => {
      if (r.ok && r.data) setResults(r.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const viewDetail = (scoreId: string) => {
    setDetailLoading(true);
    apiFetch<ScoreDetail>(`/api/admin/scores/review?scoreId=${scoreId}`).then(r => {
      if (r.ok && r.data) {
        setSelectedScore(r.data);
      } else {
        toast.error('加载详情失败');
      }
      setDetailLoading(false);
    });
  };

  const approveScore = async (scoreId: string) => {
    setAdjusting(true);
    apiFetch(`/api/admin/scores/review`, {
      method: 'PATCH',
      body: { scoreId, action: 'approve' },
    }).then(r => {
      if (r.ok) {
        toast.success('成绩已发布');
        loadResults();
        setSelectedScore(null);
      } else {
        toast.error(r.error || '操作失败');
      }
    }).finally(() => setAdjusting(false));
  };

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  if (detailLoading) return <div className="text-center py-12 text-lg text-gray-500">加载详情...</div>;

  if (selectedScore) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedScore(null)}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="w-4 h-4" />
          返回列表
        </button>

        <h1 className="text-2xl font-bold">成绩复核</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">总分</CardTitle></CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {selectedScore.score.scores.total}
                <span className="text-lg text-gray-400">/{selectedScore.score.scores.max}</span>
              </div>
              <div className={`mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                selectedScore.score.passed ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {selectedScore.score.passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {selectedScore.score.passed ? '通过' : '未通过'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">各项分数</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span>理论</span><span>{selectedScore.score.scores.theory}</span></div>
              <div className="flex justify-between"><span>数据清洗</span><span>{selectedScore.score.scores.cleaning}</span></div>
              <div className="flex justify-between"><span>图片标注</span><span>{selectedScore.score.scores.imageAnnotation}</span></div>
              <div className="flex justify-between"><span>文本标注</span><span>{selectedScore.score.scores.textAnnotation}</span></div>
              <div className="flex justify-between"><span>音频</span><span>{selectedScore.score.scores.audio}</span></div>
              <div className="flex justify-between"><span>统计</span><span>{selectedScore.score.scores.statistics}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">操作</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm text-gray-500 mb-2">
                状态: {STATUS_LABELS[selectedScore.score.status]?.label ?? selectedScore.score.status}
              </div>
              {selectedScore.score.status !== 'published' && (
                <Button
                  onClick={() => approveScore(selectedScore.score.id)}
                  disabled={adjusting}
                  className="w-full"
                  size="lg"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  确认并发布成绩
                </Button>
              )}
              {selectedScore.score.status === 'published' && (
                <div className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> 成绩已发布
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">答题明细（{selectedScore.responses.length}题）</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {selectedScore.responses.map((resp, idx) => (
                <div key={resp.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      第{idx + 1}题 ({resp.questionType ?? resp.itemType})
                    </span>
                    <span className={`text-sm font-bold ${resp.score > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {resp.score}分
                    </span>
                  </div>
                  {resp.stem && (
                    <p className="text-sm text-gray-600 mb-1 line-clamp-2">{resp.stem}</p>
                  )}
                  <div className="text-xs text-gray-400">
                    学员答案: {JSON.stringify(resp.response)}
                  </div>
                  {resp.answerKey ? (
                    <div className="text-xs text-green-600 mt-1">
                      正确答案: {JSON.stringify(resp.answerKey)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
                  <th className="px-4 py-3 text-center font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => {
                  const statusInfo = STATUS_LABELS[r.status] ?? { label: r.status, color: 'bg-gray-100 text-gray-600' };
                  return (
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
                        <span className={`px-2 py-0.5 rounded text-sm ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewDetail(r.id)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          复核
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
