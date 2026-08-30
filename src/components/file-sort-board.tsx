'use client';

/**
 * 文件归档板（file_classify 题型共用）：拖拽优先 + 触屏两步降级。
 * - 桌面：HTML5 拖拽文件入文件夹；文件夹内文件可拖回/点移出反悔
 * - 触屏/无拖拽：点选文件（高亮）→ 点目标文件夹归档
 * - 文件按扩展名渲染拟真图标；文件夹实时计数；提交结构 {classifications:{fileId:category}} 与判分器对齐
 */
import { useState } from 'react';
import type { Config } from './exam-task-input';

const ICON_BY_EXT: Array<[RegExp, string]> = [
  [/\.(jpe?g|png|gif|webp|bmp|svg|ico)$/i, '🖼'],
  [/\.(mp3|wav|m4a|flac|aac|ogg)$/i, '🎵'],
  [/\.(mp4|mov|avi|mkv|webm)$/i, '🎬'],
  [/\.(xls|xlsx|csv)$/i, '📊'],
  [/\.(doc|docx|pdf|txt|md)$/i, '📄'],
  [/\.(zip|rar|7z|tar|gz)$/i, '🗜'],
];

function iconFor(name: string): string {
  for (const [re, icon] of ICON_BY_EXT) if (re.test(name)) return icon;
  return '📎';
}

export interface SortFile { id: string; name: string; size?: string }

export default function FileSortBoard({ config, value, onChange, disabled }: {
  config: Config; value: unknown; onChange: (v: unknown) => void; disabled: boolean;
}) {
  const files: SortFile[] = Array.isArray(config.files) ? (config.files as SortFile[]) : [];
  const categories: string[] = Array.isArray(config.categories) ? (config.categories as string[]) : [];

  const existing = (value && typeof value === 'object' ? value : {}) as { classifications?: Record<string, string> };
  const [assigned, setAssigned] = useState<Record<string, string>>({ ...(existing.classifications ?? {}) });
  const [picked, setPicked] = useState<string | null>(null); // 触屏两步模式：已选中的待归档文件
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const emit = (next: Record<string, string>) => {
    setAssigned(next);
    onChange({ classifications: next });
  };

  const moveTo = (fileId: string, category: string) => emit({ ...assigned, [fileId]: category });
  const moveOut = (fileId: string) => {
    const next = { ...assigned };
    delete next[fileId];
    emit(next);
  };

  const pending = files.filter((f) => !assigned[f.id]);

  const onDropInto = (category: string, e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const fileId = e.dataTransfer.getData('text/file-id');
    if (fileId) moveTo(fileId, category);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        把文件拖到对应文件夹完成归类；触屏可先点文件、再点文件夹。归错可拖回或点击移出。
      </p>

      {/* 待归档文件区 */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="mb-2 text-sm font-medium">待归档文件（{pending.length}）</div>
        {pending.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">全部文件已归档 ✓（点击下方文件夹中的文件可移出调整）</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {pending.map((f) => (
              <div
                key={f.id}
                draggable={!disabled}
                onDragStart={(e) => { e.dataTransfer.setData('text/file-id', f.id); e.dataTransfer.effectAllowed = 'move'; }}
                onClick={() => !disabled && setPicked(picked === f.id ? null : f.id)}
                className={`flex cursor-grab items-center gap-2 rounded-lg border bg-card px-3 py-2.5 select-none active:cursor-grabbing ${
                  picked === f.id ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/60'
                } ${disabled ? 'pointer-events-none opacity-70' : ''}`}
                role="button"
                aria-label={`文件 ${f.name}`}
              >
                <span className="text-xl leading-none">{iconFor(f.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{f.name}</span>
                  {f.size ? <span className="block text-xs text-muted-foreground">{f.size}</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}
        {picked && !disabled && <div className="mt-2 text-xs text-primary">已选中「{files.find((f) => f.id === picked)?.name}」——点击目标文件夹归档</div>}
      </div>

      {/* 文件夹区 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {categories.map((cat) => {
          const inside = files.filter((f) => assigned[f.id] === cat);
          return (
            <div
              key={cat}
              onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDropTarget(cat); } }}
              onDragLeave={() => setDropTarget((t) => (t === cat ? null : t))}
              onDrop={(e) => onDropInto(cat, e)}
              onClick={() => {
                if (disabled || !picked) return;
                moveTo(picked, cat);
                setPicked(null);
              }}
              className={`min-h-32 rounded-lg border-2 border-dashed p-3 transition-colors ${
                dropTarget === cat || (picked && !disabled)
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card'
              } ${disabled ? 'pointer-events-none opacity-80' : picked ? 'cursor-pointer' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium">📁 {cat}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{inside.length} 个</span>
              </div>
              <div className="space-y-1">
                {inside.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    draggable={!disabled}
                    onDragStart={(e) => { e.dataTransfer.setData('text/file-id', f.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onClick={(e) => { e.stopPropagation(); if (!disabled) moveOut(f.id); }}
                    disabled={disabled}
                    title="点击移出（撤销归档）"
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-muted/60"
                  >
                    <span>{iconFor(f.name)}</span>
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-muted-foreground hover:text-destructive">✕</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
