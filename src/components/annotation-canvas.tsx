'use client';

import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Annotation Canvas — shared by calibration tool and exam task input.
 * Supports four annotation tools: bbox, point, polyline, polygon.
 * All coordinates are normalized 0..1 relative to the image.
 */

export type AnnotationTool = 'bbox' | 'point' | 'polyline' | 'polygon';

export interface NormalizedPoint { x: number; y: number }

export interface BoxAnnotation extends NormalizedPoint {
  width: number;
  height: number;
  label: string;
  attributes?: Record<string, string>;
}

export interface LineAnnotation {
  points: NormalizedPoint[];
  label: string;
  attributes?: Record<string, string>;
}

export interface AnnotationData {
  boxes?: BoxAnnotation[];
  points?: Array<NormalizedPoint & { label: string; attributes?: Record<string, string> }>;
  lines?: LineAnnotation[];
  polygons?: LineAnnotation[];
}

interface Props {
  imageUrl?: string;
  tool: AnnotationTool;
  labels: string[];
  attributesConfig?: Record<string, string[]>;
  value: AnnotationData;
  onChange: (value: AnnotationData) => void;
  /** showAnswerKey mode: display existing annotations as reference (read-only) */
  readOnly?: boolean;
  /** image natural size hint for aspect ratio */
  minHeight?: number;
}

