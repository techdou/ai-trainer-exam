'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getStoredUser } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, UsersRound, UploadCloud, KeyRound, Trash2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
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

interface ResetResult {
  total: number;
  success: number;
  failed: number;
  details: Array<{ name: string; idCard: string; success: boolean; message?: string }>;
}

export default function CohortDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: cohortId } = use(params);
  const router = useRouter();
  const [cohort, setCohort] = useState<CohortInfo | null>(null);
  const [students, setStudents] = useState<CohortStudent[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

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

  const handleResetPasswords = async () => {
    if (resetting) return;
    setResetting(true);
    setResetResult(null);
    try {
      const r = await apiFetch<ResetResult>(`/api/admin/cohorts/${cohortId}/reset-passwords`, { method: 'POST' });
      if (r.ok && r.data) {
        setResetResult(r.data);
        toast.success(`密码重置完成：成功 ${r.data.success} 人` + (r.data.failed > 0 ? `，失败 ${r.data.failed} 人` : ''));
      } else {
        toast.error('重置失败', { description: r.error });
      }
    } finally {
      setResetting(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const r = await apiFetch<{ message: string }>(`/api/admin/cohorts/${cohortId}`, { method: 'DELETE' });
      if (r.ok) {
        toast.success('班级已删除');
        router.push('/admin/cohorts');
      } else {
        toast.error('删除失败', { description: r.error });
      }
    } finally {
      setDeleting(false);
    }
  };

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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
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
        <div className="flex items-center gap-3">
          <Button onClick={() => setShowImport(true)} size="lg" className="text-base">
            <UploadCloud className="w-5 h-5 mr-2" /> 追加导入
          </Button>
          <Button onClick={() => { setResetResult(null); setShowReset(true); }} variant="outline" size="lg" className="text-base">
            <KeyRound className="w-4 h-4 mr-2" /> 重置密码
          </Button>
          <Button onClick={() => setShowDelete(true)} variant="outline" size="lg" className="text-base text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/30">
            <Trash2 className="w-4 h-4 mr-2" /> 删除班级
          </Button>
        </div>
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

      {/* 重置密码弹窗 */}
      <Dialog open={showReset} onOpenChange={(v) => { setShowReset(v); if (!v) setResetResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量重置学员密码</DialogTitle>
            <DialogDescription>
              将该班级所有学员的密码重置为身份证号后六位，重置后学员下次登录需修改密码。
            </DialogDescription>
          </DialogHeader>

          {resetResult ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-6 text-base">
                <span className="font-medium">共 {resetResult.total} 人</span>
                <span className="text-primary flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> 成功 {resetResult.success}
                </span>
                {resetResult.failed > 0 && (
                  <span className="text-destructive flex items-center gap-1">
                    <XCircle className="w-4 h-4" /> 失败 {resetResult.failed}
                  </span>
                )}
              </div>
              {resetResult.failed > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm space-y-1">
                  {resetResult.details.filter(d => !d.success).map((d, i) => (
                    <div key={i} className="text-destructive">
                      {d.name}（{d.idCard}）：{d.message}
                    </div>
                  ))}
                </div>
              )}
              {resetResult.failed === 0 && (
                <div className="rounded-md border border-primary/15 bg-primary/5 p-3 text-sm text-primary">
                  全部学员密码已重置为身份证号后六位。
                </div>
              )}
            </div>
          ) : (
            <div className="py-2 text-base text-muted-foreground">
              确认要重置 <span className="font-medium text-foreground">{cohort.name}</span> 全部 {students.length} 名学员的密码吗？
            </div>
          )}

          <DialogFooter>
            {resetResult ? (
              <Button onClick={() => setShowReset(false)} className="text-base">关闭</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowReset(false)} disabled={resetting} className="text-base">取消</Button>
                <Button onClick={handleResetPasswords} disabled={resetting} className="text-base">
                  {resetting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 正在重置...</> : '确认重置'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除班级弹窗 */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除班级</DialogTitle>
            <DialogDescription>
              删除后该班级将从列表中移除。学员账号不会被删除，仅解除与该班级的关联。
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-base space-y-2">
            <div className="text-muted-foreground">
              确认要删除班级 <span className="font-medium text-foreground">{cohort.name}</span> 吗？
            </div>
            <div className="rounded-md border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-700">
              注意：删除后不可恢复。如该班级有进行中的考试，需先处理考试安排。
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)} disabled={deleting} className="text-base">取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="text-base">
              {deleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 正在删除...</> : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
