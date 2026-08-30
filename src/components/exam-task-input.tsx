'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import UniverSheet, { buildSheetWorkbook, extractCellData, parseCellKey, cellBg, cellHasBorder } from './univer-sheet';
import FileSortBoard from './file-sort-board';
import type { IWorkbookData } from '@univerjs/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  content: Record<string, unknown>;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

export type Config = {
  columns?: string[];
  dataRows?: string[][];
  rowIds?: string[];
  rows?: string[][];
  editableCells?: string[];
  categories?: string[];
  files?: Array<{ id?: string; name: string; size?: string }>;
  images?: Array<{ id: string; description?: string; url?: string }>;
  texts?: Array<{ id: string; content: string }>;
  labels?: string[];
  audioUrl?: string;
  imageUrl?: string;
  targetLabels?: string[];
  annotationTool?: 'bbox'|'point'|'polyline'|'polygon';
  attributes?: Record<string, string[]>;
  items?: Array<{ id: string; content?: string; imageUrl?: string; description?: string }>;
  subtasks?: Array<{ id: string; title: string; instructions?: string; taskType: string; config?: Record<string, unknown> }>;
  // excel_comprehensive
  classColumnIndex?: number;
  scoreColumnIndices?: number[];
  totalColumnIndex?: number;
  colorOptions?: string[];
  requirements?: string[];
  formulaHint?: string;
};

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function ExamTaskInput({ content, value, onChange, disabled = false }: Props) {
  const taskType = String(content.taskType ?? '');
  const config = record(content.config) as Config;
  if (taskType === 'excel_delete_rows') return <ExcelRows config={config} value={value} onChange={onChange} disabled={disabled} />;
  if (taskType === 'stats_table') return <StatsTable config={config} value={value} onChange={onChange} disabled={disabled} />;
  if (taskType === 'file_classify') return <FileClassify config={config} value={value} onChange={onChange} disabled={disabled} />;
  if (taskType === 'image_clean') return <ImageClean config={config} value={value} onChange={onChange} disabled={disabled} />;
  if (taskType === 'text_sentiment') return <Sentiment config={config} value={value} onChange={onChange} disabled={disabled} />;
  if (taskType === 'audio_transcription') return <AudioTranscript config={config} value={value} onChange={onChange} disabled={disabled} />;
  if (['image_annotation','bounding_box','point_annotation','polyline_annotation','polygon_annotation'].includes(taskType)) {
    return <Annotation config={{ ...config, annotationTool: config.annotationTool ?? (taskType === 'point_annotation' ? 'point' : taskType === 'polyline_annotation' ? 'polyline' : taskType === 'polygon_annotation' ? 'polygon' : 'bbox') }} value={value} onChange={onChange} disabled={disabled} />;
  }
  if (taskType === 'data_labeling') return <DataLabeling config={config} value={value} onChange={onChange} disabled={disabled} />;
  if (taskType === 'dataset_quality') return <DatasetQuality config={config} value={value} onChange={onChange} disabled={disabled} />;
  if (taskType === 'composite_task') return <CompositeTask config={config} value={value} onChange={onChange} disabled={disabled} />;
  if (taskType === 'excel_comprehensive') return <ExcelComprehensive config={config} value={value} onChange={onChange} disabled={disabled} />;
  return <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-warning">该实操类型暂无法在当前浏览器作答，请联系考务人员：{taskType}</div>;
}

export function ExcelRows({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const columns = config.columns ?? [];
  const rows = config.dataRows ?? [];
  const ids = config.rowIds?.length === rows.length ? config.rowIds : rows.map((_, i) => String(i));
  const rowKeyToId = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((cells, i) => m.set(cells.map((c) => String(c)).join('\u0001'), ids[i]));
    return m;
  }, []);
  const wb = useMemo(() => buildSheetWorkbook({ columns, rows }), []);
  const handleSnap = (getSnap: () => IWorkbookData | null) => {
    const snap = getSnap(); if (!snap) return;
    const cd = extractCellData(snap);
    const retained: string[] = [];
    for (let r = 1; cd[r]; r++) {
      const row = cd[r];
      const vals: string[] = [];
      for (let c = 0; row[c] !== undefined; c++) vals.push(String(row[c].v ?? ''));
      const id = rowKeyToId.get(vals.join('\u0001'));
      if (id !== undefined) retained.push(id);
    }
    onChange({ retainedRowIds: retained });
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">像真实 Excel 一样：点击行号选中要删除的行，右键选择「删除行」。误删可按 Ctrl+Z 撤销。</p>
      <UniverSheet initialWorkbook={wb} feature={{ contextMenu: true, toolbar: true }} onChange={handleSnap} disabled={disabled} height={440} />
    </div>
  );
}