export function AnnotationCanvas({
  imageUrl,
  tool,
  labels,
  attributesConfig,
  value,
  onChange,
  readOnly = false,
  minHeight = 360,
}: Props) {
  const [activeLabel, setActiveLabel] = useState(labels[0] ?? 'target');
  const [activeAttribute, setActiveAttribute] = useState('');
  const [dragStart, setDragStart] = useState<NormalizedPoint | null>(null);
  const [dragCur, setDragCur] = useState<NormalizedPoint | null>(null); // bbox 拖拽实时预览点
  const [draftPoints, setDraftPoints] = useState<NormalizedPoint[]>([]);
  const [imgError, setImgError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset error state when image URL changes
  useEffect(() => { setImgError(false); }, [imageUrl]);

  const boxes = value.boxes ?? [];
  const points = value.points ?? [];
  const lines = value.lines ?? [];
  const polygons = value.polygons ?? [];

  const attrOptions = attributesConfig?.[activeLabel] ?? [];
  const attrs = activeAttribute ? { state: activeAttribute } : undefined;

  const getRelative = useCallback((e: React.MouseEvent): NormalizedPoint => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (readOnly) return;
    const p = getRelative(e);
    if (tool === 'point') {
      onChange({ ...value, points: [...points, { ...p, label: activeLabel, attributes: attrs }] });
      return;
    }
    if (tool === 'bbox') {
      setDragStart(p);
      return;
    }
    // polyline / polygon: add point to draft
    setDraftPoints((prev) => [...prev, p]);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart) return;
    setDragCur(getRelative(e));
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (readOnly || !dragStart || tool !== 'bbox') return;
    const p = getRelative(e);
    const box: BoxAnnotation = {
      x: Math.min(dragStart.x, p.x),
      y: Math.min(dragStart.y, p.y),
      width: Math.abs(dragStart.x - p.x),
      height: Math.abs(dragStart.y - p.y),
      label: activeLabel,
      attributes: attrs,
    };
    setDragStart(null);
    setDragCur(null);
    if (box.width > 0.005 && box.height > 0.005) {
      onChange({ ...value, boxes: [...boxes, box] });
    }
  };

  const finishLine = () => {
    const minPoints = tool === 'polygon' ? 3 : 2;
    if (draftPoints.length < minPoints) return;
    const item: LineAnnotation = { points: draftPoints, label: activeLabel, attributes: attrs };
    if (tool === 'polygon') {
      onChange({ ...value, polygons: [...polygons, item] });
    } else {
      onChange({ ...value, lines: [...lines, item] });
    }
    setDraftPoints([]);
  };

  const cancelDraft = () => setDraftPoints([]);

  const clearAll = () => {
    if (tool === 'bbox') onChange({ ...value, boxes: [] });
    else if (tool === 'point') onChange({ ...value, points: [] });
    else if (tool === 'polygon') onChange({ ...value, polygons: [] });
    else onChange({ ...value, lines: [] });
  };

  const deleteBox = (index: number) => onChange({ ...value, boxes: boxes.filter((_, i) => i !== index) });
  const deletePoint = (index: number) => onChange({ ...value, points: points.filter((_, i) => i !== index) });
  const deleteLine = (index: number) => onChange({ ...value, lines: lines.filter((_, i) => i !== index) });
  const deletePolygon = (index: number) => onChange({ ...value, polygons: polygons.filter((_, i) => i !== index) });

  const toSvgPoints = (pts: NormalizedPoint[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

  const shapes = useMemo(() => ({ boxes, points, lines, polygons }), [boxes, points, lines, polygons]);
  const totalCount = boxes.length + points.length + lines.length + polygons.length;

  return (
    <div className="space-y-3">
      {/* Label & attribute selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="self-center text-sm font-medium">label:</span>
        {labels.map((x) => (
          <Button
            type="button"
            key={x}
            size="sm"
            variant={activeLabel === x ? 'default' : 'outline'}
            onClick={() => { setActiveLabel(x); setActiveAttribute(''); }}
          >
            {x}
          </Button>
        ))}
        {attrOptions.length > 0 && (
          <select
            value={activeAttribute}
            onChange={(e) => setActiveAttribute(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">attribute</option>
            {attrOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`relative overflow-hidden rounded-lg border bg-muted ${readOnly ? 'cursor-default' : 'cursor-crosshair'}`}
        style={{ minHeight: `${minHeight}px` }}
      >
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt="annotation target"
            className="block w-full select-none"
            draggable={false}
            onError={() => setImgError(true)}
          />
        ) : imageUrl && imgError ? (
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground" style={{ minHeight: `${minHeight}px` }}>
            <span className="text-destructive">图片加载失败</span>
            <span className="text-sm">{imageUrl}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center text-muted-foreground" style={{ minHeight: `${minHeight}px` }}>
            image not configured
          </div>
        )}

        {/* SVG overlay for polylines & polygons */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          {shapes.polygons.map((l, i) => (
            <g key={`pg-${i}`}>
              <polygon
                points={toSvgPoints(l.points)}
                fill="rgba(37,99,235,0.15)"
                stroke="#2563eb"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
          {shapes.lines.map((l, i) => (
            <polyline
              key={`pl-${i}`}
              points={toSvgPoints(l.points)}
              fill="none"
              stroke="#2563eb"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {draftPoints.length > 1 && (
            <polyline
              points={toSvgPoints(draftPoints)}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* bbox 拖拽实时预览 */}
        {dragStart && dragCur && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-amber-500"
            style={{
              left: `${Math.min(dragStart.x, dragCur.x) * 100}%`,
              top: `${Math.min(dragStart.y, dragCur.y) * 100}%`,
              width: `${Math.abs(dragStart.x - dragCur.x) * 100}%`,
              height: `${Math.abs(dragStart.y - dragCur.y) * 100}%`,
            }}
          />
        )}

        {/* Bounding boxes overlay */}
        {shapes.boxes.map((b, i) => (
          <div
            key={`box-${i}`}
            className="group pointer-events-auto absolute border-2 border-primary"
            style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }}
          >
            <span className="absolute left-0 top-0 bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
              {b.label}{b.attributes?.state ? ` | ${b.attributes.state}` : ''}
            </span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => deleteBox(i)}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="delete box"
              >
                x
              </button>
            )}
          </div>
        ))}

        {/* Points overlay */}
        {shapes.points.map((p, i) => (
          <div
            key={`pt-${i}`}
            className="group absolute"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: 'translate(-50%, -50%)' }}
          >
            <span className="block h-3 w-3 rounded-full border-2 border-white bg-red-500 shadow" />
            <span className="absolute left-4 top-0 whitespace-nowrap bg-red-500 px-1 text-xs text-white">
              {p.label}
            </span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => deletePoint(i)}
                className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="delete point"
              >
                x
              </button>
            )}
          </div>
        ))}

        {/* Line/polygon delete buttons */}
        {!readOnly && shapes.lines.map((_, i) => (
          <button
            key={`del-line-${i}`}
            type="button"
            onClick={() => deleteLine(i)}
            className="absolute right-2 rounded bg-destructive/90 px-2 py-0.5 text-xs text-white"
            style={{ top: `${8 + i * 28}px` }}
          >
            delete line {i + 1}
          </button>
        ))}
        {!readOnly && shapes.polygons.map((_, i) => (
          <button
            key={`del-pg-${i}`}
            type="button"
            onClick={() => deletePolygon(i)}
            className="absolute right-2 rounded bg-destructive/90 px-2 py-0.5 text-xs text-white"
            style={{ top: `${8 + (shapes.lines.length + i) * 28}px` }}
          >
            delete contour {i + 1}
          </button>
        ))}

        {/* Draft points */}
        {draftPoints.map((p, i) => (
          <span
            key={`draft-${i}`}
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          />
        ))}

        {/* Drag preview */}
        {dragStart && (
          <div
            className="pointer-events-none absolute border-2 border-amber-400 bg-amber-400/10"
            style={{
              left: `${dragStart.x * 100}%`,
              top: `${dragStart.y * 100}%`,
            }}
          />
        )}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {(tool === 'polyline' || tool === 'polygon') && (
          <>
            <Button type="button" size="sm" onClick={finishLine} disabled={draftPoints.length < (tool === 'polygon' ? 3 : 2)}>
              finish {tool === 'polygon' ? 'contour' : 'line'} ({draftPoints.length} pts)
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={cancelDraft} disabled={draftPoints.length === 0}>
              cancel draft
            </Button>
          </>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {totalCount} annotation{totalCount !== 1 ? 's' : ''}
        </span>
        {!readOnly && totalCount > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
            clear all
          </Button>
        )}
      </div>
    </div>
  );
}
