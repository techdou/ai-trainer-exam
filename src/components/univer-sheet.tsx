'use client';

/**
 * Univer 电子表格内核封装（Excel 类实操题共用）。
 * - Univer 类 API + preset-sheets-core 插件包启动，功能闸门(toolbar/formulaBar/contextMenu/header)按题型裁剪
 *   注意: 开源 preset-sheets-core 不含样式工具栏按钮(填充色/边框等在 Pro 包), 需要工具交互的题型用 onReady + createExcelOps 自建引导工具栏
 * - 命令执行防抖 300ms 后把 workbook 快照 getter 交给上层做语义导出
 * - 初始化一次（题型不换）；卸载即销毁实例
 */
import { useEffect, useRef, useState } from 'react';
import { Univer, LocaleType, merge, BorderType, BorderStyleTypes, type ICellData, type IStyleData, type IWorkbookData } from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import type { FRange, FWorksheet } from '@univerjs/sheets/facade';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverSheetsCoreZhCN from '@univerjs/preset-sheets-core/locales/zh-CN';
import '@univerjs/preset-sheets-core/lib/index.css';

export interface UniverFeature {
  toolbar?: boolean;
  formulaBar?: boolean;
  contextMenu?: boolean;
  header?: boolean;
}

export default function UniverSheet({
  initialWorkbook, feature, onChange, onReady, height = 420, disabled,
}: {
  initialWorkbook: IWorkbookData;
  feature?: UniverFeature;
  onChange?: (getSnapshot: () => IWorkbookData | null) => void;
  /** 实例就绪后回调, 上层可借此拿到 FUniver 构建引导工具栏操作。 */
  onReady?: (api: FUniver) => void;
  height?: number;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let off: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const preset = UniverSheetsCorePreset({
      container: containerRef.current,
      toolbar: feature?.toolbar ?? false,
      formulaBar: feature?.formulaBar ?? false,
      contextMenu: feature?.contextMenu ?? false,
      header: feature?.header ?? false,
    });
    const locales = { [LocaleType.ZH_CN]: merge({}, UniverSheetsCoreZhCN, preset.locales?.[LocaleType.ZH_CN] ?? {}) };
    const univer = new Univer({ locale: LocaleType.ZH_CN, locales });
    univer.registerPlugins(preset.plugins.map((pl) => (Array.isArray(pl) ? pl : [pl])) as Parameters<typeof univer.registerPlugins>[0]);
    const univerAPI = FUniver.newAPI(univer);
    univerAPI.createWorkbook(initialWorkbook);
    onReady?.(univerAPI);

    const readyAt = Date.now();
    const dis = univerAPI.onCommandExecuted?.(() => {
      if (Date.now() - readyAt < 800) return; // 初始化命令风暴(createWorkbook/首渲染)不触发导出
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (cancelled) return;
        onChange?.(() => {
          try {
            return univerAPI.getActiveWorkbook()?.getSnapshot() ?? null;
          } catch {
            return null;
          }
        });
      }, 300);
    });
    off = () => { try { (dis as unknown as () => void)?.(); } catch { /* noop */ } };

    if (!cancelled) setReady(true);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      off?.();
      try { univerAPI.dispose(); } catch { /* noop */ }
      try { univer.dispose(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ height }} className={`univer-exam-host overflow-hidden rounded-lg border ${disabled ? 'pointer-events-none opacity-90' : ''}`}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && <div className="p-6 text-sm text-muted-foreground">电子表格加载中…</div>}
    </div>
  );
}

/* ─────────────── 题型数据构建与语义导出工具 ─────────────── */

/** 用行列二维数据构建最小 IWorkbookData；highlightCells: "B2" 式坐标集合(浅黄底提示可编辑)。 */
const GROUP_LABELS: Record<string, string> = {
  records: '数据记录', reviews: '评论', trafficLights: '红绿灯', targets: '标注目标',
};

export function sourceGroupLabel(key: string): string {
  return GROUP_LABELS[key] ?? key;
}

