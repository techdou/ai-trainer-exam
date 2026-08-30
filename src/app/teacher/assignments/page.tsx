'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
interface Assignment{id:string;cohortName:string;title:string;itemType:string;dueAt:string|null;attemptCount:number;passedCount:number}
interface Cohort{id:string;name:string;organization_id:string}
interface Task{id:string;title:string;taskType:string;organizationId:string|null}
export default function TeacherAssignmentsPage(){
 const [items,setItems]=useState<Assignment[]>([]);const [cohorts,setCohorts]=useState<Cohort[]>([]);const [tasks,setTasks]=useState<Task[]>([]);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [form,setForm]=useState({cohortId:'',taskId:'',dueAt:''});
 const load=useCallback(async()=>{setLoading(true);const [a,o]=await Promise.all([apiFetch<{items:Assignment[]}>('/api/teacher/assignments'),apiFetch<{cohorts:Cohort[];tasks:Task[]}>('/api/teacher/assignment-options')]);if(a.ok&&a.data)setItems(a.data.items);else toast.error(a.error??'加载失败');if(o.ok&&o.data){setCohorts(o.data.cohorts);setTasks(o.data.tasks);setForm(v=>({...v,cohortId:v.cohortId||o.data?.cohorts[0]?.id||'',taskId:v.taskId||o.data?.tasks[0]?.id||''}))}setLoading(false)},[]);useEffect(()=>{void load()},[load]);
 const [batchCohort,setBatchCohort]=useState('');const [batchSel,setBatchSel]=useState<string[]>([]);const [batchBusy,setBatchBusy]=useState(false);
async function batchAssign(){
  if(!batchCohort||batchSel.length===0){toast.error('请选择班级并至少勾选一个练习');return}
  setBatchBusy(true);let ok=0,dup=0,fail=0;
  for(const taskId of batchSel){
    const task=tasks.find(t=>t.id===taskId);
    const r=await apiFetch('/api/teacher/assignments',{method:'POST',body:{cohortId:batchCohort,itemType:'task_template',itemId:taskId,title:task?.title,dueAt:null}});
    if(r.ok)ok++;else if(r.status===409)dup++;else fail++;
  }
  setBatchBusy(false);
  toast.success(`批量布置完成：成功 ${ok}，已存在 ${dup}${fail?`，失败 ${fail}`:''}`);
  setBatchSel([]);await load();
}
async function create(){if(!form.cohortId||!form.taskId){toast.error('请选择班级和练习');return}setSaving(true);const task=tasks.find(t=>t.id===form.taskId);const r=await apiFetch('/api/teacher/assignments',{method:'POST',body:{cohortId:form.cohortId,itemType:'task_template',itemId:form.taskId,title:task?.title,dueAt:form.dueAt?new Date(form.dueAt).toISOString():null}});setSaving(false);if(!r.ok){toast.error(r.error??'布置失败');return}toast.success('练习已布置');setForm(v=>({...v,dueAt:''}));await load()}
 return <div className="space-y-6"><div><h1 className="text-2xl font-bold">练习作业</h1><p className="mt-1 text-muted-foreground">给授权班级布置已审核发布的练习，正式考试内容不会出现在此处。</p></div><Card><CardHeader><CardTitle>布置实操练习</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label>班级</Label><Select value={form.cohortId} onValueChange={cohortId=>setForm(v=>({...v,cohortId}))}><SelectTrigger><SelectValue placeholder="选择班级"/></SelectTrigger><SelectContent>{cohorts.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>练习内容</Label><Select value={form.taskId} onValueChange={taskId=>setForm(v=>({...v,taskId}))}><SelectTrigger><SelectValue placeholder="选择练习"/></SelectTrigger><SelectContent>{tasks.map(t=><SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>截止时间（可选）</Label><Input type="datetime-local" value={form.dueAt} onChange={e=>setForm(v=>({...v,dueAt:e.target.value}))}/></div><div className="md:col-span-3"><Button onClick={create} disabled={saving||cohorts.length===0||tasks.length===0}>{saving?'布置中…':'布置练习'}</Button></div></CardContent></Card><Card><CardHeader><CardTitle>批量布置（开放给班级）</CardTitle></CardHeader><CardContent className="space-y-4">
<div className="space-y-2"><Label>班级</Label><Select value={batchCohort} onValueChange={setBatchCohort}><SelectTrigger><SelectValue placeholder="选择班级"/></SelectTrigger><SelectContent>{cohorts.map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
<div className="space-y-2"><div className="flex items-center justify-between"><Label>练习内容（已选 {batchSel.length}/{tasks.length}）</Label>
<button type="button" className="text-sm text-primary hover:underline" onClick={()=>setBatchSel(batchSel.length===tasks.length?[]:tasks.map(t=>t.id))}>{batchSel.length===tasks.length?'取消全选':'全选'}</button></div>
<div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
{tasks.map(t=>(<label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
<input type="checkbox" checked={batchSel.includes(t.id)} onChange={()=>setBatchSel(v=>v.includes(t.id)?v.filter(x=>x!==t.id):[...v,t.id])} className="h-4 w-4"/>
<span className="flex-1">{t.title}</span></label>))}
</div></div>
<Button onClick={batchAssign} disabled={batchBusy||tasks.length===0}>{batchBusy?'布置中…':`布置 ${batchSel.length} 个练习到所选班级`}</Button>
</CardContent></Card>
{loading?<div className="py-12 text-center">加载中…</div>:items.length===0?<Card><CardContent className="py-12 text-center text-muted-foreground">暂无练习作业</CardContent></Card>:items.map(item=>{const rate=item.attemptCount?Math.round(item.passedCount/item.attemptCount*100):0;return <Card key={item.id}><CardContent className="space-y-3 py-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-lg font-medium">{item.title}</div><div className="text-sm text-muted-foreground">{item.cohortName} · {item.itemType==='task_template'?'实操练习':'理论练习'}{item.dueAt?` · 截止 ${new Date(item.dueAt).toLocaleString('zh-CN')}`:''}</div></div><div className="font-medium">{item.passedCount}/{item.attemptCount} 通过</div></div><Progress value={rate}/><div className="text-sm text-muted-foreground">通过率 {rate}%</div></CardContent></Card>})}</div>}
