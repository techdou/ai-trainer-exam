'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  content: Record<string, unknown>;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

type Config = {
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
  return <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">该实操类型暂无法在当前浏览器作答，请联系考务人员：{taskType}</div>;
}

function ExcelRows({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const rows = config.dataRows ?? [];
  const ids = config.rowIds?.length === rows.length ? config.rowIds : rows.map((_,i)=>String(i));
  const existing = record(value);
  const retained = new Set(Array.isArray(existing.retainedRowIds) ? existing.retainedRowIds.map(String) : ids);
  const toggle = (id:string) => { const next = new Set(retained); next.has(id) ? next.delete(id) : next.add(id); onChange({ retainedRowIds: ids.filter(x=>next.has(x)) }); };
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full text-base"><thead><tr className="bg-muted"><th className="p-3">删除</th>{(config.columns??[]).map(x=><th key={x} className="p-3 text-left">{x}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={ids[i]} className={`border-t ${retained.has(ids[i])?'':'bg-red-50 opacity-70'}`}><td className="p-3 text-center"><input type="checkbox" checked={!retained.has(ids[i])} disabled={disabled} onChange={()=>toggle(ids[i])} aria-label={`删除第${i+1}行`} className="h-5 w-5" /></td>{row.map((cell,j)=><td key={j} className="p-3">{cell}</td>)}</tr>)}</tbody></table></div>;
}

function StatsTable({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const rows=config.rows??config.dataRows??[]; const editable=new Set(config.editableCells??[]); const cells=record(record(value).cells);
  const key=(r:number,c:number)=>`${String.fromCharCode(65+c)}${r+1}`;
  const set=(k:string,v:string)=>onChange({cells:{...cells,[k]:v}});
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full"><thead><tr className="bg-muted">{(config.columns??[]).map(c=><th key={c} className="p-3 text-left">{c}</th>)}</tr></thead><tbody>{rows.map((row,r)=><tr key={r} className="border-t">{row.map((cell,c)=>{const k=key(r,c);return <td key={k} className="p-2">{editable.has(k)?<Input disabled={disabled} value={String(cells[k]??'')} onChange={e=>set(k,e.target.value)} aria-label={`单元格${k}`} />:cell}</td>})}</tr>)}</tbody></table></div>;
}

function FileClassify({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const classifications=record(record(value).classifications); const files=config.files??[];
  const set=(id:string,cat:string)=>onChange({classifications:{...classifications,[id]:cat}});
  return <div className="space-y-3">{files.map(f=>{const id=f.id??f.name;return <div key={id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"><div className="flex-1"><div className="font-medium">{f.name}</div><div className="text-sm text-muted-foreground">{f.size}</div></div><select disabled={disabled} value={String(classifications[id]??'')} onChange={e=>set(id,e.target.value)} className="h-11 rounded-md border bg-background px-3 text-base"><option value="">请选择文件夹</option>{(config.categories??[]).map(c=><option key={c}>{c}</option>)}</select></div>})}</div>;
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
  return <div className="space-y-4">{config.audioUrl?<audio src={config.audioUrl} controls className="w-full" />:<div className="rounded-lg bg-amber-50 p-4 text-amber-800">音频素材未配置，请联系考务人员。</div>}<Textarea disabled={disabled} value={transcript} onChange={e=>onChange({transcript:e.target.value})} rows={7} className="text-lg" placeholder="请把听到的全部内容写下来，包括“嗯、啊、哦”等语气助词" /></div>;
}

type DrawBox={x:number;y:number;width:number;height:number;label:string;attributes?:Record<string,string>};
type DrawPoint={x:number;y:number;label:string;attributes?:Record<string,string>};
type DrawLine={points:Array<{x:number;y:number}>;label:string;attributes?:Record<string,string>};
function Annotation({ config, value, onChange, disabled }: { config:Config;value:unknown;onChange:(v:unknown)=>void;disabled:boolean }) {
  const tool=config.annotationTool??'bbox'; const labels=config.targetLabels??['目标'];
  const [label,setLabel]=useState(labels[0]); const [attribute,setAttribute]=useState('');
  const [start,setStart]=useState<{x:number;y:number}|null>(null); const [draft,setDraft]=useState<Array<{x:number;y:number}>>([]);
  const ref=useRef<HTMLDivElement>(null); const current=record(value);
  const boxes=(Array.isArray(current.boxes)?current.boxes:[]) as DrawBox[];
  const points=(Array.isArray(current.points)?current.points:[]) as DrawPoint[];
  const lines=(Array.isArray(current.lines)?current.lines:[]) as DrawLine[];
  const polygons=(Array.isArray(current.polygons)?current.polygons:[]) as DrawLine[];
  const relative=(e:React.MouseEvent)=>{const r=ref.current!.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}};
  const attrs=attribute?{state:attribute}:undefined;
  const down=(e:React.MouseEvent)=>{if(disabled)return;const p=relative(e);if(tool==='point'){onChange({points:[...points,{...p,label,attributes:attrs}]});return}if(tool==='bbox'){setStart(p);return}setDraft(d=>[...d,p]);};
  const up=(e:React.MouseEvent)=>{if(!start||tool!=='bbox'||disabled)return;const p=relative(e);const box={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),width:Math.abs(start.x-p.x),height:Math.abs(start.y-p.y),label,attributes:attrs};setStart(null);if(box.width>.005&&box.height>.005)onChange({boxes:[...boxes,box]});};
  const finish=()=>{if(draft.length<(tool==='polygon'?3:2))return;const item={points:draft,label,attributes:attrs};onChange(tool==='polygon'?{polygons:[...polygons,item]}:{lines:[...lines,item]});setDraft([])};
  const shapes=useMemo(()=>({boxes,points,lines,polygons}),[boxes,points,lines,polygons]);
  return <div className="space-y-3"><div className="flex flex-wrap gap-2"><span className="self-center">标签：</span>{labels.map(x=><Button type="button" key={x} variant={label===x?'default':'outline'} onClick={()=>setLabel(x)}>{x}</Button>)}{labels.includes('红绿灯')&&<select value={attribute} onChange={e=>setAttribute(e.target.value)} className="rounded border px-3"><option value="">灯色</option><option value="red">红灯</option><option value="green">绿灯</option></select>}</div><div ref={ref} onMouseDown={down} onMouseUp={up} className="relative min-h-80 cursor-crosshair overflow-hidden rounded-lg border bg-muted">{config.imageUrl?<img src={config.imageUrl} alt="待标注图片" className="block w-full select-none" draggable={false}/>:<div className="flex h-80 items-center justify-center">图片未配置</div>}{shapes.boxes.map((b,i)=><div key={`b${i}`} className="pointer-events-none absolute border-2 border-red-500" style={{left:`${b.x*100}%`,top:`${b.y*100}%`,width:`${b.width*100}%`,height:`${b.height*100}%`}}><span className="bg-red-500 text-xs text-white">{b.label}</span></div>)}{shapes.points.map((p,i)=><span key={`p${i}`} className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" style={{left:`${p.x*100}%`,top:`${p.y*100}%`}}/>)}{draft.map((p,i)=><span key={`d${i}`} className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600" style={{left:`${p.x*100}%`,top:`${p.y*100}%`}}/>)}</div><div className="flex gap-2">{(tool==='polyline'||tool==='polygon')&&<Button type="button" onClick={finish} disabled={disabled||draft.length<(tool==='polygon'?3:2)}>完成当前{tool==='polygon'?'轮廓':'线'}</Button>}<Button type="button" variant="outline" disabled={disabled} onClick={()=>{setDraft([]);onChange(tool==='bbox'?{boxes:[]} : tool==='point'?{points:[]} : tool==='polygon'?{polygons:[]}:{lines:[]})}}>清空标注</Button></div></div>;
}
