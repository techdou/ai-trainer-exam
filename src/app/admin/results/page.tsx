'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Award, CheckCircle2, XCircle, Eye, ChevronLeft, RotateCcw, Pencil, Save, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getStoredUser } from '@/lib/session-client';
import { AnnotationFeedback, isAnnotationTaskType } from '@/components/annotation-feedback';

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
    passScore?: number;
    autoScoreDetail: Record<string, unknown> | null;
  };
  responses: Array<{
    id: string;
    itemId: string;
    itemType: string;
    response: unknown;
    score: number;
    maxScore?: number;
    // 题干/题型嵌在 itemSnapshot 里(完整快照: task 含 taskType/title/config, question 含 questionType/stem/options)。
    itemSnapshot: { stem?: string; title?: string; questionType?: string; taskType?: string;
                    config?: { imageUrl?: string }; options?: Record<string, unknown> } | null;
    answerKey: unknown;
    gradingDetail?: { pairs?: unknown[]; missed?: number; extra?: number; threshold?: number } | null;
  }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  auto_graded: { label: '待复核', color: 'bg-warning/10 text-warning' },
  reviewed: { label: '已复核', color: 'bg-primary/10 text-primary' },
  published: { label: '已发布', color: 'bg-success/10 text-success' },
  pending: { label: '待评分', color: 'bg-muted text-muted-foreground' },
};

