'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/session-client';

interface Organization {
  id: string;
  name: string;
}

interface PreviewStudent {
  name: string;
  idCard: string;
  gender: string;
  phone: string;
}

interface ImportResult {
  cohortId: string;
  cohortName: string;
  total: number;
  created: number;
  skipped: number;
  errors: string[];
}

export function RosterImportDialog({
  open,
  onOpenChange,
  orgs,
  defaultOrgId,
  isSuperAdmin,
  cohortId: fixedCohortId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgs: Organization[];
  defaultOrgId: string;
  isSuperAdmin: boolean;
  cohortId?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cohortName, setCohortName] = useState('');
  const [orgId, setOrgId] = useState(defaultOrgId);
  const [previewStudents, setPreviewStudents] = useState<PreviewStudent[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setFile(null);
    setCohortName('');
    setPreviewStudents([]);
    setProgress(0);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileSelect = async (selectedFile: File | null) => {
    if (!selectedFile) return;
    if (!selectedFile.name.match(/\.xlsx$/i)) {
      toast.error('仅支持 .xlsx 格式');
      return;
    }
    setFile(selectedFile);
    setResult(null);
    setPreviewStudents([]);
    setCohortName('');

    // 预览解析
    setPreviewing(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const token = typeof window !== 'undefined' ? window.sessionStorage.getItem('examsys.session.v2') : null;
      const tokenObj = token ? JSON.parse(token) : null;
      const res = await fetch('/api/admin/cohorts/parse-roster', {
        method: 'POST',
        headers: tokenObj?.accessToken ? { Authorization: `Bearer ${tokenObj.accessToken}` } : {},
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error('解析失败', { description: json.error ?? '请检查文件格式' });
        setFile(null);
        return;
      }
      setCohortName(json.data.cohortName);
      setPreviewStudents(json.data.students);
      toast.success(`识别到 ${json.data.studentCount} 名学员`);
    } catch {
      toast.error('文件解析失败，请检查格式');
      setFile(null);
    } finally {
      setPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!file) { toast.error('请先选择名册文件'); return; }
    if (isSuperAdmin && !orgId) { toast.error('请选择所属学校'); return; }
    if (importing) return;
    setImporting(true);
    setProgress(10);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('cohortName', cohortName);
      if (fixedCohortId) fd.append('cohortId', fixedCohortId);
      if (isSuperAdmin && orgId) fd.append('organizationId', orgId);

      const token = typeof window !== 'undefined' ? window.sessionStorage.getItem('examsys.session.v2') : null;
      const tokenObj = token ? JSON.parse(token) : null;

      setProgress(30);
      const res = await fetch('/api/admin/cohorts/import-roster', {
        method: 'POST',
        headers: tokenObj?.accessToken ? { Authorization: `Bearer ${tokenObj.accessToken}` } : {},
        body: fd,
      });
      setProgress(80);
      const json = await res.json();
      setProgress(100);

      if (!res.ok || !json.success) {
        toast.error('导入失败', { description: json.error ?? '服务器错误' });
        return;
      }
      setResult(json.data);
      toast.success(`导入完成：新建 ${json.data.created} 人，跳过 ${json.data.skipped} 人`);
    } catch {
      toast.error('导入失败，请检查网络');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v && !importing) {
      reset();
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Users className="w-5 h-5 text-primary" />
            导入学员名册
          </DialogTitle>
        </DialogHeader>

        {/* 结果展示 */}
        {result ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
              <div>
                <div className="text-lg font-semibold">导入完成</div>
                <div className="text-sm text-muted-foreground">班级「{result.cohortName}」</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-primary">{result.created}</div>
                <div className="text-sm text-muted-foreground">新建账号</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-amber-600">{result.skipped}</div>
                <div className="text-sm text-muted-foreground">已存在(跳过)</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-muted-foreground">{result.total}</div>
                <div className="text-sm text-muted-foreground">名册总数</div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive mb-1">
                  <AlertCircle className="w-4 h-4" />
                  {result.errors.length} 条失败
                </div>
                <ul className="text-sm text-destructive/80 space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="font-medium mb-1">学员登录方式</div>
              <div className="text-muted-foreground">账号：身份证号 &nbsp;|&nbsp; 密码：身份证号后六位</div>
              <div className="text-muted-foreground">首次登录需修改密码</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* 学校选择 */}
            {isSuperAdmin && (
              <div>
                <Label className="text-base">所属学校 *</Label>
                <select
                  value={orgId}
                  onChange={e => setOrgId(e.target.value)}
                  className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-base"
                >
                  <option value="">请选择学校</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}

            {/* 文件上传 */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                handleFileSelect(e.dataTransfer.files[0]);
              }}
              onClick={() => fileRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="w-8 h-8 text-primary" />
                  <div className="text-left">
                    <div className="text-base font-medium">{file.name}</div>
                    <div className="text-sm text-muted-foreground">点击重新选择文件</div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <UploadCloud className="w-10 h-10 text-muted-foreground/50" />
                  <div className="text-base">
                    {previewing ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 正在解析...</span> : '点击或拖拽名册文件到此处'}
                  </div>
                  <div className="text-sm text-muted-foreground">支持 .xlsx 格式</div>
                </div>
              )}
            </div>

            {/* 预览信息 */}
            {previewStudents.length > 0 && (
              <>
                <div>
                  <Label className="text-base">班级名称（可修改）</Label>
                  <Input
                    value={cohortName}
                    onChange={e => setCohortName(e.target.value)}
                    placeholder="如：2026年第021期"
                    className="mt-1 text-base"
                  />
                </div>
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">识别到 {previewStudents.length} 名学员</span>
                    <Badge variant="secondary">预览</Badge>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {previewStudents.slice(0, 10).map((s, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm py-1">
                        <span className="text-muted-foreground w-6">{i + 1}</span>
                        <span className="font-medium w-16">{s.name}</span>
                        <span className="text-muted-foreground flex-1">{s.idCard}</span>
                        {s.phone && <span className="text-muted-foreground">{s.phone}</span>}
                      </div>
                    ))}
                    {previewStudents.length > 10 && (
                      <div className="text-sm text-muted-foreground text-center pt-1">...还有 {previewStudents.length - 10} 人</div>
                    )}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  导入后：账号为身份证号，密码为身份证号后六位，首次登录需修改密码
                </div>
              </>
            )}

            {importing && (
              <div className="space-y-2">
                <Progress value={progress} />
                <div className="text-sm text-center text-muted-foreground">正在创建学员账号...</div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {result ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>关闭</Button>
              <Button onClick={() => { handleClose(false); router.push(`/admin/cohorts/${result.cohortId}`); }}>
                查看班级学员
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={importing}>取消</Button>
              <Button
                onClick={handleImport}
                disabled={!file || importing || previewing || (isSuperAdmin && !orgId)}
                className="text-base"
              >
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                开始导入（{previewStudents.length || 0} 人）
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
