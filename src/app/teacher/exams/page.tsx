'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface ExamSchedule {
  id: string;
  title: string;
  cohort_id: string;
  exam_start_at: string;
  exam_end_at: string;
  late_entry_minutes: number;
  status: string;
  paper_id: string;
}

export default function TeacherExamsPage() {
  const [exams, setExams] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    cohortId: '',
    examStartAt: '',
    examEndAt: '',
    lateEntryMinutes: '15',
  });

  const fetchExams = useCallback(async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/teacher/exams', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setExams(data.data.items || []);
    } catch {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/teacher/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title,
          cohortId: form.cohortId,
          examStartAt: new Date(form.examStartAt).toISOString(),
          examEndAt: new Date(form.examEndAt).toISOString(),
          lateEntryMinutes: Number(form.lateEntryMinutes),
          questionIds: [],
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('考试创建成功');
        setDialogOpen(false);
        fetchExams();
      } else {
        toast.error(data.error || '创建失败');
      }
    } catch {
      toast.error('创建失败');
    } finally {
      setCreating(false);
    }
  };

  const statusLabel: Record<string, string> = {
    scheduled: '已排期',
    in_progress: '进行中',
    ended: '已结束',
    cancelled: '已取消',
  };

  const statusColor: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-green-100 text-green-800',
    ended: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">考试编排</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="text-lg px-6 py-3">创建考试</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>创建新考试</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label className="text-base">考试名称</Label>
                <Input
                  className="text-base h-12"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="如：人工智能训练师五级模拟考试"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-base">班级 ID</Label>
                <Input
                  className="text-base h-12"
                  value={form.cohortId}
                  onChange={e => setForm(f => ({ ...f, cohortId: e.target.value }))}
                  placeholder="输入班级 ID"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-base">开始时间</Label>
                  <Input
                    type="datetime-local"
                    className="text-base h-12"
                    value={form.examStartAt}
                    onChange={e => setForm(f => ({ ...f, examStartAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-base">结束时间</Label>
                  <Input
                    type="datetime-local"
                    className="text-base h-12"
                    value={form.examEndAt}
                    onChange={e => setForm(f => ({ ...f, examEndAt: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-base">迟到入场时间（分钟）</Label>
                <Input
                  type="number"
                  className="text-base h-12"
                  value={form.lateEntryMinutes}
                  onChange={e => setForm(f => ({ ...f, lateEntryMinutes: e.target.value }))}
                />
              </div>
              <Button
                className="w-full text-lg h-12"
                onClick={handleCreate}
                disabled={creating || !form.title || !form.cohortId || !form.examStartAt || !form.examEndAt}
              >
                {creating ? '创建中...' : '确认创建'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12 text-lg text-gray-500">加载中...</div>
      ) : exams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg text-gray-500">暂无考试安排</p>
            <p className="text-base text-gray-400 mt-2">点击上方「创建考试」按钮开始编排</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {exams.map(exam => (
            <Card key={exam.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{exam.title}</CardTitle>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor[exam.status] || 'bg-gray-100 text-gray-800'}`}>
                    {statusLabel[exam.status] || exam.status}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-base">
                  <div>
                    <span className="text-gray-500">开始时间</span>
                    <p className="font-medium">{new Date(exam.exam_start_at).toLocaleString('zh-CN')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">结束时间</span>
                    <p className="font-medium">{new Date(exam.exam_end_at).toLocaleString('zh-CN')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">迟到入场</span>
                    <p className="font-medium">{exam.late_entry_minutes} 分钟</p>
                  </div>
                  <div>
                    <span className="text-gray-500">班级 ID</span>
                    <p className="font-medium text-sm truncate">{exam.cohort_id}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
