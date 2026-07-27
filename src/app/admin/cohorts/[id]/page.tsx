'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, getStoredUser } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, UsersRound, UploadCloud, Loader2 } from 'lucide-react';
import { RosterImportDialog } from '@/components/roster-import-dialog';

interface CohortInfo {
  id: string;
  name: string;
  organizationId: string;
}

interface CohortStudent {
  id: string;
  name: string;
  email: string;
  idCard: string;
  status: string;
  createdAt: string;
}

interface Organization {
  id: string;
  name: string;
}

export default function CohortDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: cohortId } = use(params);
  const router = useRouter();
  const [cohort, setCohort] = useState<CohortInfo | null>(null);
  const [students, setStudents] = useState<CohortStudent[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const me = getStoredUser();
  const isSuper = me?.roles.includes('super_admin') ?? false;

  const fetchData = async () => {
    const [studentsRes, orgsRes] = await Promise.all([
      apiFetch<{ cohort: CohortInfo | null; students: CohortStudent[] }>(`/api/admin/cohorts/${cohortId}/students`),
      apiFetch<Organization[]>('/api/admin/organizations'),
    ]);
    if (studentsRes.ok && studentsRes.data) {
      setCohort(studentsRes.data.cohort);
      setStudents(studentsRes.data.students);
    }
    if (orgsRes.ok && orgsRes.data) setOrgs(orgsRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [cohortId]);

  if (loading) return <div className="text-center py-12 text-lg text-muted-foreground">加载中...</div>;
  if (!cohort) return <div className="text-center py-12 text-muted-foreground">班级不存在</div>;

  const activeCount = students.filter(s => s.status === 'active').length;

  return (
    <div>
      {/* 顶部导航 */}
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/cohorts')} className="text-base">
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回班级列表
        </Button>
      </div>

      {/* 班级信息 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <UsersRound className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{cohort.name}</h1>
            <div className="text-base text-muted-foreground mt-1">
              {activeCount} 名在册学员
            </div>
          </div>
        </div>
        <Button onClick={() => setShowImport(true)} size="lg" className="text-base">
          <UploadCloud className="w-5 h-5 mr-2" /> 追加导入
        </Button>
      </div>

      {/* 学员列表 */}
      <Card>
        <CardContent className="p-0">
          {students.length === 0 ? (
            <div className="text-center py-16">
              <UsersRound className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <div className="text-lg text-muted-foreground mb-1">该班级暂无学员</div>
              <div className="text-sm text-muted-foreground">点击右上角「追加导入」上传学员名册</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">序号</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">姓名</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">账号（身份证号）</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">密码</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-sm text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-3 text-base font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-base font-mono">{s.idCard}</td>
                      <td className="px-4 py-3 text-base font-mono text-muted-foreground">{s.idCard.slice(-6)}</td>
                      <td className="px-4 py-3">
                        {s.status === 'active' ? (
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/15">正常</Badge>
                        ) : (
                          <Badge variant="secondary">已停用</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 登录提示 */}
      {students.length > 0 && (
        <div className="mt-4 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-sm">
          <div className="font-medium text-primary mb-1">学员登录方式</div>
          <div className="text-muted-foreground">
            账号：身份证号 &nbsp;|&nbsp; 密码：身份证号后六位（含末位 X 时大写）&nbsp;|&nbsp; 首次登录需修改密码
          </div>
        </div>
      )}

      <RosterImportDialog
        open={showImport}
        onOpenChange={(v) => {
          setShowImport(v);
          if (!v) fetchData();
        }}
        orgs={orgs}
        defaultOrgId={cohort.organizationId}
        isSuperAdmin={isSuper}
        cohortId={cohort.id}
      />
    </div>
  );
}
