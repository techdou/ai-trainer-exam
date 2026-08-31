'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';

// ---- 类型 ----

interface QuestionAvailability { questionType: string; label: string; available: number }
interface TaskAvailability { taskType: string; available: number }
interface AutoComposeData { questions: QuestionAvailability[]; tasks: TaskAvailability[] }

// 实操类型中文标签
const TASK_TYPE_LABELS: Record<string, string> = {
  excel_delete_rows: '数据清洗（表格删行）',
  file_classify: '文件分类',
  image_clean: '图片数据清洗',
  dataset_quality: '数据集质量检查',
  image_annotation: '方框标注',
  bounding_box: '方框标注',
  point_annotation: '关键点标注',
  polyline_annotation: '折线标注',
  polygon_annotation: '轮廓标注',
  text_sentiment: '文本情感标注',
  data_labeling: '数据标注',
  audio_transcription: '音频转写',
  stats_table: '统计填表',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /** 超管代组卷的机构 ID: null=超管尚未选机构(禁用), undefined=非超管(后端用自身机构)。 */
  organizationId?: string | null;
}

export function AutoComposeDialog({ open, onOpenChange, onCreated, organizationId }: Props) {
  const [availability, setAvailability] = useState<AutoComposeData | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 试卷基础信息
  const [form, setForm] = useState({ title: '', durationMinutes: '90', totalScore: '100', passScore: '60' });

  // 理论题选择: { [questionType]: { enabled: boolean, count: string } }
  const [theoryConfig, setTheoryConfig] = useState<Record<string, { enabled: boolean; count: string }>>({});
  // 实操题选择: { [taskType]: { enabled: boolean, count: string } }
  const [taskConfig, setTaskConfig] = useState<Record<string, { enabled: boolean; count: string }>>({});

  // 打开 Dialog 时加载可用数量
  const loadAvailability = useCallback(async () => {
    setLoadingAvail(true);
    const qs = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    const r = await apiFetch<AutoComposeData>(`/api/admin/papers/auto-compose${qs}`);
    if (r.ok && r.data) {
      setAvailability(r.data);
      // 初始化配置
      const tConfig: Record<string, { enabled: boolean; count: string }> = {};
      for (const q of r.data.questions) {
        tConfig[q.questionType] = { enabled: false, count: q.available > 0 ? '5' : '0' };
      }
      setTheoryConfig(tConfig);

      const tkConfig: Record<string, { enabled: boolean; count: string }> = {};
      for (const t of r.data.tasks) {
        if (t.available > 0) tkConfig[t.taskType] = { enabled: false, count: '1' };
      }
      setTaskConfig(tkConfig);
    } else {
      toast.error('获取题库可用数量失败', { description: r.error });
    }
    setLoadingAvail(false);
  }, [organizationId]);

  useEffect(() => {
    // organizationId===null 表示超管还没选机构, 此时不能请求(后端会报"账号未绑定机构")。
    if (open && organizationId !== null) void loadAvailability();
  }, [open, organizationId, loadAvailability]);

  // 统计选中总数
  const summary = useMemo(() => {
    let theoryCount = 0;
    let taskCount = 0;
    for (const [, cfg] of Object.entries(theoryConfig)) {
      if (cfg.enabled) theoryCount += Math.max(0, Number(cfg.count) || 0);
    }
    for (const [, cfg] of Object.entries(taskConfig)) {
      if (cfg.enabled) taskCount += Math.max(0, Number(cfg.count) || 0);
    }
    return { theoryCount, taskCount, total: theoryCount + taskCount };
  }, [theoryConfig, taskConfig]);

  const handleCompose = async () => {
    const total = Number(form.totalScore);
    const pass = Number(form.passScore);
    const duration = Number(form.durationMinutes);
    if (!form.title.trim()) return toast.error('请填写试卷标题');
    if (!Number.isFinite(total) || total <= 0) return toast.error('总分不正确');
    if (!Number.isFinite(pass) || pass < 0 || pass > total) return toast.error('及格分不正确');
    if (!Number.isFinite(duration) || duration < 5) return toast.error('时长不正确');
    if (summary.total === 0) return toast.error('请至少选择一种题型或实操类型');

    const theorySelections = Object.entries(theoryConfig)
      .filter(([, cfg]) => cfg.enabled && Number(cfg.count) > 0)
      .map(([questionType, cfg]) => ({ questionType, count: Number(cfg.count) }));

    const taskSelections = Object.entries(taskConfig)
      .filter(([, cfg]) => cfg.enabled && Number(cfg.count) > 0)
      .map(([taskType, cfg]) => ({ taskType, count: Number(cfg.count) }));

    setSubmitting(true);
    const r = await apiFetch<{ id: string; itemCount: number; questionCount: number; taskCount: number }>('/api/admin/papers/auto-compose', {
      method: 'POST',
      body: {
        title: form.title.trim(),
        durationMinutes: duration,
        totalScore: total,
        passScore: pass,
        theorySelections,
        taskSelections,
        ...(organizationId ? { organizationId } : {}),
      },
    });
    setSubmitting(false);
    if (!r.ok || !r.data) return toast.error('智能组卷失败', { description: r.error });

    toast.success(`试卷草稿已创建！理论题 ${r.data.questionCount} 道、实操题 ${r.data.taskCount} 道，分值已自动均分`, {
      description: '请在试卷列表点击「发布」后即可安排考试',
    });
    // 重置
    setForm({ title: '', durationMinutes: '90', totalScore: '100', passScore: '60' });
    onOpenChange(false);
    onCreated();
  };

  const toggleTheory = (qt: string) => {
    setTheoryConfig(prev => ({ ...prev, [qt]: { ...prev[qt], enabled: !prev[qt]?.enabled } }));
  };
  const setTheoryCount = (qt: string, count: string) => {
    setTheoryConfig(prev => ({ ...prev, [qt]: { ...prev[qt], count } }));
  };
  const toggleTask = (tt: string) => {
    setTaskConfig(prev => ({ ...prev, [tt]: { ...prev[tt], enabled: !prev[tt]?.enabled } }));
  };
  const setTaskCount = (tt: string, count: string) => {
    setTaskConfig(prev => ({ ...prev, [tt]: { ...prev[tt], count } }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-primary" />
            一键智能组卷
          </DialogTitle>
          <DialogDescription>
            选择题型和数量，系统从考试库随机抽题并自动均分分值。创建后仍为草稿状态，需手动发布。
          </DialogDescription>
        </DialogHeader>

        {/* 试卷基础信息 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="ac-title">试卷标题</Label>
            <Input id="ac-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="如：2026年第三期考试" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-duration">时长（分钟）</Label>
            <Input id="ac-duration" type="number" value={form.durationMinutes} onChange={e => setForm({ ...form, durationMinutes: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-pass">及格分</Label>
            <Input id="ac-pass" type="number" value={form.passScore} onChange={e => setForm({ ...form, passScore: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ac-total">总分</Label>
            <Input id="ac-total" type="number" value={form.totalScore} onChange={e => setForm({ ...form, totalScore: e.target.value })} />
          </div>
        </div>

        {organizationId === null ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            超级管理员账号不隶属于任何机构，请先在试卷管理页顶部的「组卷机构」中选择要代为组卷的机构。
          </div>
        ) : loadingAvail ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* 理论题区域 */}
            <div>
              <h3 className="text-base font-semibold mb-2">理论题 — 按题型输入数量</h3>
              <div className="space-y-2">
                {(availability?.questions ?? []).map(q => {
                  const cfg = theoryConfig[q.questionType] ?? { enabled: false, count: '0' };
                  const disabled = q.available === 0;
                  return (
                    <div
                      key={q.questionType}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${cfg.enabled ? 'border-primary/40 bg-primary/5' : 'border-border'} ${disabled ? 'opacity-50' : ''}`}
                    >
                      <Checkbox
                        checked={cfg.enabled}
                        disabled={disabled}
                        onCheckedChange={() => toggleTheory(q.questionType)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{q.label}</span>
                        <span className="ml-2 text-sm text-muted-foreground">
                          题库可用 <span className={q.available > 0 ? 'text-primary font-medium' : ''}>{q.available}</span> 道
                        </span>
                      </div>
                      {cfg.enabled && (
                        <div className="flex items-center gap-2">
                          <Label className="text-sm text-muted-foreground whitespace-nowrap">抽题数量</Label>
                          <Input
                            type="number"
                            min={1}
                            max={q.available}
                            value={cfg.count}
                            onChange={e => setTheoryCount(q.questionType, e.target.value)}
                            className="w-20"
                          />
                        </div>
                      )}
                      {disabled && <Badge variant="secondary">暂无题目</Badge>}
                    </div>
                  );
                })}
                {(availability?.questions ?? []).every(q => q.available === 0) && (
                  <p className="text-sm text-muted-foreground py-2 px-3">考试题库暂无已发布的理论题，请先在考试题库中录入并审核发布。</p>
                )}
              </div>
            </div>

            {/* 实操题区域 */}
            <div>
              <h3 className="text-base font-semibold mb-2">实操题 — 勾选类型并设置数量</h3>
              <div className="space-y-2">
                {(availability?.tasks ?? []).filter(t => t.available > 0).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 px-3">考试实操库暂无已发布的实操任务，请先在实操题库中录入并审核发布。</p>
                ) : (
                  (availability?.tasks ?? []).filter(t => t.available > 0).map(t => {
                    const cfg = taskConfig[t.taskType] ?? { enabled: false, count: '1' };
                    const label = TASK_TYPE_LABELS[t.taskType] ?? t.taskType;
                    return (
                      <div
                        key={t.taskType}
                        className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${cfg.enabled ? 'border-primary/40 bg-primary/5' : 'border-border'}`}
                      >
                        <Checkbox
                          checked={cfg.enabled}
                          onCheckedChange={() => toggleTask(t.taskType)}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{label}</span>
                          <span className="ml-2 text-sm text-muted-foreground">
                            可用 <span className="text-primary font-medium">{t.available}</span> 道
                          </span>
                        </div>
                        {cfg.enabled && (
                          <div className="flex items-center gap-2">
                            <Label className="text-sm text-muted-foreground whitespace-nowrap">数量</Label>
                            <Input
                              type="number"
                              min={1}
                              max={Math.min(t.available, 10)}
                              value={cfg.count}
                              onChange={e => setTaskCount(t.taskType, e.target.value)}
                              className="w-20"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 汇总 */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
              <div className="text-sm">
                已选 <span className="text-lg font-bold text-primary">{summary.total}</span> 题
                <span className="text-muted-foreground ml-2">
                  （理论 {summary.theoryCount} + 实操 {summary.taskCount}）
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {summary.total > 0 && `每题约 ${(Number(form.totalScore) / summary.total).toFixed(1)} 分（自动均分）`}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleCompose} disabled={organizationId === null || submitting || loadingAvail || summary.total === 0}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {submitting ? '组卷中...' : '一键组卷'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
