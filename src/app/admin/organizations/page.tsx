'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Building2, Plus } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  code: string;
  contact: string | null;
  status: string;
  cohortCount: number;
  studentCount: number;
  createdAt: string;
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newContact, setNewContact] = useState('');

  const fetchOrgs = async () => {
    const r = await apiFetch<Organization[]>('/api/admin/organizations');
    if (r.ok && r.data) setOrgs(r.data);
    setLoading(false);
  };

  useEffect(() => { fetchOrgs(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error('学校名称不能为空'); return; }
    if (!newCode.trim()) { toast.error('学校编码不能为空'); return; }
    const r = await apiFetch<{ id: string }>('/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify({ name: newName, code: newCode, contact: newContact }),
    });
    if (r.ok) {
      toast.success('创建成功');
      setShowCreate(false);
      setNewName('');
      setNewCode('');
      setNewContact('');
      fetchOrgs();
    } else {
      toast.error('创建失败', { description: r.error });
    }
  };

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">学校管理</h1>
        <Button onClick={() => setShowCreate(true)} size="lg" className="text-base">
          <Plus className="w-5 h-5 mr-2" /> 添加学校
        </Button>
      </div>

      {showCreate && (
        <Card className="mb-6">
          <CardContent className="py-5 space-y-4">
            <h2 className="text-lg font-semibold">添加新学校</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-base font-medium mb-1">学校名称 *</label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="如：XX职业培训学校" className="text-base" />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">学校编码 *</label>
                <Input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="如：SCH001" className="text-base" />
              </div>
              <div>
                <label className="block text-base font-medium mb-1">联系人</label>
                <Input value={newContact} onChange={e => setNewContact(e.target.value)} placeholder="如：张老师" className="text-base" />
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
        {orgs.length === 0 && <div className="text-center py-12 text-gray-500">暂无学校数据</div>}
        {orgs.map(org => (
          <Card key={org.id}>
            <CardContent className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="text-lg font-medium">{org.name}</div>
                  <div className="text-base text-gray-500">
                    编码：{org.code}
                    {org.contact && ` · 联系人：${org.contact}`}
                    {' · '}{org.cohortCount} 个班级 · {org.studentCount} 名学员
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  org.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {org.status === 'active' ? '正常' : org.status}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
