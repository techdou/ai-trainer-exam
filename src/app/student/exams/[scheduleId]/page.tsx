'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ExamTaskInput } from '@/components/exam-task-input';
import { DialogueView } from '@/components/dialogue-bubble';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { apiFetch } from '@/lib/session-client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ExamItem {
  id: string;
  itemType: 'question'|'task';
  sortOrder: number;
  score: number;
  section: string;
  content: Record<string, unknown>;
}
interface ExamPayload {
  attemptId:string;
  scheduleId:string;
  serverNow:string;
  serverDeadline:string;
  durationMinutes:number;
  items:ExamItem[];
  savedResponses:Record<string,unknown>;
}

function answered(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (!value || typeof value !== 'object') return false;
  return Object.keys(value as Record<string,unknown>).length > 0;
}

export default function ExamTakePage() {
  const { scheduleId } = useParams<{ scheduleId:string }>();
  const router = useRouter();
  const [payload,setPayload]=useState<ExamPayload|null>(null);
  const [responses,setResponses]=useState<Record<string,unknown>>({});
  const [index,setIndex]=useState(0);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [receipt,setReceipt]=useState<string|null>(null);
  const [serverOffset,setServerOffset]=useState(0);
  const [loadError,setLoadError]=useState('');
  // 手动交卷确认框: 零基础学员误触即终局, 必须二次确认; 倒计时归零的自动交卷不走此框。
  const [confirmOpen,setConfirmOpen]=useState(false);
  // 自动保存失败需常驻提示(一次性 toast 易被错过), 下次保存成功即清除。
  const [saveError,setSaveError]=useState('');
  const tenMinHintShownRef=useRef(false);
  // null = 倒计时尚未初始化; 仅当初始化后归零才触发自动交卷,避免试卷刚加载时误交白卷。
  const [timeLeft,setTimeLeft]=useState<number|null>(null);
  const dirtyRef=useRef(new Set<string>());
  const responseVersionRef=useRef(new Map<string,number>());
  const flushPromiseRef=useRef<Promise<boolean>|null>(null);
  const saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

  // 用 ref 承载高频变化的状态,让 flush/submit/定时器引用稳定,避免每答一题重建全部定时器。
  const payloadRef=useRef<ExamPayload|null>(null);
  const responsesRef=useRef<Record<string,unknown>>({});
  const receiptRef=useRef<string|null>(null);
  const submittingRef=useRef(false);
  const idemKeyRef=useRef<string|null>(null);
  useEffect(()=>{payloadRef.current=payload},[payload]);
  useEffect(()=>{responsesRef.current=responses},[responses]);
  useEffect(()=>{receiptRef.current=receipt},[receipt]);

  const load=useCallback(async()=>{
    setLoading(true);setLoadError('');
    const start=await apiFetch<{attemptId:string;serverDeadline:string}>('/api/student/exams/start',{method:'POST',body:{scheduleId}});
    if(!start.ok||!start.data){setLoadError(start.error??'无法开始考试');setLoading(false);return;}
    const result=await apiFetch<ExamPayload>(`/api/student/exams/questions?scheduleId=${encodeURIComponent(scheduleId)}`);
    // start 幂等(重复进入返回同一 attempt), 试卷加载失败可直接重试, 不会重复开考。
    if(!result.ok||!result.data){setLoadError(result.error??'试卷加载失败,请点击重试');setLoading(false);return;}
    if(result.data.attemptId!==start.data.attemptId){setLoadError('考试状态异常,请返回列表重试');setLoading(false);return;}
    setPayload(result.data);
    setResponses(result.data.savedResponses??{});
    dirtyRef.current.clear();
    responseVersionRef.current.clear();
    setServerOffset(new Date(result.data.serverNow).getTime()-Date.now());
    // 幂等键按 attempt 固定:重复交卷/断网重试时服务端可识别为同一次提交。
    idemKeyRef.current=`submit-${result.data.attemptId}`;
    setLoading(false);
  },[scheduleId]);
  useEffect(()=>{void load()},[load]);

  const flush=useCallback(async(keepalive=false)=>{
    if(flushPromiseRef.current)await flushPromiseRef.current;
    const p=payloadRef.current;
    if(!p||dirtyRef.current.size===0||receiptRef.current)return true;
    const ids=[...dirtyRef.current];
    const sentVersions=new Map(ids.map(id=>[id,responseVersionRef.current.get(id)??0]));
    const body=ids.map(itemId=>({itemId,response:responsesRef.current[itemId]??{},workspaceSnapshot:responsesRef.current[itemId]??{}}));
    const savePromise=(async()=>{
      setSaving(true);
      try{
        const result=await apiFetch<{saved:number}>('/api/student/exams/save',{method:'POST',body:{scheduleId,attemptId:p.attemptId,responses:body},keepalive});
        if(result.ok){
          setSaveError('');
          ids.forEach(id=>{
            if(responseVersionRef.current.get(id)===sentVersions.get(id))dirtyRef.current.delete(id);
          });
          return true;
        }
        setSaveError(result.error??'保存失败');
        toast.error('自动保存失败',{description:result.error});return false;
      }finally{setSaving(false)}
    })();
    flushPromiseRef.current=savePromise;
    try{return await savePromise}
    finally{if(flushPromiseRef.current===savePromise)flushPromiseRef.current=null}
  },[scheduleId]);

  // 答题后 1.2s 防抖保存
  useEffect(()=>{
    if(!payload||receipt)return;
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>void flush(),1200);
    return()=>{if(saveTimer.current)clearTimeout(saveTimer.current)};
  },[responses,payload,receipt,flush]);
  // 15s 周期兜底保存
  useEffect(()=>{
    if(!payload||receipt)return;
    const timer=setInterval(()=>void flush(),15_000);
    return()=>clearInterval(timer);
  },[payload,receipt,flush]);
  // 离开页面/切后台时尽力保存,避免丢失最近作答(keepalive 允许请求在页面卸载后继续完成)
  useEffect(()=>{
    if(!payload||receipt)return;
    const onUnload=()=>{void flush(true)};
    const onVisibility=()=>{if(document.visibilityState==='hidden')void flush(true)};
    window.addEventListener('beforeunload',onUnload);
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{window.removeEventListener('beforeunload',onUnload);document.removeEventListener('visibilitychange',onVisibility)};
  },[payload,receipt,flush]);
  useEffect(()=>{
    if(!payload||receipt)return;
    const ping=()=>void apiFetch('/api/student/exams/heartbeat',{method:'POST',body:{scheduleId,attemptId:payload.attemptId,clientOffsetMs:serverOffset}});
    ping();const timer=setInterval(ping,30_000);return()=>clearInterval(timer);
  },[payload,receipt,scheduleId,serverOffset]);
  useEffect(()=>{
    if(!payload||receipt)return;
    const update=()=>{const left=Math.max(0,Math.floor((new Date(payload.serverDeadline).getTime()-(Date.now()+serverOffset))/1000));setTimeLeft(left);
      // 剩 10 分钟温和提醒一次(提前于 5 分钟强警告), 零基础学员答题慢, 5 分钟才警告等于突然死刑。
      if(left>0&&left<=600&&!tenMinHintShownRef.current){tenMinHintShownRef.current=true;toast.info('还有 10 分钟，没答的题先写个大概')}}
    ;update();const timer=setInterval(update,1000);return()=>clearInterval(timer);
  },[payload,receipt,serverOffset]);

  const submit=useCallback(async()=>{
    const p=payloadRef.current;
    // 同步 ref 锁:快速双击/倒计时归零与手动交卷并发时只放行一次。
    if(!p||submittingRef.current||receiptRef.current)return;
    submittingRef.current=true;setSubmitting(true);
    try{
      await flush();
      const result=await apiFetch<{receipt:string;message:string}>('/api/student/exams/submit',{method:'POST',body:{scheduleId,attemptId:p.attemptId,idempotencyKey:idemKeyRef.current??`submit-${p.attemptId}`,responses:Object.entries(responsesRef.current).map(([itemId,response])=>({itemId,response,workspaceSnapshot:response}))}});
      if(!result.ok||!result.data){toast.error('交卷失败',{description:result.error});return;}
      setReceipt(result.data.receipt);toast.success('交卷成功');
    }finally{
      submittingRef.current=false;setSubmitting(false);
    }
  },[flush,scheduleId]);
  useEffect(()=>{if(payload&&timeLeft!==null&&timeLeft<=0&&!receipt)void submit()},[payload,timeLeft,receipt,submit]);

  const change=(itemId:string,value:unknown)=>{
    responseVersionRef.current.set(itemId,(responseVersionRef.current.get(itemId)??0)+1);
    dirtyRef.current.add(itemId);
    setResponses(prev=>({...prev,[itemId]:value}));
  };
  const count=useMemo(()=>Object.values(responses).filter(answered).length,[responses]);
  // 未答题号列表(items 顺序即题号), 供交卷确认框展示。
  const unanswered=useMemo(()=>payload?payload.items.map((x,i)=>({x,i})).filter(({x})=>!answered(responses[x.id])).map(({i})=>i+1):[],[payload,responses]);

  if(loading)return <div className="flex min-h-[60vh] items-center justify-center text-lg text-muted-foreground">正在安全加载试卷…</div>;
  // 开考是幂等的, 试卷加载失败可直接重试(不会重复创建考试记录)。
  if(loadError)return <div className="mx-auto max-w-lg py-16 text-center"><p className="mb-4 text-lg">{loadError}</p><div className="flex justify-center gap-3"><Button onClick={()=>void load()}>重新加载</Button><Button variant="outline" onClick={()=>router.push('/student/exams')}>返回考试列表</Button></div></div>;
  if(!payload)return <div className="mx-auto max-w-lg py-16 text-center"><p className="mb-4 text-lg">无法进入考试，请返回考试列表查看开放时间。</p><Button onClick={()=>router.push('/student/exams')}>返回考试列表</Button></div>;
  if(receipt)return <div className="mx-auto max-w-xl py-16 text-center"><div className="mb-4 text-6xl text-success" aria-hidden>✓</div><h1 className="mb-3 text-2xl font-bold">交卷成功</h1><p className="mb-2 text-muted-foreground">成绩将在学校审核并发布后显示。</p><p className="mb-8 break-all text-xs text-muted-foreground">交卷回执：{receipt}</p><Button size="lg" onClick={()=>router.replace('/student/exams')}>返回考试列表</Button></div>;

  const item=payload.items[index];
  if(!item)return <div className="py-16 text-center">试卷没有可作答内容，请联系考务人员。</div>;
  const current=responses[item.id];
  const selected=typeof current==='string'?current:String((current as {answer?:unknown;selectedOption?:unknown}|undefined)?.answer??(current as {selectedOption?:unknown}|undefined)?.selectedOption??'');
  const lowTime=timeLeft!==null&&timeLeft<300;

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-28">
      <ExamStickyBar
        index={index}
        total={payload.items.length}
        count={count}
        saving={saving}
        saveError={saveError}
        lowTime={lowTime}
        timeLeft={timeLeft}
      />
      <Card>
        <CardContent className="space-y-6 p-6 sm:p-8">
          <QuestionCard item={item} current={current} selected={selected} onChange={change} />
        </CardContent>
      </Card>
      <QuestionNav items={payload.items} responses={responses} index={index} onJump={setIndex} />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">交卷后不能修改，请检查未完成项目。</span>
          <Button size="lg" disabled={submitting} onClick={()=>setConfirmOpen(true)}>
            {submitting?'正在交卷…':`确认交卷（${count}/${payload.items.length}）`}
          </Button>
        </div>
      </div>
      <SubmitConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        unanswered={unanswered}
        submitting={submitting}
        onConfirm={()=>{setConfirmOpen(false);void submit()}}
      />
    </div>
  );
}

