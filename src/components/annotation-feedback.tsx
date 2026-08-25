'use client';

/**
 * 判分反馈可视化：学员标注 vs 标准答案叠加对比。
 * - 蓝色实线 = 你的标注（位置基本正确）
 * - 琥珀色实线 = 你的标注（位置偏离，需要调整）
 * - 红色虚线 + "多标" = 多余的标注
 * - 绿色粗虚线 + "漏标" = 漏掉的标准答案
 * 下方逐条列出匹配度（不出现 IoU 等术语，学员只看百分比和哪里错）。
 * pairs 数据来自评分器 details（image_annotation 用 iou，其余用 score）。
 */

interface Point { x: number; y: number }
interface Shape extends Point { width?: number; height?: number; label: string; points?: Point[] }
interface PairDetail { expectedIndex: number; submittedIndex: number; iou?: number; score?: number }

export interface AnnotationFeedbackDetails {
  pairs?: PairDetail[];
  missed?: number;
  extra?: number;
  threshold?: number;
}

const ANNOTATION_TASK_KINDS = new Set(['image_annotation', 'point_annotation', 'polyline_annotation', 'polygon_annotation']);
export function isAnnotationTaskType(taskType: string): boolean {
  return ANNOTATION_TASK_KINDS.has(taskType);
}

function collectShapes(source: unknown, taskType: string): Shape[] {
  const record = (source && typeof source === 'object' ? source : {}) as Record<string, unknown>;
  const key =
    taskType === 'image_annotation' ? 'boxes'
    : taskType === 'point_annotation' ? 'points'
    : taskType === 'polyline_annotation' ? 'lines'
    : 'polygons';
  return (Array.isArray(record[key]) ? record[key] : []) as Shape[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function AnnotationFeedback({
  taskType,
  imageUrl,
  submission,
  answerKey,
  details,
}: {
  taskType: string;
  imageUrl?: string;
  submission: unknown;
  answerKey: unknown;
  details: AnnotationFeedbackDetails;
}) {
  const mine = collectShapes(submission, taskType);
  const expected = collectShapes(answerKey, taskType);
  const pairs = details.pairs ?? [];
  const matchedExpected = new Set(pairs.map(p => p.expectedIndex));
  const matchedSubmitted = new Set(pairs.map(p => p.submittedIndex));
  // 合格线: 与评分器 correct 判定同一口径(image/polygon 用 threshold, 折线相似度同标准兜底 0.45)。
  const passLine = Math.max(details.threshold ?? 0.45, 0.45);

  const pairScore = (p: PairDetail) => p.iou ?? p.score ?? 0;
  const pairPassed = (p: PairDetail) => pairScore(p) >= passLine;

  const svg = (pts: Point[] | undefined) => (pts ?? []).map(p => `${p.x},${p.y}`).join(' ');

  const renderExpected = (s: Shape, i: number) => {
    const missed = !matchedExpected.has(i);
    const width = missed ? 3 : 1.5;
    const dash = missed ? '8 4' : '4 4';
    const stroke = '#16a34a';
    if (taskType === 'image_annotation') {
      return (
        <rect key={`e${i}`} x={s.x} y={s.y} width={s.width ?? 0} height={s.height ?? 0}
          fill="none" stroke={stroke} strokeWidth={width} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
      );
    }
    if (taskType === 'point_annotation') {
      return <circle key={`e${i}`} cx={s.x} cy={s.y} r={3} fill="none" stroke={stroke} strokeWidth={width} vectorEffect="non-scaling-stroke" />;
    }
    if (taskType === 'polygon_annotation') {
      return <polygon key={`e${i}`} points={svg(s.points)} fill="rgba(22,163,74,0.08)" stroke={stroke} strokeWidth={width} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
    }
    return <polyline key={`e${i}`} points={svg(s.points)} fill="none" stroke={stroke} strokeWidth={width} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
  };

  const renderMine = (s: Shape, i: number) => {
    const pair = pairs.find(p => p.submittedIndex === i);
    const matched = Boolean(pair);
    const good = matched && pairPassed(pair!);
    const stroke = matched ? (good ? '#2563eb' : '#d97706') : '#dc2626';
    const dash = matched ? undefined : '6 4';
    if (taskType === 'image_annotation') {
      return (
        <g key={`m${i}`}>
          <rect x={s.x} y={s.y} width={s.width ?? 0} height={s.height ?? 0}
            fill={good ? 'rgba(37,99,235,0.10)' : matched ? 'rgba(217,119,6,0.10)' : 'rgba(220,38,38,0.08)'}
            stroke={stroke} strokeWidth={2} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
          <text x={s.x} y={Math.max(0.02, s.y - 0.008)} fontSize={0.028} fill={stroke}>
            {s.label}{matched ? '' : ' ·多标'}
          </text>
        </g>
      );
    }
    if (taskType === 'point_annotation') {
      return <circle key={`m${i}`} cx={s.x} cy={s.y} r={4} fill={stroke} />;
    }
    if (taskType === 'polygon_annotation') {
      return <polygon key={`m${i}`} points={svg(s.points)} fill="rgba(37,99,235,0.10)" stroke={stroke} strokeWidth={2} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
    }
    return <polyline key={`m${i}`} points={svg(s.points)} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border">
        {imageUrl ? (
          <img src={imageUrl} alt="标注对比" className="block w-full select-none" draggable={false} />
        ) : (
          <div className="flex h-64 items-center justify-center text-muted-foreground">图片未配置</div>
        )}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          {expected.map(renderExpected)}
          {mine.map(renderMine)}
        </svg>
      </div>

      {/* 图例：颜色 + 文字双通道表达状态 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-blue-600" /> 你的标注</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-dashed border-green-600" /> 标准答案</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-dashed border-red-600" /> 多余标注</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-[3px] border-dashed border-green-600" /> 漏标位置</span>
      </div>

      {(pairs.length > 0 || (details.missed ?? 0) > 0 || (details.extra ?? 0) > 0) && (
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">逐条对比</p>
          <ul className="space-y-1 text-sm">
            {pairs.map((p, i) => (
              <li key={i} className="flex items-center justify-between">
                <span>你的标注 #{p.submittedIndex + 1} ↔ 标准答案 #{p.expectedIndex + 1}（{expected[p.expectedIndex]?.label ?? ''}）</span>
                <span className={pairPassed(p) ? 'text-success font-medium' : 'text-destructive font-medium'}>
                  {pairPassed(p) ? '✓' : '✗'} 匹配度 {pct(pairScore(p))}
                </span>
              </li>
            ))}
            {(details.missed ?? 0) > 0 && (
              <li className="text-destructive">✗ 有 {details.missed} 个目标没有标出来（看绿色粗虚线位置）</li>
            )}
            {(details.extra ?? 0) > 0 && (
              <li className="text-destructive">✗ 有 {details.extra} 个多余标注（看红色虚线框）</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