export default function ResultsPage() {
  const [results, setResults] = useState<ExamResult[]>([]);
  // 按考试筛选(''=全部)。复核场景通常按场逐场核对, 而非混排全部成绩。
  const [scheduleFilter, setScheduleFilter] = useState('');
  const scheduleOptions = [...new Set(results.map(r => r.scheduleTitle))];
  const filteredResults = scheduleFilter ? results.filter(r => r.scheduleTitle === scheduleFilter) : results;
  const [loading, setLoading] = useState(true);
  const [selectedScore, setSelectedScore] = useState<ScoreDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMode, setAdjustMode] = useState(false);
  const [adjustValues, setAdjustValues] = useState<Record<string, number>>({});
  const [adjustReason, setAdjustReason] = useState('');
  const [currentUser, setCurrentUser] = useState<{ roles: string[] } | null>(null);

  useEffect(() => {
    setCurrentUser(getStoredUser());
  }, []);

  const canAdjust = currentUser?.roles.some(r => r === 'super_admin' || r === 'school_admin') ?? false;

  /** 进入调整模式，填充当前分数到编辑框 */
  const enterAdjustMode = () => {
    if (!selectedScore) return;
    const s = selectedScore.score.scores;
    setAdjustValues({
      theory: s.theory, cleaning: s.cleaning, imageAnnotation: s.imageAnnotation,
      textAnnotation: s.textAnnotation, audio: s.audio, statistics: s.statistics,
    });
    setAdjustReason('');
    setAdjustMode(true);
  };

  /** 计算调整后的总分 */
  const previewTotal = adjustMode
    ? Object.values(adjustValues).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0)
    : 0;

  /** 调整后是否通过 */
  const previewPassed = selectedScore
    ? previewTotal >= (selectedScore.score.passScore ?? 0)
    : false;

  /** 检测哪些项发生了变化 */
  const changedKeys = adjustMode && selectedScore
    ? Object.entries(adjustValues)
        .filter(([key, val]) => {
          const orig = selectedScore.score.scores[key as keyof typeof selectedScore.score.scores];
          return Number.isFinite(val) && Math.abs((val ?? 0) - orig) > 0.001;
        })
        .map(([key]) => key)
    : [];

  /** 提交分数调整 */
  const adjustScore = async () => {
    if (!selectedScore) return;
    if (changedKeys.length === 0) {
      toast.error('没有发生变化的分数项');
      return;
    }
    if (adjustReason.trim().length < 5) {
      toast.error('调整原因至少 5 个字');
      return;
    }
    if (previewTotal > selectedScore.score.scores.max) {
      toast.error('调整后的总分不能超过满分');
      return;
    }
    const adjustments: Record<string, number> = {};
    for (const key of changedKeys) {
      const fieldMap: Record<string, string> = {
        theory: 'theoryScore', cleaning: 'cleaningScore', imageAnnotation: 'imageAnnotationScore',
        textAnnotation: 'textAnnotationScore', audio: 'audioScore', statistics: 'statisticsScore',
      };
      adjustments[fieldMap[key]] = adjustValues[key];
    }
    setAdjusting(true);
    apiFetch(`/api/admin/scores/review`, {
      method: 'PATCH',
      body: { scoreId: selectedScore.score.id, action: 'adjust', adjustments, note: adjustReason.trim() },
    }).then(r => {
      if (r.ok) {
        toast.success('分数调整成功');
        loadResults();
        setSelectedScore(null);
        setAdjustMode(false);
      } else {
        toast.error(r.error || '操作失败');
      }
    }).finally(() => setAdjusting(false));
  };

  const loadResults = useCallback(() => {
    setLoading(true);
    apiFetch<{ items: ExamResult[]; total: number }>('/api/admin/results?pageSize=200').then(r => {
      if (r.ok && r.data) setResults(r.data.items);
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
    // API 要求复核说明(审计要求), 历史上前端不传 note 导致"确认并发布"永远 400。
    const note = window.prompt('请填写复核说明（将写入审计日志）');
    if (!note || note.trim().length < 3) {
      if (note !== null) toast.error('复核说明至少 3 个字');
      return;
    }
    setAdjusting(true);
    apiFetch(`/api/admin/scores/review`, {
      method: 'PATCH',
      body: { scoreId, action: 'approve', note: note.trim() },
    }).then(r => {
      if (r.ok) {
        // approve 只把成绩置为 reviewed,真正对学员可见还需在考务安排里"释放成绩"——文案必须说清,避免漏第二步。
        toast.success('复核通过', { description: '该成绩已确认。还需在考务安排中释放成绩，学员才能查看。' });
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
          onClick={() => { setSelectedScore(null); setAdjustMode(false); setAdjustReason(''); }}
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
                selectedScore.score.passed ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
              }`}>
                {selectedScore.score.passed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {selectedScore.score.passed ? '通过' : '未通过'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                各项分数
                {canAdjust && !adjustMode && selectedScore.score.status !== 'published' && (
                  <Button variant="outline" size="sm" onClick={enterAdjustMode}>
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    调整分数
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {([
                ['theory', '理论'],
                ['cleaning', '数据清洗'],
                ['imageAnnotation', '图片标注'],
                ['textAnnotation', '文本标注'],
                ['audio', '音频'],
                ['statistics', '统计'],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="shrink-0">{label}</span>
                  {adjustMode ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 line-through">
                        {selectedScore.score.scores[key]}
                      </span>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={adjustValues[key] ?? 0}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setAdjustValues(prev => ({ ...prev, [key]: Number.isFinite(v) && v >= 0 ? v : 0 }));
                        }}
                        className={`w-20 h-8 text-sm ${changedKeys.includes(key) ? 'border-accent ring-1 ring-accent/30' : ''}`}
                      />
                    </div>
                  ) : (
                    <span className="font-medium">{selectedScore.score.scores[key]}</span>
                  )}
                </div>
              ))}
              {adjustMode && (
                <>
                  <div className="border-t pt-2 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">调整后总分</span>
                      <span className={`font-bold text-lg ${previewTotal > selectedScore.score.scores.max ? 'text-destructive' : 'text-primary'}`}>
                        {previewTotal.toFixed(1)}
                        <span className="text-sm text-gray-400">/{selectedScore.score.scores.max}</span>
                      </span>
                    </div>
                    <div className={`mt-1 inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-xs font-medium ${
                      previewPassed ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                    }`}>
                      {previewPassed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {previewPassed ? '调整后通过' : '调整后未通过'}
                    </div>
                  </div>
                  <div className="pt-2">
                    <label className="text-xs text-gray-500 mb-1 block">调整原因（必填，至少 5 字，写入审计日志）</label>
                    <Textarea
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      placeholder="例如：第 3 题图片标注评分过严，经人工复查该标注位置正确"
                      className="text-sm"
                      rows={3}
                    />
                  </div>
                  {previewTotal > selectedScore.score.scores.max && (
                    <div className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      总分不能超过满分 {selectedScore.score.scores.max}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">操作</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm text-gray-500 mb-2">
                状态: {STATUS_LABELS[selectedScore.score.status]?.label ?? selectedScore.score.status}
              </div>
              {adjustMode ? (
                <>
                  <Button
                    onClick={adjustScore}
                    disabled={adjusting || changedKeys.length === 0 || adjustReason.trim().length < 5 || previewTotal > selectedScore.score.scores.max}
                    className="w-full"
                    size="lg"
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {adjusting ? '保存中...' : '保存调整'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setAdjustMode(false); setAdjustReason(''); }}
                    disabled={adjusting}
                    className="w-full"
                  >
                    <X className="w-4 h-4 mr-1" />
                    取消
                  </Button>
                  {changedKeys.length > 0 && (
                    <div className="text-xs text-gray-400 pt-1">
                      已修改 {changedKeys.length} 项
                    </div>
                  )}
                </>
              ) : (
                <>
                  {selectedScore.score.status !== 'published' && (
                    <Button
                      onClick={() => approveScore(selectedScore.score.id)}
                      disabled={adjusting}
                      className="w-full"
                      size="lg"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      复核通过
                    </Button>
                  )}
                  {selectedScore.score.status === 'published' && (
                    <div className="text-sm text-success flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> 成绩已发布
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">答题明细（{selectedScore.responses.length}题）</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {selectedScore.responses.map((resp, idx) => {
                const snap = resp.itemSnapshot;
                const taskType = snap?.taskType ?? snap?.questionType ?? resp.itemType;
                // 真实题名: 实操题用题目 title, 理论题用题干截断, 让复核员知道在核对哪道题。
                const itemTitle = snap?.title
                  ?? (snap?.stem ? snap.stem.replace(/\s+/g, ' ').slice(0, 26) + (snap.stem.length > 26 ? '…' : '') : taskType);
                const isAnnotation = isAnnotationTaskType(String(taskType));
                // 理论题作答友好化: 单选/判断只展示选项字母, 不甩 JSON。
                const rec = (resp.response ?? {}) as Record<string, unknown>;
                const picked = typeof rec.selectedOption === 'string' ? rec.selectedOption
                  : typeof rec.answer === 'boolean' ? (rec.answer ? '正确' : '错误')
                  : typeof rec.text === 'string' && rec.text ? rec.text
                  : typeof rec.transcript === 'string' && rec.transcript ? rec.transcript
                  : null;
                const ansKey = (resp.answerKey ?? {}) as Record<string, unknown>;
                const correct = typeof ansKey.correctOption === 'string' ? ansKey.correctOption
                  : typeof ansKey.correctAnswer === 'boolean' ? (ansKey.correctAnswer ? '正确' : '错误') : null;
                return (
                <div key={resp.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      第{idx + 1}题 · {itemTitle}
                    </span>
                    <span className={`text-sm font-bold ${resp.score > 0 ? 'text-success' : 'text-destructive'}`}>
                      {resp.score}分{resp.maxScore ? ` / ${resp.maxScore}` : ''}
                    </span>
                  </div>
                  {isAnnotation && snap?.config?.imageUrl ? (
                    <div className="mt-2">
                      <AnnotationFeedback
                        taskType={String(taskType)}
                        imageUrl={snap.config.imageUrl}
                        submission={resp.response}
                        answerKey={resp.answerKey}
                        details={(resp.gradingDetail ?? {}) as never}
                      />
                    </div>
                  ) : picked !== null ? (
                    <div className="text-sm space-y-0.5">
                      <div className="text-gray-700">学员作答：<span className="font-medium">{picked}</span></div>
                      {correct && <div className="text-success">正确答案：<span className="font-medium">{correct}</span></div>}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 break-all">
                      学员答案: {JSON.stringify(resp.response)}
                    </div>
                  )}
                  {!isAnnotation && resp.answerKey && picked === null ? (
                    <div className="text-xs text-success mt-1 break-all">
                      正确答案: {JSON.stringify(resp.answerKey)}
                    </div>
                  ) : null}
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">成绩管理</h1>

      {results.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">按考试筛选：</span>
          <select
            value={scheduleFilter}
            onChange={e => setScheduleFilter(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            aria-label="按考试筛选"
          >
            <option value="">全部考试（{results.length} 份）</option>
            {scheduleOptions.map(t => {
              const n = results.filter(r => r.scheduleTitle === t).length;
              return <option key={t} value={t}>{t}（{n} 份）</option>;
            })}
          </select>
        </div>
      )}

      {filteredResults.length === 0 ? (
        <div className="text-center py-12 text-gray-500">{results.length ? '该考试暂无成绩' : '暂无成绩数据'}</div>
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
                {filteredResults.map(r => {
                  const statusInfo = STATUS_LABELS[r.status] ?? { label: r.status, color: 'bg-muted text-muted-foreground' };
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
                          r.passed ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
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