// ─── 展示子组件(纯展示, 状态与业务逻辑留在页面组件) ────────────

/** 顶部粘性条: 进度 + 保存状态 + 倒计时 */
function ExamStickyBar({
  index,
  total,
  count,
  saving,
  saveError,
  lowTime,
  timeLeft,
}: {
  index: number;
  total: number;
  count: number;
  saving: boolean;
  saveError: string;
  lowTime: boolean;
  timeLeft: number | null;
}) {
  const format=(seconds:number)=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 px-5 py-3 backdrop-blur">
      <strong>第 {index+1}/{total} 项</strong>
      <span>已完成 {count}/{total}</span>
      <span className="text-sm text-muted-foreground">{saveError?'':saving?'正在保存…':'答案自动保存，放心做题'}</span>
      {saveError&&<span className="text-sm font-medium text-destructive" role="alert">⚠ 保存失败：{saveError}。恢复网络后会自动重存，持续失败请举手告诉老师</span>}
      <span className="flex items-center gap-2">
        {lowTime&&<span className="text-sm font-medium text-destructive" role="alert">⚠ 时间不多了，请检查未答项目</span>}
        <strong className={cn('text-xl tabular-nums',lowTime?'text-destructive':'text-primary')} aria-label="剩余时间">
          {timeLeft===null?'--:--':format(timeLeft)}
        </strong>
      </span>
    </div>
  );
}

