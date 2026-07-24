'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileText, Plus, Send, Archive } from 'lucide-react';

interface Paper { id:string; title:string; paperKind:string; totalScore:number; passScore:number; durationMinutes:number; status:string; version:number; itemCount:number; createdAt:string }
interface Question { id:string; question_type:string; stem:string; difficulty:number; knowledge_point:string|null }
interface Task { id:string; taskType:string; title:string; difficulty:number; instructions?:string }
type SourceItem = { key:string; itemType:'question'|'task'; itemId:string; title:string; section:'theory'|'cleaning'|'image_annotation'|'text_annotation'|'audio'|'statistics' };

function sectionForTask(type:string): SourceItem['section'] {
  if (['image_annotation','bounding_box','point_annotation','polyline_annotation','polygon_annotation'].includes(type)) return 'image_annotation';
  if (['text_sentiment','data_labeling'].includes(type)) return 'text_annotation';
  if (type === 'audio_transcription') return 'audio';
  if (type === 'stats_table') return 'statistics';
  return 'cleaning';
}

export default function PapersPage() {
  const [papers,setPapers]=useState<Paper[]>([]); const [questions,setQuestions]=useState<Question[]>([]); const [tasks,setTasks]=useState<Task[]>([]);
  const [loading,setLoading]=useState(true); const [showCreate,setShowCreate]=useState(false); const [selected,setSelected]=useState<Set<string>>(new Set());
  const [form,setForm]=useState({title:'',durationMinutes:'90',totalScore:'100',passScore:'60'});

  const load=useCallback(async()=>{
    setLoading(true);
    const [pr,qr,tr]=await Promise.all([
      apiFetch<Paper[]>('/api/admin/papers'),
      apiFetch<{items:Question[]}>('/api/admin/questions?bank_type=exam&status=published&page_size=100'),
      apiFetch<Task[]>('/api/admin/task-templates?bankType=exam&status=published'),
    ]);
    if(pr.ok&&pr.data)setPapers(pr.data); if(qr.ok&&qr.data)setQuestions(qr.data.items??[]); if(tr.ok&&tr.data)setTasks(tr.data);
    setLoading(false);
  },[]);
  useEffect(()=>{void load()},[load]);

  const sources=useMemo<SourceItem[]>(()=>[
    ...questions.map(q=>({key:`question:${q.id}`,itemType:'question' as const,itemId:q.id,title:q.stem,section:'theory' as const})),
    ...tasks.map(t=>({key:`task:${t.id}`,itemType:'task' as const,itemId:t.id,title:t.title,section:sectionForTask(t.taskType)})),
  ],[questions,tasks]);

  const toggle=(key:string)=>setSelected(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n});
  const create=async()=>{
    const total=Number(form.totalScore),pass=Number(form.passScore),duration=Number(form.durationMinutes);
    if(!form.title.trim()||!selected.size)return toast.error('请填写标题并至少选择一道题目或实操任务');
    if(!Number.isFinite(total)||total<=0||!Number.isFinite(pass)||pass<0||pass>total)return toast.error('总分或及格分不正确');
    const items=sources.filter(s=>selected.has(s.key)).map(s=>({itemType:s.itemType,itemId:s.itemId,section:s.section}));
    const r=await apiFetch<{id:string}>('/api/admin/papers',{method:'POST',body:{title:form.title.trim(),durationMinutes:duration,totalScore:total,passScore:pass,items}});
    if(!r.ok)return toast.error('创建失败',{description:r.error});
    toast.success('试卷草稿已创建并冻结题目版本'); setShowCreate(false);setSelected(new Set());setForm({title:'',durationMinutes:'90',totalScore:'100',passScore:'60'});void load();
  };
  const action=async(paperId:string,kind:'publish'|'retire')=>{
    const r=await apiFetch('/api/admin/papers',{method:'PATCH',body:{paperId,action:kind}});
    if(!r.ok)return toast.error('操作失败',{description:r.error}); toast.success(kind==='publish'?'试卷已发布':'试卷已退役');void load();
  };

  if(loading)return <div className="py-12 text-center text-lg text-muted-foreground">正在加载试卷与题库…</div>;
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">试卷管理</h1><p className="text-muted-foreground mt-1">仅可选用已审核发布的考试库题目；创建后会冻结答案与评分器版本。</p></div><Button size="lg" onClick={()=>setShowCreate(v=>!v)}><Plus className="w-5 h-5 mr-2"/>新建正式试卷</Button></div>
    {showCreate&&<Card><CardHeader><CardTitle>创建试卷</CardTitle></CardHeader><CardContent className="space-y-5">
      <div className="grid md:grid-cols-4 gap-4"><Input className="md:col-span-2" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="试卷标题"/><Input type="number" value={form.durationMinutes} onChange={e=>setForm({...form,durationMinutes:e.target.value})} placeholder="时长（分钟）"/><Input type="number" value={form.totalScore} onChange={e=>setForm({...form,totalScore:e.target.value})} placeholder="总分"/><Input type="number" value={form.passScore} onChange={e=>setForm({...form,passScore:e.target.value})} placeholder="及格分"/></div>
      <div className="rounded-lg border max-h-[480px] overflow-auto divide-y">
        {sources.length===0?<div className="p-8 text-center text-muted-foreground">考试库暂无已发布题目。请先在考试题库完成审核发布。</div>:sources.map(s=><label key={s.key} className="flex gap-3 p-3 cursor-pointer hover:bg-muted/40"><Checkbox checked={selected.has(s.key)} onCheckedChange={()=>toggle(s.key)}/><div className="min-w-0"><div className="font-medium line-clamp-2">{s.title}</div><div className="text-sm text-muted-foreground">{s.itemType==='question'?'理论题':'实操题'} · {s.section}</div></div></label>)}
      </div>
      <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">已选择 {selected.size} 项，未单独设置分值时系统将精确均分且保证总分不丢失。</span><div className="flex gap-2"><Button variant="outline" onClick={()=>setShowCreate(false)}>取消</Button><Button onClick={create}>创建草稿</Button></div></div>
    </CardContent></Card>}
    <div className="space-y-3">{papers.length===0?<Card><CardContent className="py-12 text-center text-muted-foreground">暂无试卷</CardContent></Card>:papers.map(p=><Card key={p.id}><CardContent className="py-4 flex flex-wrap items-center justify-between gap-4"><div className="flex gap-4 items-center"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><FileText className="w-6 h-6 text-primary"/></div><div><div className="text-lg font-semibold">{p.title}</div><div className="text-muted-foreground">{p.itemCount} 项 · 满分 {p.totalScore} · 及格 {p.passScore} · {p.durationMinutes} 分钟 · v{p.version}</div></div></div><div className="flex gap-2 items-center"><Badge variant={p.status==='published'?'default':'secondary'}>{p.status==='draft'?'草稿':p.status==='published'?'已发布':p.status==='retired'?'已退役':p.status}</Badge>{p.status==='draft'&&<Button size="sm" onClick={()=>action(p.id,'publish')}><Send className="w-4 h-4 mr-1"/>发布</Button>}{p.status!=='retired'&&<Button size="sm" variant="outline" onClick={()=>action(p.id,'retire')}><Archive className="w-4 h-4 mr-1"/>退役</Button>}</div></CardContent></Card>)}</div>
  </div>;
}
