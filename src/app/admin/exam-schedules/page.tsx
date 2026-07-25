'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { CalendarClock, Plus, Send, Unlock } from 'lucide-react';
import { EXAM_STATUS_LABELS, type ExamStatus } from '@/lib/constants';

interface ExamSchedule {
  id: string;
  title: string;
  cohortId: string;
  cohortName: string;
  paperTitle: string | null;
  examStartAt: string;
  examEndAt: string;
  durationMinutes: number | null;
  lateEntryMinutes: number;
  status: string;
  resultsReleased: boolean;
  attemptCount: number;
  submittedCount?: number;
  createdAt: string;
}

interface Cohort {
  id: string;
  name: string;
}

interface Paper { id:string; title:string; itemCount:number; status:string }

export default function ExamSchedulesPage() {
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '', cohortId: '', paperId: '',
    examStartAt: '', examEndAt: '',
    lateEntryMinutes: '15', submitGraceSeconds: '60',
    practiceOpenAt: '', practiceLockAt: '', resultsReleaseAt: '',
  });

  const fetchData = async () => {
    const [schedRes, cohortRes, paperRes] = await Promise.all([
      apiFetch<ExamSchedule[]>('/api/admin/exam-schedules'),
      apiFetch<Cohort[]>('/api/admin/cohorts'),
      apiFetch<Paper[]>('/api/admin/papers'),
    ]);
    if (schedRes.ok && schedRes.data) setSchedules(schedRes.data);
    if (cohortRes.ok && cohortRes.data) setCohorts(cohortRes.data);
    if (paperRes.ok && paperRes.data) setPapers(paperRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.title || !form.cohortId || !form.paperId || !form.examStartAt || !form.examEndAt) {
      toast.error('请填写所有必填项'); return;
    }
    const r = await apiFetch<{ id: string }>('/api/admin/exam-schedules', {
      method: 'POST',
      body: {
        title: form.title,
        cohortId: form.cohortId,
        paperId: form.paperId,
        examStartAt: new Date(form.examStartAt).toISOString(),
        examEndAt: new Date(form.examEndAt).toISOString(),
        lateEntryMinutes: parseInt(form.lateEntryMinutes, 10) || 15,
        submitGraceSeconds: parseInt(form.submitGraceSeconds, 10) || 60,
        practiceOpenAt: form.practiceOpenAt ? new Date(form.practiceOpenAt).toISOString() : null,
        practiceLockAt: form.practiceLockAt ? new Date(form.practiceLockAt).toISOString() : null,
        resultsReleaseAt: form.resultsReleaseAt ? new Date(form.resultsReleaseAt).toISOString() : null,
      },
    });
    if (r.ok) {
      toast.success('创建成功');
      setShowCreate(false);
      setForm({ title: '', cohortId: '', paperId: '', examStartAt: '', examEndAt: '', lateEntryMinutes: '15', submitGraceSeconds: '60', practiceOpenAt: '', practiceLockAt: '', resultsReleaseAt: '' });
      fetchData();
    } else {
      toast.error('创建失败', { description: r.error });
    }
  };

  const handleAction = async (scheduleId: string, action: 'publish' | 'release_results') => {
    const endpoint = action === 'publish' ? '/api/admin/exam-schedules' : '/api/admin/scores/publish';
    const body = action === 'publish' ? { scheduleId, status: 'published' } : { scheduleId };
    const r = await apiFetch(endpoint, { method: action === 'publish' ? 'PATCH' : 'POST', body });
    if (r.ok) {
      toast.success(action === 'publish' ? '已发布' : '成绩已释放');
      fetchData();
    } else {
      toast.error('操作失败', { description: r.error });
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  // 状态标签统一用 constants 的真实状态机映射。历史上这里硬编码了 in_progress/ended/closed
  // 等状态机里根本不存在的值, 导致徽章显示英文原文、释放成绩按钮永不出现。
  const statusLabel = (status: string): string =>
    EXAM_STATUS_LABELS[status as ExamStatus] ?? status;

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">考务安排</h1>
        <Button onClick={() => setShowCreate(true)} size="lg" className="text-base">
          <Plus className="w-5 h-5 mr-2" /> 创建考试
        </Button>
      </div>

      {showCreate && (
        <Card className="mb-6">
          <CardContent className="py-5 space-y-4">
            <h2 className="text-lg font-semibold">创建新考试</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-medium mb-1">考试标题 *</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="如：五级理论考试" className="text-base" />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">考试班级 *</label>
                <select value={form.cohortId} onChange={e => setForm(f => ({ ...f, cohortId: e.target.value }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-base">
                  <option value="">选择班级</option>
                  {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-base font-medium mb-1">选择试卷 *</label>
                <select value={form.paperId} onChange={e => setForm(f => ({ ...f, paperId: e.target.value }))} className="w-full h-10 rounded-md border border-input bg-background px-3 text-base">
                  <option value="">选择试卷</option>
                  {papers.filter(p => (p as Paper & {status?:string}).status === 'published').map(p => <option key={p.id} value={p.id}>{p.title}（{p.itemCount}项）</option>)}
                </select>
              </div>
              <div>
                <label className="block text-base font-medium mb-1">迟到入场（分钟）</label>
                <Input type="number" value={form.lateEntryMinutes} onChange={e => setForm(f => ({ ...f, lateEntryMinutes: e.target.value }))} className="text-base" />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">交卷宽限（秒）</label>
                <Input type="number" value={form.submitGraceSeconds} onChange={e => setForm(f => ({ ...f, submitGraceSeconds: e.target.value }))} />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">练习开放时间</label>
                <Input type="datetime-local" value={form.practiceOpenAt} onChange={e => setForm(f => ({ ...f, practiceOpenAt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">练习锁定时间</label>
                <Input type="datetime-local" value={form.practiceLockAt} onChange={e => setForm(f => ({ ...f, practiceLockAt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">计划发布成绩时间</label>
                <Input type="datetime-local" value={form.resultsReleaseAt} onChange={e => setForm(f => ({ ...f, resultsReleaseAt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">开始时间 *</label>
                <Input type="datetime-local" value={form.examStartAt} onChange={e => setForm(f => ({ ...f, examStartAt: e.target.value }))} className="text-base" />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">结束时间 *</label>
                <Input type="datetime-local" value={form.examEndAt} onChange={e => setForm(f => ({ ...f, examEndAt: e.target.value }))} className="text-base" />
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleCreate} className="text-base">确认创建</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)} className="text-base">取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {schedules.length === 0 && <div className="text-center py-12 text-gray-500">暂无考试安排</div>}
        {schedules.map(s => (
          <Card key={s.id}>
            <CardContent className="py-4 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarClock className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="text-lg font-medium">{s.title}</div>
                  <div className="text-base text-gray-500">
                    {s.cohortName} · {s.paperTitle || '未关联试卷'} · {formatDateTime(s.examStartAt)} ~ {formatDateTime(s.examEndAt)}
                  </div>
                  <div className="text-sm text-gray-400">已交卷 {s.submittedCount ?? 0} / 参考 {s.attemptCount} 人</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  s.status === 'published' || s.status === 'waiting' ? 'bg-success/10 text-success' :
                  s.status === 'draft' ? 'bg-warning/10 text-warning' :
                  s.status === 'exam_open' ? 'bg-primary/10 text-primary' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {statusLabel(s.status)}
                </span>
                {s.status === 'draft' && (
                  <Button size="sm" onClick={() => handleAction(s.id, 'publish')} className="text-sm">
                    <Send className="w-4 h-4 mr-1" /> 发布
                  </Button>
                )}
                {!s.resultsReleased && ['exam_closed','grading','results_pending'].includes(s.status) && (
                  <Button size="sm" variant="outline" onClick={() => handleAction(s.id, 'release_results')} className="text-sm">
                    <Unlock className="w-4 h-4 mr-1" /> 释放成绩
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
