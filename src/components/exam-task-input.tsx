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
  return <div className="overflow-x-auto rounded-lg border"><table className="w-full"><thead><tr className="bg-muted">{(config.columns??[]).map(c=><th key={c} className="p-3 text-left">{c}</th>)}</tr></thead><tbody>{rows.map((row,r)=><tr key={r} className="border-t">{row.map((cell,c)=>{const k=key(r,c);return <td key={k} className="p-2">{editable.has(k)?<Input disabled={disabled} value={String(cells[k]??'')} onChange={e=>set(k,e.target.value)} aria-label={`单元格${k}`} className="min-w-[6rem]" />:cell}</td>})}</tr>)}</tbody></table></div>;
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
function ExcelComprehensive({ config, value, onChange, disabled }: { config: Config; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  const columns = config.columns ?? [];
  const initialRows = config.dataRows ?? [];
  const rowIds = config.rowIds?.length === initialRows.length ? config.rowIds : initialRows.map((_, i) => String(i));
  const classColIdx = config.classColumnIndex ?? -1;
  const scoreColIndices = config.scoreColumnIndices ?? [];
  const totalColIdx = config.totalColumnIndex ?? -1;
  const colorOptions = config.colorOptions ?? ['蓝色', '红色', '绿色', '黄色'];

  const existing = record(value) as Partial<ExcelSubmission>;
  const [rows, setRows] = useState<ExcelRowState[]>(() => {
    if (Array.isArray(existing.rows)) return existing.rows as ExcelRowState[];
    return initialRows.map((cells, i) => ({ id: rowIds[i], cells: [...cells] }));
  });
  const [borderApplied, setBorderApplied] = useState<boolean>(existing.borderApplied === true);
  const [headerColor, setHeaderColor] = useState<string>(existing.headerColor ?? '');
  const [decimalPlaces, setDecimalPlaces] = useState<number | null>(typeof existing.decimalPlaces === 'number' ? existing.decimalPlaces : null);
  const [showSummary, setShowSummary] = useState<boolean>(Array.isArray(existing.summaryGroups) && (existing.summaryGroups as unknown[]).length > 0);

  const emit = (patch: Partial<ExcelSubmission>) => {
    onChange({ ...existing, rows, borderApplied, headerColor, decimalPlaces, showSummary, ...patch });
  };

  // 格式化显示：应用小数位设置
  const displayCell = (raw: string): string => decimalPlaces !== null ? formatDecimal(raw, decimalPlaces) : raw;

  // ── 操作 1: 设置边框 ──
  const toggleBorder = () => { const next = !borderApplied; setBorderApplied(next); emit({ borderApplied: next }); };

  // ── 操作 2: 用公式求班级（从学号提取）──
  const applyFormula = () => {
    if (classColIdx < 0) return;
    const next = rows.map(r => {
      const studentId = r.cells[0] ?? '';
      // 学号如 120305 → 班级 "3班" (第3-4位)
      const match = studentId.match(/^\d{2}(\d{1,2})/);
      const classNum = match ? String(parseInt(match[1], 10)) : '';
      const newCells = [...r.cells];
      newCells[classColIdx] = classNum ? `${classNum}班` : '';
      return { ...r, cells: newCells };
    });
    setRows(next); emit({ rows: next });
  };

  // ── 操作 3: 排序（班级降序，成绩降序）──
  const sortRows = () => {
    const sortKey = (r: ExcelRowState): [number, number] => {
      const classStr = classColIdx >= 0 ? (r.cells[classColIdx] ?? '') : '';
      const classNum = parseInt(classStr.replace(/[^\d]/g, ''), 10) || 0;
      const totalStr = totalColIdx >= 0 ? (r.cells[totalColIdx] ?? '0') : '0';
      const score = parseFloat(totalStr) || 0;
      return [classNum, score];
    };
    const next = [...rows].sort((a, b) => {
      const [ac, as] = sortKey(a), [bc, bs] = sortKey(b);
      if (bc !== ac) return bc - ac;
      return bs - as;
    });
    setRows(next); emit({ rows: next, rowOrder: next.map(r => r.id) });
  };

  // ── 操作 4: 分类汇总（按班级求平均值）──
  const toggleSummary = () => {
    const nextShow = !showSummary;
    setShowSummary(nextShow);
    if (!nextShow) { emit({ summaryGroups: [] }); return; }
    // 按班级分组
    const groups = new Map<string, ExcelRowState[]>();
    for (const r of rows) {
      const key = classColIdx >= 0 ? (r.cells[classColIdx] ?? '未知') : '未知';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const summaryGroups: Array<{ key: string; averages: Record<string, string | number> }> = [];
    for (const [key, groupRows] of groups) {
      const averages: Record<string, string | number> = {};
      for (const colIdx of scoreColIndices) {
        const values = groupRows.map(r => parseFloat(r.cells[colIdx] ?? '0')).filter(n => !isNaN(n));
        const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        averages[String(colIdx)] = decimalPlaces !== null ? parseFloat(avg.toFixed(decimalPlaces)) : parseFloat(avg.toFixed(2));
      }
      if (totalColIdx >= 0) {
        const values = groupRows.map(r => parseFloat(r.cells[totalColIdx] ?? '0')).filter(n => !isNaN(n));
        const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        averages[String(totalColIdx)] = decimalPlaces !== null ? parseFloat(avg.toFixed(decimalPlaces)) : parseFloat(avg.toFixed(2));
      }
      summaryGroups.push({ key, averages });
    }
    emit({ summaryGroups });
  };

  // ── 操作 5: 标题行填充颜色 ──
  const pickColor = (color: string) => { setHeaderColor(color); emit({ headerColor: color }); };

  // ── 操作 6: 设置成绩保留小数位 ──
  const setDecimals = (places: number) => { setDecimalPlaces(places); emit({ decimalPlaces: places }); };

  const headerBg = COLOR_MAP[headerColor] ?? '';

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-wrap gap-2 rounded-lg border bg-secondary/30 p-3">
        <Button type="button" size="sm" variant={borderApplied ? 'default' : 'outline'} disabled={disabled} onClick={toggleBorder}>表格边框</Button>
        {classColIdx >= 0 && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={applyFormula}>fx 求班级</Button>}
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={sortRows}>排序 ↕</Button>
        <Button type="button" size="sm" variant={showSummary ? 'default' : 'outline'} disabled={disabled} onClick={toggleSummary}>分类汇总 Σ</Button>
        <span className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">标题色:</span>
          {colorOptions.map(c => (
            <button key={c} type="button" disabled={disabled} onClick={() => pickColor(c)}
              className={`h-7 w-7 rounded border-2 ${headerColor === c ? 'ring-2 ring-primary ring-offset-1' : 'border-gray-300'}`}
              style={{ backgroundColor: COLOR_MAP[c] || 'transparent' }}
              aria-label={`标题填充${c}色`} title={c} />
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">小数:</span>
          {[0, 1, 2].map(d => (
            <Button key={d} type="button" size="sm" variant={decimalPlaces === d ? 'default' : 'outline'} disabled={disabled} onClick={() => setDecimals(d)}>{d}位</Button>
          ))}
        </span>
      </div>

      {/* 数据表 */}
      <div className={`overflow-x-auto rounded-lg ${borderApplied ? 'border-2 border-gray-400' : 'border'}`}>
        <table className="w-full text-base">
          <thead>
            <tr style={headerBg ? { backgroundColor: headerBg } : undefined}>
              {columns.map((col, ci) => (
                <th key={ci} className={`px-3 py-2 text-left font-medium whitespace-nowrap ${borderApplied ? 'border border-gray-400' : 'border-b'}`}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.id} className={showSummary && ri === 0 ? '' : ''}>
                {row.cells.map((cell, ci) => (
                  <td key={ci} className={`px-3 py-2 whitespace-nowrap ${borderApplied ? 'border border-gray-400' : 'border-b'}`}>
                    {displayCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
            {/* 分类汇总行 */}
            {showSummary && Array.isArray(existing.summaryGroups) && (existing.summaryGroups as Array<{ key: string; averages: Record<string, string | number> }>).map((grp, gi) => (
              <tr key={`summary-${gi}`} className="bg-secondary/40 font-medium">
                {columns.map((_, ci) => {
                  const val = grp.averages[String(ci)];
                  if (ci === 0) return <td key={ci} className={`px-3 py-2 ${borderApplied ? 'border border-gray-400' : 'border-b'}`}>{grp.key} 平均值</td>;
                  if (val !== undefined) return <td key={ci} className={`px-3 py-2 ${borderApplied ? 'border border-gray-400' : 'border-b'}`}>{decimalPlaces !== null ? formatDecimal(String(val), decimalPlaces) : val}</td>;
                  return <td key={ci} className={`px-3 py-2 ${borderApplied ? 'border border-gray-400' : 'border-b'}`}>—</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  const relative=(e:React.MouseEvent)=>{if(!ref.current)return{x:0,y:0};const r=ref.current.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}};
  const attrs=attribute?{state:attribute}:undefined;
  // 属性选项由 config.attributes 按当前标签驱动; 值与题库答案使用同一文本(如“红灯”), 保证 attrsMatch 判分一致。
  const attrOptions=config.attributes?.[label]??[];
  const down=(e:React.MouseEvent)=>{if(disabled)return;const p=relative(e);if(tool==='point'){onChange({points:[...points,{...p,label,attributes:attrs}]});return}if(tool==='bbox'){setStart(p);return}setDraft(d=>[...d,p]);};
  const up=(e:React.MouseEvent)=>{if(!start||tool!=='bbox'||disabled)return;const p=relative(e);const box={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),width:Math.abs(start.x-p.x),height:Math.abs(start.y-p.y),label,attributes:attrs};setStart(null);if(box.width>.005&&box.height>.005)onChange({boxes:[...boxes,box]});};
  const finish=()=>{if(draft.length<(tool==='polygon'?3:2))return;const item={points:draft,label,attributes:attrs};onChange(tool==='polygon'?{polygons:[...polygons,item]}:{lines:[...lines,item]});setDraft([])};
  const shapes=useMemo(()=>({boxes,points,lines,polygons}),[boxes,points,lines,polygons]);
  const toSvg=(pts:Array<{x:number;y:number}>)=>pts.map(p=>`${p.x},${p.y}`).join(' ');
  return <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><span className="self-center">标签：</span>{labels.map(x=><Button type="button" key={x} variant={label===x?'default':'outline'} onClick={()=>{setLabel(x);setAttribute('');}}>{x}</Button>)}{attrOptions.length>0&&<select value={attribute} onChange={e=>setAttribute(e.target.value)} className="h-9 rounded border bg-background px-3"><option value="">选择属性</option>{attrOptions.map(o=><option key={o} value={o}>{o}</option>)}</select>}</div><div ref={ref} onMouseDown={down} onMouseUp={up} className="relative min-h-80 cursor-crosshair overflow-hidden rounded-lg border bg-muted">{config.imageUrl?<img src={config.imageUrl} alt="待标注图片" className="block w-full select-none" draggable={false}/>:<div className="flex h-80 items-center justify-center">图片未配置</div>}<svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">{shapes.polygons.map((l,i)=><polygon key={`pg${i}`} points={toSvg(l.points)} fill="rgba(37,99,235,0.15)" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke"/>)}{shapes.lines.map((l,i)=><polyline key={`pl${i}`} points={toSvg(l.points)} fill="none" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke"/>)}{draft.length>1&&<polyline points={toSvg(draft)} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke"/>}</svg>{shapes.boxes.map((b,i)=><div key={`b${i}`} className="pointer-events-none absolute border-2 border-primary" style={{left:`${b.x*100}%`,top:`${b.y*100}%`,width:`${b.width*100}%`,height:`${b.height*100}%`}}><span className="bg-primary text-sm text-primary-foreground">{b.label}</span></div>)}{shapes.points.map((p,i)=><span key={`p${i}`} className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" style={{left:`${p.x*100}%`,top:`${p.y*100}%`}}/>)}{draft.map((p,i)=><span key={`d${i}`} className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600" style={{left:`${p.x*100}%`,top:`${p.y*100}%`}}/>)}</div><div className="flex gap-2">{(tool==='polyline'||tool==='polygon')&&<Button type="button" onClick={finish} disabled={disabled||draft.length<(tool==='polygon'?3:2)}>完成当前{tool==='polygon'?'轮廓':'线'}</Button>}<Button type="button" variant="outline" disabled={disabled} onClick={()=>{setDraft([]);onChange(tool==='bbox'?{boxes:[]} : tool==='point'?{points:[]} : tool==='polygon'?{polygons:[]}:{lines:[]})}}>清空标注</Button></div></div>;
}