/** 单个题目/任务的题干与作答区 */
function QuestionCard({
  item,
  current,
  selected,
  onChange,
}: {
  item: ExamItem;
  current: unknown;
  selected: string;
  onChange: (itemId: string, value: unknown) => void;
}) {
  const questionType=String(item.content.questionType??'');
  const isFillIn=questionType==='fill_in_blank';
  const isPromptDesc=questionType==='prompt_description';
  const isDialogue=questionType==='dialogue_sentiment';
  const options=(item.content.options??{}) as Record<string,unknown>;
  // 选项只认单字母键:对话题的 dialogue/target 是素材键,不能被渲染成选项按钮。
  const optionEntries=(questionType==='true_false'
    ?{A:'正确',B:'错误'}
    :Object.fromEntries(Object.entries(options).filter(([k])=>/^[A-Z]$/.test(k)))) as Record<string,string>;
  const typeLabel=item.itemType==='question'
    ?(questionType==='true_false'?'判断题':isFillIn?'填空题':isPromptDesc?'提示词描述题':isDialogue?'对话情绪判读题':'单选题')
    :'实操题';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="mb-2 inline-block rounded bg-primary/10 px-2 py-1 text-sm text-primary">{typeLabel}</span>
          <h1 className="text-xl font-semibold leading-relaxed">{String(item.content.stem??item.content.title??'')}</h1>
          {item.content.instructions?<p className="mt-2 text-base text-muted-foreground">{String(item.content.instructions)}</p>:null}
        </div>
        <span className="shrink-0 text-sm text-muted-foreground">{item.score}分</span>
      </div>
      {item.itemType==='question'?(
        isPromptDesc?(
          <div className="space-y-4">
            {typeof options.image==='string'&&options.image?(
              <div className="overflow-hidden rounded-lg border-2 border-border">
                <img src={options.image} alt="提示词描述素材" className="max-h-96 w-full object-contain" loading="lazy" />
              </div>
            ):null}
            <textarea
              value={typeof current==='string'?current:''}
              onChange={e=>onChange(item.id,e.target.value)}
              placeholder="请仔细观察图片，用自然语言描述图片内容，撰写一段提示词"
              rows={6}
              className="w-full resize-y rounded-lg border-2 border-border p-4 text-lg leading-relaxed focus:border-primary focus:outline-none"
            />
          </div>
        ):isFillIn?(
          <input
            type="text"
            value={typeof current==='string'?current:''}
            onChange={e=>onChange(item.id,e.target.value)}
            placeholder="请输入答案"
            className="w-full rounded-lg border-2 border-border p-4 text-lg focus:border-primary focus:outline-none"
          />
        ):(
          <div className="space-y-3">
            {isDialogue?<DialogueView dialogue={options.dialogue} target={options.target} />:null}
            {Object.entries(optionEntries).map(([key,text])=>(
              <button
                key={key}
                type="button"
                onClick={()=>onChange(item.id,key)}
                className={`w-full rounded-lg border-2 p-4 text-left text-lg ${selected===key?'border-primary bg-primary/5':'hover:border-primary/40'}`}
              >
                <strong className="mr-3 text-primary">{key}.</strong>{text}
              </button>
            ))}
          </div>
        )
      ):(
        <ExamTaskInput content={item.content} value={current} onChange={value=>onChange(item.id,value)} />
      )}
    </div>
  );
}

