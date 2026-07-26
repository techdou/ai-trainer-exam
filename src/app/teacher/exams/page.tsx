'use client';
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/session-client';
import { EXAM_STATUS_LABELS, type ExamStatus } from '@/lib/constants';

interface Exam { id:string;title:string;cohort_id:string;exam_start_at:string;exam_end_at:string;late_entry_minutes:number;status:string;paper_id:string;paper_title?:string;duration_minutes?:number }
export default function TeacherExamsPage(){
 const [items,setItems]=useState<Exam[]>([]);const [loading,setLoading]=useState(true);
 const load=useCallback(async()=>{const r=await apiFetch<{items:Exam[]}>('/api/teacher/exams');if(r.ok&&r.data)setItems(r.data.items);else toast.error(r.error??'加载失败');setLoading(false)},[]);useEffect(()=>{void load()},[load]);
 // 状态标签统一用 constants 的真实状态机映射(历史上硬编码的 in_progress/ended/closed 均不存在, exam_closed 无标签)。
 const labels:Record<string,string>=EXAM_STATUS_LABELS as Record<string,string>;
 return <div className="space-y-6"><div><h1 className="text-2xl font-bold">考试安排</h1><p className="text-muted-foreground mt-1">教师可查看授权班级的考试。为保证试卷冻结与审计，正式考试由学校管理员统一创建和发布。</p></div>{loading?<div className="py-12 text-center">加载中…</div>:items.length===0?<Card><CardContent className="py-12 text-center text-muted-foreground">暂无授权考试安排</CardContent></Card>:items.map(e=><Card key={e.id}><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{e.title}</CardTitle><Badge>{labels[e.status]??e.status}</Badge></div></CardHeader><CardContent className="grid md:grid-cols-4 gap-4"><div><div className="text-sm text-muted-foreground">试卷</div><div>{e.paper_title??e.paper_id}</div></div><div><div className="text-sm text-muted-foreground">开始</div><div>{new Date(e.exam_start_at).toLocaleString('zh-CN')}</div></div><div><div className="text-sm text-muted-foreground">结束</div><div>{new Date(e.exam_end_at).toLocaleString('zh-CN')}</div></div><div><div className="text-sm text-muted-foreground">迟到入场</div><div>{e.late_entry_minutes} 分钟</div></div></CardContent></Card>)}</div>
}
