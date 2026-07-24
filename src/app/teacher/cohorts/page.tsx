'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/session-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Cohort { id:string;name:string;status:string;startAt:string|null;endAt:string|null;projectName:string|null;studentCount:number;assignmentCount:number;examCount:number }
export default function TeacherCohortsPage(){
 const [items,setItems]=useState<Cohort[]>([]);const [loading,setLoading]=useState(true);
 useEffect(()=>{void apiFetch<{items:Cohort[]}>('/api/teacher/cohorts').then(r=>{if(r.ok&&r.data)setItems(r.data.items);else toast.error(r.error??'加载失败');setLoading(false)})},[]);
 return <div className="space-y-6"><div><h1 className="text-2xl font-bold">我的班级</h1><p className="mt-1 text-muted-foreground">仅显示管理员授权给你的班级及其教学数据。</p></div>{loading?<div className="py-12 text-center">加载中…</div>:items.length===0?<Card><CardContent className="py-12 text-center text-muted-foreground">暂无授权班级，请联系学校管理员。</CardContent></Card>:<div className="grid gap-4 lg:grid-cols-2">{items.map(item=><Card key={item.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{item.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{item.projectName??'未关联培训项目'}</p></div><Badge variant={item.status==='active'?'default':'secondary'}>{item.status==='active'?'进行中':item.status}</Badge></div></CardHeader><CardContent className="grid grid-cols-3 gap-4 text-center"><div><div className="text-2xl font-bold">{item.studentCount}</div><div className="text-sm text-muted-foreground">学员</div></div><div><div className="text-2xl font-bold">{item.assignmentCount}</div><div className="text-sm text-muted-foreground">练习作业</div></div><div><div className="text-2xl font-bold">{item.examCount}</div><div className="text-sm text-muted-foreground">考试</div></div></CardContent></Card>)}</div>}</div>
}