/** 题号导航: 已答✓+颜色, 未答仅颜色, 当前实底 */
function QuestionNav({
  items,
  responses,
  index,
  onJump,
}: {
  items: ExamItem[];
  responses: Record<string, unknown>;
  index: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button size="lg" variant="outline" disabled={index===0} onClick={()=>onJump(index-1)}>上一项</Button>
      <div className="hidden max-w-2xl flex-wrap justify-center gap-1 md:flex">
        {items.map((x,i)=>{
          const done=answered(responses[x.id]);
          return (
            <button
              key={x.id}
              type="button"
              onClick={()=>onJump(i)}
              aria-label={`第${i+1}题，${done?'已答':'未答'}`}
              className={cn('h-9 min-w-9 rounded px-2 text-sm',i===index?'bg-primary text-primary-foreground':done?'bg-primary/15 text-primary':'bg-muted')}
            >
              {i===index||!done?i+1:`✓${i+1}`}
            </button>
          );
        })}
      </div>
      <Button size="lg" disabled={index===items.length-1} onClick={()=>onJump(index+1)}>下一项</Button>
    </div>
  );
}

/** 交卷二次确认框: 有未答题列出题号, 全答完则直接确认 */
function SubmitConfirmDialog({
  open,
  onOpenChange,
  unanswered,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unanswered: number[];
  submitting: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{unanswered.length>0?`还有 ${unanswered.length} 题没有作答`:'确认交卷？'}</AlertDialogTitle>
          <AlertDialogDescription>
            {unanswered.length>0
              ?`未答题号：${unanswered.join('、')}。确认要现在交卷吗？交卷后不能修改。`
              :'所有题目都已作答。交卷后不能修改，确认要交卷吗？'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>再检查一下</AlertDialogCancel>
          <AlertDialogAction disabled={submitting} onClick={onConfirm}>确定交卷</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