export function buildSheetWorkbook({ columns, rows, highlightCells, extraRows, dataOffset, sourceGroups }: {
  columns: string[];
  rows: (string | number)[][];
  highlightCells?: Set<string>;
  /** 追加在数据区之后(隔一空行)的预置行,如汇总区标签行 */
  extraRows?: (string | number)[][];
  /** 高亮坐标相对数据首行(row=1)的额外偏移: stats_table 类题型坐标系不含表头行 */
  dataOffset?: number;
  /** 源数据分组: 生成「源数据」第二工作表(stats_table 的 sourceMode:'sheet' 进阶模式, 可跨表 COUNTIF) */
  sourceGroups?: Record<string, string[]>;
}): IWorkbookData {
  const cellData: Record<number, Record<number, { v: string | number; s?: string }>> = {};
  const styles: Record<string, Record<string, unknown>> = {};
  // 表头仅灰底+加粗(bl), 不带边框——否则边框判分步骤白送分。
  styles.hd = { bg: { rgb: '#F3F4F6' }, bl: 1 };
  if (highlightCells?.size) styles.hl = { bg: { rgb: '#FFF7D6' } };

  columns.forEach((c, i) => { (cellData[0] ??= {})[i] = { v: c, s: 'hd' }; });
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const key = `${String.fromCharCode(65 + c)}${r + 2 - (dataOffset ?? 0)}`;
      (cellData[r + 1] ??= {})[c] = highlightCells?.has(key) ? { v: cell, s: 'hl' } : { v: cell };
    });
  });
  (extraRows ?? []).forEach((row, i) => {
    row.forEach((cell, c) => {
      if (cell !== '' && cell !== null && cell !== undefined) {
        (cellData[rows.length + 2 + i] ??= {})[c] = { v: cell };
      }
    });
  });

  const sheets: IWorkbookData['sheets'] = {
    'sheet-1': { id: 'sheet-1', name: '统计表', cellData, rowCount: rows.length + 2, columnCount: Math.max(columns.length, 8) },
  };
  const order = ['sheet-1'];
  if (sourceGroups && Object.keys(sourceGroups).length > 0) {
    const srcCd: Record<number, Record<number, { v: string; s?: string }>> = {};
    let r = 0;
    for (const [key, list] of Object.entries(sourceGroups)) {
      (srcCd[r] ??= {})[0] = { v: sourceGroupLabel(key), s: 'hd' };
      r++;
      list.forEach((item) => { (srcCd[r] ??= {})[0] = { v: item }; r++; });
      r++; // 组间空行
    }
    sheets['sheet-src'] = { id: 'sheet-src', name: '源数据', cellData: srcCd, rowCount: r + 2, columnCount: 4 };
    order.push('sheet-src');
  }
  return {
    id: 'exam-wb', name: '工作簿', appVersion: '0.0.0', locale: LocaleType.ZH_CN,
    styles, sheetOrder: order, sheets,
  } as unknown as IWorkbookData;
}

/** 从快照取首个 sheet 的 cellData（{[row]:{[col]:{v,f,s}}}）。 */
export function extractCellData(snapshot: IWorkbookData | null): Record<number, Record<number, { v?: unknown; f?: string; s?: unknown }>> {
  const sheet = snapshot && Object.values(snapshot.sheets)[0];
  return (sheet?.cellData ?? {}) as Record<number, Record<number, { v?: unknown; f?: string; s?: unknown }>>;
}

/** "B2" → { col: 1, row: 1 }（0 基）。 */
export function parseCellKey(key: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(key.trim().toUpperCase());
  if (!m) return { col: -1, row: -1 };
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) - 1 };
}

type CellStyleLike = { bg?: { rgb?: string }; bl?: unknown; bd?: { t?: unknown; b?: unknown; l?: unknown; r?: unknown } };

/** 读快照某单元格样式的背景色（rgb，无则 null）。 */
export function cellBg(snapshot: IWorkbookData | null, row: number, col: number): string | null {
  const cd = extractCellData(snapshot);
  const cell = cd[row]?.[col];
  const styles = (snapshot?.styles ?? {}) as Record<string, CellStyleLike>;
  if (!cell?.s) return null;
  const st = typeof cell.s === 'string' ? styles[cell.s] : (cell.s as CellStyleLike);
  return st?.bg?.rgb ?? null;
}