export function StatsTable({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const rows = config.rows ?? config.dataRows ?? [];
  const columns = config.columns ?? [];
  const editable = config.editableCells ?? [];
  const wb = useMemo(() => buildSheetWorkbook({ columns, rows, highlightCells: new Set(editable as string[]), dataOffset: 1 }), []);
  const handleSnap = (getSnap: () => IWorkbookData | null) => {
    const snap = getSnap(); if (!snap) return;
    const cd = extractCellData(snap);
    const cells: Record<string, string | number> = {};
    for (const key of editable as string[]) {
      const { col, row } = parseCellKey(key);
      const v = cd[row + 1]?.[col]?.v; // +1: 表头占第 0 行,题型坐标从数据行起算
      if (v !== undefined && v !== null && v !== '') cells[key] = typeof v === 'number' ? v : String(v);
    }
    onChange({ cells });
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">在浅黄色单元格中直接输入统计结果，支持公式（如 =AVERAGE(B2:B6)、=SUM(C2:C6)）。</p>
      <UniverSheet initialWorkbook={wb} onChange={handleSnap} disabled={disabled} height={440} />
    </div>
  );
}

export function FileClassify({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  // 拖拽归档板: 拖拽优先 + 触屏两步降级, 提交结构与判分器对齐(classifications 映射)
  return <FileSortBoard config={config} value={value} onChange={onChange} disabled={disabled} />;
}

function ImageClean({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const decisions=record(record(value).decisions); const set=(id:string,d:string)=>onChange({decisions:{...decisions,[id]:d}});
  return <div className="grid gap-4 sm:grid-cols-2">{(config.images??[]).map(img=><div key={img.id} className="rounded-lg border p-3">{img.url?<img src={img.url} alt={img.description??'待清洗图片'} className="mb-3 h-44 w-full rounded object-cover" />:<div className="mb-3 flex h-44 items-center justify-center rounded bg-muted text-4xl">🖼</div>}<p className="mb-3 text-sm">{img.description}</p><div className="grid grid-cols-2 gap-2"><Button type="button" disabled={disabled} variant={decisions[img.id]==='keep'?'default':'outline'} onClick={()=>set(img.id,'keep')}>保留</Button><Button type="button" disabled={disabled} variant={decisions[img.id]==='discard'?'destructive':'outline'} onClick={()=>set(img.id,'discard')}>删除</Button></div></div>)}</div>;
}

function Sentiment({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const sentiments=record(record(value).sentiments); const set=(id:string,label:string)=>onChange({sentiments:{...sentiments,[id]:label}});
  return <div className="space-y-3">{(config.texts??[]).map(t=><div key={t.id} className="rounded-lg border p-4"><p className="mb-3 text-lg">{t.content}</p><div className="flex flex-wrap gap-2">{(config.labels??['好评','中评','差评']).map(label=><Button type="button" key={label} disabled={disabled} variant={sentiments[t.id]===label?'default':'outline'} onClick={()=>set(t.id,label)}>{label}</Button>)}</div></div>)}</div>;
}

function AudioTranscript({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const transcript=String(record(value).transcript??'');
  return <div className="space-y-4">{config.audioUrl?<audio src={config.audioUrl} controls className="w-full" />:<div className="rounded-lg bg-warning/10 p-4 text-warning">音频素材未配置，请联系考务人员。</div>}<Textarea disabled={disabled} value={transcript} onChange={e=>onChange({transcript:e.target.value})} rows={7} className="text-lg" placeholder="请把听到的全部内容写下来，包括“嗯、啊、哦”等语气助词" /></div>;
}

/** 通用数据标注: 图片或文本混合条目, 逐条选择标签(与 data_labeling 评分器契约对应)。 */
function DataLabeling({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const labels = record(record(value).labels);
  const items = config.items ?? [];
  const options = config.labels ?? [];
  const set = (id: string, label: string) => onChange({ labels: { ...labels, [id]: label } });
  return (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.id} className="rounded-lg border p-4">
          {item.imageUrl
            ? <img src={item.imageUrl} alt={item.description ?? '待标注条目'} className="mb-3 h-44 w-full rounded object-cover" />
            : <p className="mb-3 text-lg">{item.content}</p>}
          {item.description && item.imageUrl && <p className="mb-3 text-sm text-muted-foreground">{item.description}</p>}
          <div className="flex flex-wrap gap-2">
            {options.map(label => (
              <Button type="button" key={label} disabled={disabled} variant={labels[item.id] === label ? 'default' : 'outline'} onClick={() => set(item.id, label)}>{label}</Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 数据集质量体检: 逐项检查, 勾选"有问题"的数据项(与 dataset_quality 评分器契约对应)。 */
function DatasetQuality({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const flagged = new Set(Array.isArray(record(value).flaggedItems) ? (record(value).flaggedItems as unknown[]).map(String) : []);
  const items = config.items ?? [];
  const toggle = (id: string) => {
    const next = new Set(flagged);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ flaggedItems: [...next] });
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">请逐项检查数据质量，勾选你认为<strong>有问题</strong>的条目（如图片模糊、内容乱码、类别不符、重复数据）。</p>
      {items.map(item => (
        <div key={item.id} className={`rounded-lg border p-4 transition-colors ${flagged.has(item.id) ? 'border-destructive/60 bg-destructive/5' : ''}`}>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={flagged.has(item.id)}
              disabled={disabled}
              onChange={() => toggle(item.id)}
              aria-label={`标记 ${item.description ?? item.id} 为问题数据`}
              className="mt-1 h-5 w-5 shrink-0"
            />
            <div className="flex-1">
              {item.imageUrl
                ? <img src={item.imageUrl} alt={item.description ?? '数据条目'} className="mb-2 h-40 w-full rounded object-cover" />
                : <p className="text-base">{item.content}</p>}
              {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 综合任务: 按子任务类型递归渲染(与 composite_task 评分器契约对应, 子任务不可再为 composite)。 */
function CompositeTask({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const subtasks = config.subtasks ?? [];
  const current = record(record(value).subtasks);
  const setSub = (id: string, v: unknown) => onChange({ subtasks: { ...current, [id]: v } });
  if (!subtasks.length) return <div className="rounded-lg bg-warning/10 p-4 text-warning">综合任务未配置子任务，请联系考务人员。</div>;
  return (
    <div className="space-y-6">
      {subtasks.map((sub, index) => (
        <section key={sub.id} className="rounded-xl border p-4">
          <h3 className="mb-1 text-lg font-semibold">子任务 {index + 1}：{sub.title}</h3>
          {sub.instructions && <p className="mb-3 text-sm text-muted-foreground">{sub.instructions}</p>}
          {sub.taskType === 'composite_task'
            ? <div className="rounded-lg bg-warning/10 p-4 text-warning">综合任务不能嵌套综合任务，请联系考务人员。</div>
            : <ExamTaskInput content={{ taskType: sub.taskType, config: sub.config ?? {} }} value={current[sub.id]} onChange={v => setSub(sub.id, v)} disabled={disabled} />}
        </section>
      ))}
    </div>
  );
}

/** Excel 综合操作题: 模拟 Excel 工具栏, 学员需完成边框/公式/排序/分类汇总/填充色/小数格式。 */
interface ExcelRowState { id: string; cells: string[]; }
interface ExcelSubmission {
  borderApplied?: boolean;
  rows?: ExcelRowState[];
  rowOrder?: string[];
  headerColor?: string;
  decimalPlaces?: number;
  summaryGroups?: Array<{ key: string; averages: Record<string, string | number> }>;
}
const COLOR_MAP: Record<string, string> = {
  '蓝色': '#3b82f6',
  '红色': '#ef4444',
  '绿色': '#22c55e',
  '黄色': '#eab308',
  '无': '',
};
function formatDecimal(value: string, places: number | null): string {
  if (places === null) return value;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return value;
  return n.toFixed(places);
}
function ExcelComprehensive({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const columns = config.columns ?? [];
  const initialRows = config.dataRows ?? [];
  const rowIds = config.rowIds?.length === initialRows.length ? config.rowIds : initialRows.map((_, i) => String(i));
  const scoreColIndices = config.scoreColumnIndices ?? [];
  // 学号→班级推导(与判分语义一致: 学号第 3-4 位), 用于预置汇总区班级标签行
  const classNames = useMemo(() => {
    const s = new Set<string>();
    for (const row of initialRows) {
      const m = /^\d{2}(\d{1,2})/.exec(String(row[0] ?? ''));
      if (m) s.add(`${parseInt(m[1], 10)}班`);
    }
    return [...s].sort();
  }, []);
  const wb = useMemo(() => buildSheetWorkbook({
    columns, rows: initialRows,
    extraRows: classNames.map((cn) => [cn, ...columns.slice(1).map(() => '')]),
  }), []);
  const idToRowId = useMemo(() => {
    const m = new Map<string, string>();
    initialRows.forEach((cells, i) => m.set(String(cells[0] ?? ''), rowIds[i]));
    return m;
  }, []);
  const hexToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const [name, hex] of Object.entries(COLOR_MAP)) m.set(String(hex).toUpperCase(), name);
    return m;
  }, []);
  const handleSnap = (getSnap: () => IWorkbookData | null) => {
    const snap = getSnap(); if (!snap) return;
    const cd = extractCellData(snap);
    const rows: Array<{ id: string; cells: string[] }> = [];
    const order: string[] = [];
    for (let r = 1; cd[r]; r++) {
      const row = cd[r];
      const vals: string[] = [];
      for (let c = 0; c < columns.length; c++) vals.push(row[c]?.v == null ? '' : String(row[c].v));
      const rid = idToRowId.get(vals[0]);
      if (rid !== undefined) { rows.push({ id: rid, cells: vals }); order.push(rid); }
    }
    const bg = cellBg(snap, 0, 0);
    const headerColor = bg ? (hexToName.get(bg.toUpperCase()) ?? bg) : '';
    const borderApplied = cellHasBorder(snap, 0, 0) || cellHasBorder(snap, 1, 1);
    // 汇总区: 数据区(隔一空行)之后的行,A 列班级名匹配预置标签,数值列读平均
    const summaryGroups: Array<{ key: string; averages: Record<string, number> }> = [];
    for (let r = initialRows.length + 2; cd[r]; r++) {
      const row = cd[r];
      const label = String(row[0]?.v ?? '').trim();
      if (!label || !label.endsWith('班')) continue;
      const averages: Record<string, number> = {};
      for (const ci of scoreColIndices) {
        const v = parseFloat(String(row[ci]?.v ?? ''));
        if (!Number.isNaN(v)) averages[String(ci)] = v;
      }
      summaryGroups.push({ key: label, averages });
    }
    // decimalPlaces: 从成绩列数字格式 pattern("0.00"→2)推断
    let decimalPlaces: number | undefined;
    const scoreCol = scoreColIndices[0];
    if (scoreCol !== undefined) {
      const stylesMap = (snap?.styles ?? {}) as Record<string, { p?: { pattern?: string } }>;
      for (let r = 1; r <= initialRows.length && decimalPlaces === undefined; r++) {
        const cell = cd[r]?.[scoreCol];
        if (!cell?.s) continue;
        const st = typeof cell.s === 'string' ? stylesMap[cell.s] : (cell.s as { p?: { pattern?: string } });
        const pat = st?.p?.pattern;
        if (pat) { const m = /\.(0+)/.exec(pat); decimalPlaces = m ? m[1].length : 0; }
      }
    }
    onChange({ rows, rowOrder: order, ...(headerColor ? { headerColor } : {}), borderApplied,
      ...(summaryGroups.length ? { summaryGroups } : {}), ...(decimalPlaces !== undefined ? { decimalPlaces } : {}) });
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">像真实 Excel 一样操作：单击单元格直接编辑；在编辑栏输入公式（班级列、汇总区平均值可用 AVERAGE）；用工具栏完成排序、标题行填充色与边框。表格下方的汇总区已按班级预置标签，请填入各科平均值。</p>
      <UniverSheet initialWorkbook={wb} feature={{ toolbar: true, formulaBar: true, contextMenu: true }} onChange={handleSnap} disabled={disabled} height={480} />
    </div>
  );
}
type DrawBox={x:number;y:number;width:number;height:number;label:string;attributes?:Record<string,string>};
type DrawPoint={x:number;y:number;label:string;attributes?:Record<string,string>};
type DrawLine={points:Array<{x:number;y:number}>;label:string;attributes?:Record<string,string>};
function Annotation({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const tool=config.annotationTool??'bbox'; const labels=config.targetLabels??['目标'];
  const [label,setLabel]=useState(labels[0]); const [attribute,setAttribute]=useState('');
  const [start,setStart]=useState<{x:number;y:number}|null>(null);
  const [cur,setCur]=useState<{x:number;y:number}|null>(null); // bbox 拖拽实时预览点
  const [draft,setDraft]=useState<Array<{x:number;y:number}>>([]);
  const [history,setHistory]=useState<Array<{boxes:DrawBox[];points:DrawPoint[];lines:DrawLine[];polygons:DrawLine[]}>>([]); // 撤销栈(shapes 快照)
  const ref=useRef<HTMLDivElement>(null); const current=record(value);
  const boxes=(Array.isArray(current.boxes)?current.boxes:[]) as DrawBox[];
  const points=(Array.isArray(current.points)?current.points:[]) as DrawPoint[];
  const lines=(Array.isArray(current.lines)?current.lines:[]) as DrawLine[];
  const polygons=(Array.isArray(current.polygons)?current.polygons:[]) as DrawLine[];
  const shapes=useMemo(()=>({boxes,points,lines,polygons}),[boxes,points,lines,polygons]);
  const relative=(e:{clientX:number;clientY:number})=>{if(!ref.current)return{x:0,y:0};const r=ref.current.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}};
  const attrs=attribute?{state:attribute}:undefined;
  // 属性选项由 config.attributes 按当前标签驱动; 值与题库答案使用同一文本(如"红灯"), 保证 attrsMatch 判分一致。
  const attrOptions=config.attributes?.[label]??[];
  const toSvg=(pts:Array<{x:number;y:number}>)=>pts.map(p=>`${p.x},${p.y}`).join(' ');

  const pushHistory=()=>setHistory(h=>[...h,{boxes:[...boxes],points:[...points],lines:[...lines],polygons:[...polygons]}]);
  const undo=()=>{
    if(disabled)return;
    if(draft.length>0){setDraft(d=>d.slice(0,-1));return}          // 线/轮廓:先撤上一个点
    if(start){setStart(null);setCur(null);return}                  // 撤进行中的框
    if(history.length===0)return;
    const prev=history[history.length-1];
    setHistory(h=>h.slice(0,-1));
    onChange(prev);
  };

  // Ctrl+Z / Cmd+Z 撤销(组件存活期间监听)
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  });

  const down=(e:React.PointerEvent)=>{
    if(disabled)return;
    e.preventDefault();
    const p=relative(e);
    if(tool==='point'){pushHistory();onChange({points:[...points,{...p,label,attributes:attrs}]});return}
    if(tool==='bbox'){setStart(p);setCur(p);try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}return}
    setDraft(d=>[...d,p]);
  };
  const move=(e:React.PointerEvent)=>{if(start)setCur(relative(e))};
  const up=(e:React.PointerEvent)=>{
    if(!start||tool!=='bbox'||disabled)return;
    const p=relative(e);
    const box={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),width:Math.abs(start.x-p.x),height:Math.abs(start.y-p.y),label,attributes:attrs};
    setStart(null);setCur(null);
    if(box.width>.005&&box.height>.005){pushHistory();onChange({boxes:[...boxes,box]})}
  };
  const finish=(popLast=false)=>{
    const d=popLast&&draft.length>=1?draft.slice(0,-1):draft;      // 双击收尾时去掉与双击重复的末点
    if(d.length<(tool==='polygon'?3:2))return;
    pushHistory();
    onChange(tool==='polygon'?{polygons:[...polygons,{points:d,label,attributes:attrs}]}:{lines:[...lines,{points:d,label,attributes:attrs}]});
    setDraft([]);
  };
  const hint=start
    ? '拖拽画出选框，松手完成'
    : draft.length>0
      ? `已标记 ${draft.length} 个点 · 单击继续 · 双击或「完成」结束 · Ctrl+Z 撤销`
      : (tool==='point'?'在图上单击打点 · Ctrl+Z 撤销':tool==='bbox'?'按住拖拽画出选框 · Ctrl+Z 撤销':'单击逐点标记，双击或「完成」结束 · Ctrl+Z 撤销');
  const preview=start&&cur?{x:Math.min(start.x,cur.x),y:Math.min(start.y,cur.y),width:Math.abs(start.x-cur.x),height:Math.abs(start.y-cur.y)}:null;

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className="self-center">标签：</span>
      {labels.map(x=><Button type="button" key={x} variant={label===x?'default':'outline'} disabled={disabled} onClick={()=>{setLabel(x);setAttribute('')}}>{x}</Button>)}
      {attrOptions.length>0&&<select value={attribute} onChange={e=>setAttribute(e.target.value)} disabled={disabled} className="h-9 rounded border bg-background px-3"><option value="">选择属性</option>{attrOptions.map(o=><option key={o} value={o}>{o}</option>)}</select>}
    </div>
    {(draft.length>0||start)&&<p className="text-xs text-muted-foreground" role="status">{hint}</p>}
    <div ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onDoubleClick={()=>{if(tool==='polyline'||tool==='polygon')finish(true)}}
      style={{touchAction:'none'}}
      className="relative min-h-80 cursor-crosshair select-none overflow-hidden rounded-lg border bg-muted">
      {config.imageUrl?<img src={config.imageUrl} alt="待标注图片" className="block w-full select-none" draggable={false}/>:<div className="flex h-80 items-center justify-center">图片未配置</div>}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
        {shapes.polygons.map((l,i)=><polygon key={`pg${i}`} points={toSvg(l.points)} fill="rgba(37,99,235,0.15)" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke"/>)}
        {shapes.lines.map((l,i)=><polyline key={`pl${i}`} points={toSvg(l.points)} fill="none" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke"/>)}
        {draft.length>1&&<polyline points={toSvg(draft)} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke"/>}
      </svg>
      {shapes.boxes.map((b,i)=><div key={`b${i}`} className="pointer-events-none absolute border-2 border-primary" style={{left:`${b.x*100}%`,top:`${b.y*100}%`,width:`${b.width*100}%`,height:`${b.height*100}%`}}><span className="bg-primary text-sm text-primary-foreground">{b.label}</span></div>)}
      {preview&&<div className="pointer-events-none absolute border-2 border-dashed border-amber-500" style={{left:`${preview.x*100}%`,top:`${preview.y*100}%`,width:`${preview.width*100}%`,height:`${preview.height*100}%`}}/>}
      {shapes.points.map((p,i)=><span key={`p${i}`} className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" style={{left:`${p.x*100}%`,top:`${p.y*100}%`}}/>)}
      {draft.map((p,i)=><span key={`d${i}`} className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600" style={{left:`${p.x*100}%`,top:`${p.y*100}%`}}/>)}
    </div>
    <div className="flex flex-wrap gap-2">
      {(tool==='polyline'||tool==='polygon')&&<Button type="button" onClick={()=>finish()} disabled={disabled||draft.length<(tool==='polygon'?3:2)}>完成当前{tool==='polygon'?'轮廓':'线'}</Button>}
      <Button type="button" variant="outline" disabled={disabled||(!history.length&&draft.length===0&&!start)} onClick={undo}>撤销 Ctrl+Z</Button>
      <Button type="button" variant="outline" disabled={disabled} onClick={()=>{setDraft([]);setStart(null);setCur(null);pushHistory();onChange(tool==='bbox'?{boxes:[]}:tool==='point'?{points:[]}:tool==='polygon'?{polygons:[]}:{lines:[]})}}>清空标注</Button>
    </div>
  </div>;
}
