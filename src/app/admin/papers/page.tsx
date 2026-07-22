'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { FileText, Plus } from 'lucide-react';

interface Paper {
  id: string;
  title: string;
  paperKind: string;
  totalScore: number;
  passScore: number;
  durationMinutes: number;
  status: string;
  version: number;
  itemCount: number;
  createdAt: string;
}

export default function PapersPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '', durationMinutes: '90', totalScore: '100', passScore: '60',
  });

  const fetchPapers = async () => {
    const r = await apiFetch<Paper[]>('/api/admin/papers');
    if (r.ok && r.data) setPapers(r.data);
    setLoading(false);
  };

  useEffect(() => { fetchPapers(); }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error('试卷标题不能为空'); return; }
    const r = await apiFetch<{ id: string }>('/api/admin/papers', {
      method: 'POST',
      body: JSON.stringify({
        title: form.title,
        durationMinutes: parseInt(form.durationMinutes, 10) || 90,
        totalScore: parseInt(form.totalScore, 10) || 100,
        passScore: parseInt(form.passScore, 10) || 60,
      }),
    });
    if (r.ok) {
      toast.success('创建成功，请添加题目');
      setShowCreate(false);
      setForm({ title: '', durationMinutes: '90', totalScore: '100', passScore: '60' });
      fetchPapers();
    } else {
      toast.error('创建失败', { description: r.error });
    }
  };

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">试卷管理</h1>
        <Button onClick={() => setShowCreate(true)} size="lg" className="text-base">
          <Plus className="w-5 h-5 mr-2" /> 新建试卷
        </Button>
      </div>

      {showCreate && (
        <Card className="mb-6">
          <CardContent className="py-5 space-y-4">
            <h2 className="text-lg font-semibold">新建试卷</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-medium mb-1">试卷标题 *</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="如：五级理论模拟卷" className="text-base" />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">考试时长（分钟）</label>
                <Input type="number" value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))} className="text-base" />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">总分</label>
                <Input type="number" value={form.totalScore} onChange={e => setForm(f => ({ ...f, totalScore: e.target.value }))} className="text-base" />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">及格分</label>
                <Input type="number" value={form.passScore} onChange={e => setForm(f => ({ ...f, passScore: e.target.value }))} className="text-base" />
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
        {papers.length === 0 && <div className="text-center py-12 text-gray-500">暂无试卷</div>}
        {papers.map(p => (
          <Card key={p.id}>
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="text-lg font-medium">{p.title}</div>
                  <div className="text-base text-gray-500">
                    {p.itemCount} 道题 · 满分 {p.totalScore} · 及格 {p.passScore} · {p.durationMinutes} 分钟
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  p.status === 'draft' ? 'bg-yellow-50 text-yellow-700' :
                  p.status === 'published' ? 'bg-green-50 text-green-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {p.status === 'draft' ? '草稿' : p.status === 'published' ? '已发布' : p.status}
                </span>
                <span className="text-sm text-gray-400">v{p.version}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