/* ─────────────── Excel 综合题引导工具栏原子操作 ─────────────── */

/** 当前用户选中区域(0 基行列 + 行列数), 无选中返回 null。 */
export interface ExcelSelection { row: number; col: number; numRows: number; numCols: number }

/**
 * 基于 FUniver 的引导工具栏原子操作集。
 * 语义分层: 值/公式类(流程引导, 自动算好写入)与样式类(作用于学员当前选中区域, 保留选区考察)。
 */
export interface ExcelOps {
  getSheet(): FWorksheet | null;
  getSelection(): ExcelSelection | null;
  /** 从 (startRow,startCol) 起写入二维值块。 */
  setRangeValues(startRow: number, startCol: number, values: (string | number)[][]): void;
  /** 读取 (startRow,startCol) 起 numRows×numCols 区域的当前显示值。 */
  getRangeValues(startRow: number, startCol: number, numRows: number, numCols: number): string[][];
  /** 给学员当前选中区域加全边框; 无选中返回 false。 */
  borderSelection(): boolean;
  /** 给学员当前选中区域填背景色(hex); 无选中返回 false。 */
  bgSelection(hex: string): boolean;
  /** 给学员当前选中区域设置数字格式(pattern 如 "0.00"); 无选中返回 false。 */
  decimalSelection(pattern: string): boolean;
}

export function createExcelOps(api: FUniver): ExcelOps {
  const getSheet = (): FWorksheet | null => {
    try { return api.getActiveWorkbook()?.getActiveSheet() ?? null; } catch { return null; }
  };
  const selRange = (): FRange | null => {
    try { return getSheet()?.getActiveRange() ?? null; } catch { return null; }
  };
  return {
    getSheet,
    getSelection: () => {
      const r = selRange();
      if (!r) return null;
      return { row: r.getRow(), col: r.getColumn(), numRows: r.getHeight(), numCols: r.getWidth() };
    },
    setRangeValues(startRow, startCol, values) {
      const ws = getSheet();
      if (!ws || !values.length || !values[0].length) return;
      ws.getRange(startRow, startCol, values.length, values[0].length).setValues(values);
    },
    getRangeValues(startRow, startCol, numRows, numCols) {
      const ws = getSheet();
      if (!ws || numRows <= 0 || numCols <= 0) return [];
      try {
        const grid = ws.getRange(startRow, startCol, numRows, numCols).getDisplayValues() as unknown;
        return (grid as unknown[][])?.map(row => row.map(c => (c == null ? '' : String(c)))) ?? [];
      } catch { return []; }
    },
    borderSelection() {
      const r = selRange();
      if (!r) return false;
      r.setBorder(BorderType.ALL, BorderStyleTypes.THIN);
      return true;
    },
    bgSelection(hex) {
      const r = selRange();
      if (!r) return false;
      r.setBackgroundColor(hex);
      return true;
    },
    decimalSelection(pattern) {
      const r = selRange();
      if (!r) return false;
      // 读原单元格数据, 仅追加数字格式样式(s.n.pattern, IStyleData 的 Numfmt 字段)后整块写回(保留已有值/背景)。
      const grid = r.getCellDataGrid() as unknown as (ICellData | null | undefined)[][];
      const next = grid.map(row => row.map(cell => {
        const c = (cell ?? {}) as ICellData & { s?: IStyleData };
        const prevStyle = (c.s ?? {}) as IStyleData;
        return { ...c, s: { ...prevStyle, n: { pattern } } } as ICellData;
      }));
      r.setValues(next);
      return true;
    },
  };
}

/** 读快照某单元格是否存在边框（IStyleData.bd 的任一边; 注意 bl 是加粗不是边框）。 */
export function cellHasBorder(snapshot: IWorkbookData | null, row: number, col: number): boolean {
  const cd = extractCellData(snapshot);
  const cell = cd[row]?.[col];
  const styles = (snapshot?.styles ?? {}) as Record<string, CellStyleLike>;
  if (!cell?.s) return false;
  const st = typeof cell.s === 'string' ? styles[cell.s] : (cell.s as CellStyleLike);
  const bd = st?.bd;
  return Boolean(bd?.t || bd?.b || bd?.l || bd?.r);
}
