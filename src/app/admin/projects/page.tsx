'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent } from '@/components/ui/card';
import { FolderKanban } from 'lucide-react';

interface Org {
  id: string;
  name: string;
  code: string;
  status: string;
  cohortCount: number;
  studentCount: number;
}

export default function ProjectsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Org[]>('/api/admin/organizations').then(r => {
      if (r.ok && r.data) setOrgs(r.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-center py-12 text-lg text-gray-500">加载中...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">培训项目</h1>
      <p className="text-base text-gray-500 mb-6">培训项目关联学校与课程内容，每个学校可以开设多个培训项目。</p>
      <div className="space-y-3">
        {orgs.map(org => (
          <Card key={org.id}>
            <CardContent className="py-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FolderKanban className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-lg font-medium">人工智能训练师（五级）</div>
                <div className="text-base text-gray-500">{org.name} · {org.cohortCount} 个班级 · {org.studentCount} 名学员</div>
              </div>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-50 text-green-700">进行中</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
