'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { UsersRound, Plus } from 'lucide-react';

interface Cohort {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  studentCount: number;
  createdAt: string;
}

interface Organization {
  id: string;
  name: string;
}

export default function CohortsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');

  const fetchData = async () => {
    const [cohortsRes, orgsRes] = await Promise.all([
      apiFetch<Cohort[]>('/api/admin/cohorts'),
      apiFetch<Organization[]>('/api/admin/organizations'),
    ]);
    if (cohortsRes.ok && cohortsRes.data) setCohorts(cohortsRes.data);
    if (orgsRes.ok && orgsRes.data) setOrgs(orgsRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('班级名称不能为空'); return; }
    const r = await apiFetch<{ id: string }>('/api/admin/cohorts', {
      method: 'POST',
      body: JSON.stringify({ name: newName, organizationId: selectedOrgId || undefined }),
    });
    if (r.ok) {
      toast.success('创建成功');
      setShowCreate(false);
      setNewName('');
      setSelectedOrgId('');
      fetchData();
    } else {
      toast.error('创建失败', { description: r.error });
    }
  };

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">班级管理</h1>
        <Button onClick={() => setShowCreate(true)} size="lg" className="text-base">
          <Plus className="w-5 h-5 mr-2" /> 添加班级
        </Button>
      </div>

      {showCreate && (
        <Card className="mb-6">
          <CardContent className="py-5 space-y-4">
            <h2 className="text-lg font-semibold">添加新班级</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-base font-medium mb-1">班级名称 *</label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="如：2026年第三期培训班" className="text-base" />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">所属学校</label>
                <select
                  value={selectedOrgId}
                  onChange={e => setSelectedOrgId(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-base"
                >
                  <option value="">默认</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleCreate} className="text-base">确认添加</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)} className="text-base">取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {cohorts.length === 0 && <div className="text-center py-12 text-gray-500">暂无班级数据</div>}
        {cohorts.map(c => (
          <Card key={c.id}>
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <UsersRound className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="text-lg font-medium">{c.name}</div>
                  <div className="text-base text-gray-500">
                    {c.organizationName} · {c.studentCount} 名学员
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
