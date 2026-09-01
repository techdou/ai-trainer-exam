'use client';

import { useState } from 'react';

/**
 * 判分反馈可视化：学员标注 vs 标准答案叠加对比。
 * 颜色全部走设计 token(CSS 变量), 与全站墨青绿/暖橙体系一致:
 * - 暖橙实线 = 你的标注(位置正确)
 * - 砖红实线 + "偏了" = 你的标注(位置偏离, 需要调整)
 * - 砖红虚线 + "多标" = 多余的标注
 * - 墨青绿虚线 = 标准答案; 墨青绿粗虚线 + "漏标" = 漏掉的标准答案
 * 颜色+线型+文字三通道, 色弱学员也能分辨(不用蓝/绿对色)。
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

// bounding_box 与 image_annotation 走同一评分器(details 含 pairs),反馈可视化同样适用。
const ANNOTATION_TASK_KINDS = new Set(['image_annotation', 'bounding_box', 'point_annotation', 'polyline_annotation', 'polygon_annotation']);
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
  mode = 'student',
}: {
  taskType: string;
  imageUrl?: string;
  submission: unknown;
  answerKey: unknown;
  details: AnnotationFeedbackDetails;
  /** student=学员练习反馈(正确/偏了/多标细分教学文案); review=复核页(只对比 学生作答 vs 老师答案参考, 小图)。 */
  mode?: 'student' | 'review';
}) {
  const review = mode === 'review';
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
    if (taskType === 'image_annotation') {
      return (
        <rect key={`e${i}`} x={s.x} y={s.y} width={s.width ?? 0} height={s.height ?? 0}
          fill="none" style={{ stroke: 'var(--primary)' }} strokeWidth={width} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
      );
    }
    if (taskType === 'point_annotation') {
      return <circle key={`e${i}`} cx={s.x} cy={s.y} r={0.016} fill="none" style={{ stroke: 'var(--primary)' }} strokeWidth={width} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
    }
    if (taskType === 'polygon_annotation') {
      return <polygon key={`e${i}`} points={svg(s.points)} style={{ fill: 'var(--primary)', fillOpacity: 0.06, stroke: 'var(--primary)' }} strokeWidth={width} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
    }
    return <polyline key={`e${i}`} points={svg(s.points)} fill="none" style={{ stroke: 'var(--primary)' }} strokeWidth={width} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
  };

  const renderMine = (s: Shape, i: number) => {
    const pair = pairs.find(p => p.submittedIndex === i);
    const matched = Boolean(pair);
    const good = matched && pairPassed(pair!);
    // 复核模式: 学员作答统一一色实线, 对错由"逐条对比"承担; 学员模式保留三态教学语义。
    const stroke = review ? 'var(--accent)' : (matched && good ? 'var(--accent)' : 'var(--destructive)');
    const dash = review ? undefined : (matched ? undefined : '6 4');
    const fillOpacity = 0.10;
    if (taskType === 'image_annotation') {
      return (
        <g key={`m${i}`}>
          <rect x={s.x} y={s.y} width={s.width ?? 0} height={s.height ?? 0}
            style={{ fill: stroke, fillOpacity }} stroke="none" strokeWidth={2} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
          <rect x={s.x} y={s.y} width={s.width ?? 0} height={s.height ?? 0}
            fill="none" style={{ stroke }} strokeWidth={2} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
          <text x={s.x} y={Math.max(0.02, s.y - 0.008)} fontSize={0.028} style={{ fill: stroke }}>
            {s.label}{matched ? '' : ' ·多标'}{matched && !good ? ' ·偏了' : ''}
          </text>
        </g>
      );
    }
    if (taskType === 'point_annotation') {
      return (
        <g key={`m${i}`}>
          <circle cx={s.x} cy={s.y} r={0.012} style={{ fill: stroke }} />
          <circle cx={s.x} cy={s.y} r={0.02} fill="none" style={{ stroke }} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </g>
      );
    }
    if (taskType === 'polygon_annotation') {
      return <polygon key={`m${i}`} points={svg(s.points)} style={{ fill: stroke, fillOpacity, stroke }} strokeWidth={2} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
    }
    return <polyline key={`m${i}`} points={svg(s.points)} fill="none" style={{ stroke }} strokeWidth={2} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />;
  };

  return (
    <div className="space-y-3">
      <div className={`relative overflow-hidden rounded-lg border ${review ? 'mx-auto max-w-sm' : ''}`}>
        {imageUrl ? <FeedbackImage src={imageUrl} /> : (
          <div className="flex h-64 items-center justify-center text-muted-foreground">图片未配置</div>
        )}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          {expected.map(renderExpected)}
          {mine.map(renderMine)}
        </svg>
      </div>

      {/* 图例: 复核模式只保留 学生作答 vs 老师答案参考 两色对比; 学员模式保留三态教学语义。 */}
      {review ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-accent" /> 学生作答</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-dashed border-primary" /> 老师答案参考</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-accent" /> 你的标注（正确）</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-destructive" /> 你的标注（偏了）</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-dashed border-destructive" /> 多余标注</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-2 border-dashed border-primary" /> 标准答案</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-5 border-t-[3px] border-dashed border-primary" /> 漏标位置</span>
        </div>
      )}

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
              <li className="text-destructive">✗ 有 {details.missed} 个目标没有标出来（看「漏标」粗虚线标记的位置）</li>
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


/** 反馈对比图: 加载失败自动重试两次,仍失败给「点击重试」占位,绝不静默空白。 */
function FeedbackImage({ src }: { src: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  return failed ? (
    <button
      type="button"
      onClick={() => { setFailed(false); setAttempt((a) => a + 1); }}
      className="flex h-64 w-full items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      🖼 图片加载失败（网络抖动或服务重启窗口），点击重试
    </button>
  ) : (
    <img
      key={attempt}
      src={src}
      alt="标注对比"
      className="block w-full select-none"
      draggable={false}
      onError={() => { setAttempt((a) => { if (a >= 2) setFailed(true); return a + 1; }); }}
    />
  );
}
