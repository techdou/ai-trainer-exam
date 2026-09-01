/**
 * 确定性评分引擎。
 *
 * 约束：
 * - 正式成绩不得依赖 LLM、网络、当前时间或随机数。
 * - 所有评分结果以 0..1 比例返回；业务层再乘以题目分值。
 * - 输入必须经过运行时校验，缺字段不能被判为正确。
 */

export interface GraderResult {
  correct: boolean;
  score: number;
  feedback: string;
  graderVersion: string;
  details?: Record<string, unknown>;
}

export interface Grader<TSubmission, TAnswerKey> {
  id: string;
  version: string;
  grade(submission: TSubmission, answerKey: TAnswerKey): GraderResult;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const versionOf = (grader: { id: string; version: string }): string => `${grader.id}@${grader.version}`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
/** 记录型标签比较的统一归一:两端 trim,避免提交带尾随空格被误判。 */
const normLabel = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const unique = <T>(values: T[]): T[] => [...new Set(values)];

function invalid(grader: { id: string; version: string }, message = '提交内容格式不正确'): GraderResult {
  return { correct: false, score: 0, feedback: message, graderVersion: versionOf(grader), details: { invalid: true } };
}

// 1. 单选题。选项键严格限定单个 A-Z 字母,防止把文本型 answer_key 误判为合法选项。
const OPTION_KEY = /^[A-Z]$/;
export interface SingleChoiceSubmission { selectedOption: string }
export interface SingleChoiceAnswerKey { correctOption: string }
export const singleChoiceGrader: Grader<SingleChoiceSubmission, SingleChoiceAnswerKey> = {
  id: 'single_choice', version: '2.1.0',
  grade(submission, answerKey) {
    const selected = asString(submission?.selectedOption).toUpperCase();
    const expected = asString(answerKey?.correctOption).toUpperCase();
    if (!OPTION_KEY.test(expected)) return invalid(singleChoiceGrader, '标准答案选项键配置异常');
    if (!OPTION_KEY.test(selected)) return invalid(singleChoiceGrader);
    const correct = selected === expected;
    return { correct, score: correct ? 1 : 0, feedback: correct ? '做对了！' : `选错了，正确答案是 ${expected}`, graderVersion: versionOf(singleChoiceGrader) };
  },
};

// 2. 判断题
export interface TrueFalseSubmission { answer: boolean }
export interface TrueFalseAnswerKey { correctAnswer: boolean }
export const trueFalseGrader: Grader<TrueFalseSubmission, TrueFalseAnswerKey> = {
  id: 'true_false', version: '2.0.0',
  grade(submission, answerKey) {
    if (typeof submission?.answer !== 'boolean' || typeof answerKey?.correctAnswer !== 'boolean') {
      return invalid(trueFalseGrader);
    }
    const correct = submission.answer === answerKey.correctAnswer;
    return { correct, score: correct ? 1 : 0, feedback: correct ? '做对了！' : `判断错误，正确答案是“${answerKey.correctAnswer ? '正确' : '错误'}”`, graderVersion: versionOf(trueFalseGrader) };
  },
};

// 2b. 填空题。文本模糊匹配，支持多个可接受答案。
export interface FillInBlankSubmission { text: string }
export interface FillInBlankAnswerKey { acceptable: string[]; caseSensitive?: boolean }
/** 归一化中文文本：去首尾空格、全角空格转半角、合并连续空格。 */
function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\u3000/g, ' ').replace(/\s+/g, ' ');
}
export const fillInBlankGrader: Grader<FillInBlankSubmission, FillInBlankAnswerKey> = {
  id: 'fill_in_blank', version: '1.0.0',
  grade(submission, answerKey) {
    const submitted = normalizeText(submission?.text);
    const acceptable = Array.isArray(answerKey?.acceptable) ? answerKey.acceptable : [];
    if (!submitted) return invalid(fillInBlankGrader, '请填写答案');
    if (!acceptable.length) return invalid(fillInBlankGrader, '标准答案未配置');
    const caseSensitive = answerKey.caseSensitive === true;
    const normalizedAcceptable = acceptable.map(a => caseSensitive ? normalizeText(a) : normalizeText(a).toLowerCase());
    const normalizedSubmitted = caseSensitive ? submitted : submitted.toLowerCase();
    const correct = normalizedAcceptable.includes(normalizedSubmitted);
    const displayAnswer = acceptable[0];
    return { correct, score: correct ? 1 : 0, feedback: correct ? '做对了！' : `答案不正确，参考答案是"${displayAnswer}"`, graderVersion: versionOf(fillInBlankGrader) };
  },
};

// 3. Excel 删除行。优先稳定 row_id，兼容旧索引数据。
export interface ExcelDeleteRowsSubmission { retainedRowIds?: string[]; retainedRowIndexes?: number[]; modifiedCells?: Record<string, unknown> }
export interface ExcelDeleteRowsAnswerKey { correctRetainedRowIds?: string[]; correctRetainedRowIndexes?: number[]; forbiddenCellChanges?: boolean }
export const excelDeleteRowsGrader: Grader<ExcelDeleteRowsSubmission, ExcelDeleteRowsAnswerKey> = {
  id: 'excel_delete_rows', version: '2.0.0',
  grade(submission, answerKey) {
    const expected = answerKey?.correctRetainedRowIds?.map(String) ?? answerKey?.correctRetainedRowIndexes?.map(String);
    const actual = submission?.retainedRowIds?.map(String) ?? submission?.retainedRowIndexes?.map(String);
    if (!expected || !actual || !Array.isArray(expected) || !Array.isArray(actual)) return invalid(excelDeleteRowsGrader);
    const expectedSet = new Set(unique(expected));
    const actualSet = new Set(unique(actual));
    const correctlyRetained = [...actualSet].filter(id => expectedSet.has(id)).length;
    const errorRowsStillRetained = [...actualSet].filter(id => !expectedSet.has(id)).length;
    const validRowsWronglyDeleted = [...expectedSet].filter(id => !actualSet.has(id)).length;
    const illegalChanges = submission.modifiedCells ? Object.keys(submission.modifiedCells).length : 0;
    const denominator = Math.max(1, expectedSet.size + errorRowsStillRetained + illegalChanges);
    const score = clamp((correctlyRetained - validRowsWronglyDeleted - illegalChanges) / denominator);
    const correct = errorRowsStillRetained === 0 && validRowsWronglyDeleted === 0 && illegalChanges === 0;
    const feedback: string[] = [];
    if (errorRowsStillRetained) feedback.push(`还有 ${errorRowsStillRetained} 行错误数据没有删除`);
    if (validRowsWronglyDeleted) feedback.push(`误删了 ${validRowsWronglyDeleted} 行正确数据`);
    if (illegalChanges) feedback.push(`修改了 ${illegalChanges} 个不允许修改的单元格`);
    return { correct, score: correct ? 1 : score, feedback: correct ? '做对了！需要删除的行已全部删除，其他数据保持完整。' : feedback.join('；'), graderVersion: versionOf(excelDeleteRowsGrader), details: { errorRowsStillRetained, validRowsWronglyDeleted, illegalChanges } };
  },
};

// 4. 统计填表
export interface StatsTableSubmission { cells: Record<string, string | number> }
export interface StatsTableAnswerKey { correctCells: Record<string, string | number>; numericTolerance?: number; rejectExtraCells?: boolean }
const STRICT_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/;
function parseStrictNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/，/g, ',');
  if (!STRICT_NUMBER.test(text)) return null;
  // 百分比与纯数字同尺度比较(50% 按 50 处理),题库编辑需保证两端单位一致。
  const n = Number(text.replace(/%$/, ''));
  return Number.isFinite(n) ? n : null;
}
export const statsTableGrader: Grader<StatsTableSubmission, StatsTableAnswerKey> = {
  id: 'stats_table', version: '2.0.0',
  grade(submission, answerKey) {
    if (!isRecord(submission?.cells) || !isRecord(answerKey?.correctCells)) return invalid(statsTableGrader);
    const expectedKeys = Object.keys(answerKey.correctCells);
    if (!expectedKeys.length) return invalid(statsTableGrader, '标准答案未配置');
    const tolerance = safeNumber(answerKey.numericTolerance) ?? 0.01;
    let correctCount = 0;
    const wrong: string[] = [];
    for (const cell of expectedKeys) {
      const expected = answerKey.correctCells[cell];
      const actual = submission.cells[cell];
      if (actual === undefined || actual === null || String(actual).trim() === '') { wrong.push(`${cell} 未填写`); continue; }
      const en = parseStrictNumber(expected);
      const an = parseStrictNumber(actual);
      const matches = en !== null && an !== null
        ? Math.abs(en - an) <= tolerance
        : String(actual).trim() === String(expected).trim();
      if (matches) correctCount++; else wrong.push(`${cell} 填写不正确`);
    }
    const extras = answerKey.rejectExtraCells === false ? [] : Object.keys(submission.cells).filter(k => !expectedKeys.includes(k) && String(submission.cells[k]).trim() !== '');
    if (extras.length) wrong.push(`填写了 ${extras.length} 个不应修改的单元格`);
    const score = clamp((correctCount - extras.length) / expectedKeys.length);
    const correct = correctCount === expectedKeys.length && extras.length === 0;
    return { correct, score: correct ? 1 : score, feedback: correct ? '做对了！所有统计结果填写正确。' : wrong.join('；'), graderVersion: versionOf(statsTableGrader), details: { correctCount, total: expectedKeys.length, extraCells: extras } };
  },
};

// 5. 文件分类。键必须是稳定 asset_id；兼容旧文件名。
export interface FileClassifySubmission { classifications: Record<string, string> }
export interface FileClassifyAnswerKey { correctClassifications: Record<string, string> }
export const fileClassifyGrader: Grader<FileClassifySubmission, FileClassifyAnswerKey> = {
  id: 'file_classify', version: '2.0.0',
  grade(submission, answerKey) {
    if (!isRecord(submission?.classifications) || !isRecord(answerKey?.correctClassifications)) return invalid(fileClassifyGrader);
    const keys = Object.keys(answerKey.correctClassifications);
    if (!keys.length) return invalid(fileClassifyGrader, '标准答案未配置');
    let correctCount = 0;
    const wrong: string[] = [];
    for (const id of keys) {
      if (normLabel(submission.classifications[id]) === normLabel(answerKey.correctClassifications[id])) correctCount++;
      else wrong.push(`${id} 分类不正确`);
    }
    const extras = Object.keys(submission.classifications).filter(k => !keys.includes(k));
    const score = clamp((correctCount - extras.length) / keys.length);
    const correct = correctCount === keys.length && extras.length === 0;
    return { correct, score: correct ? 1 : score, feedback: correct ? '做对了！所有文件分类正确。' : [...wrong, ...(extras.length ? [`存在 ${extras.length} 个未知文件`] : [])].join('；'), graderVersion: versionOf(fileClassifyGrader), details: { correctCount, total: keys.length, extras } };
  },
};

// 6. 图片数据清洗
export interface ImageCleanSubmission { decisions: Record<string, 'keep' | 'discard'> }
export interface ImageCleanAnswerKey { correctDecisions: Record<string, 'keep' | 'discard'> }
export const imageCleanGrader: Grader<ImageCleanSubmission, ImageCleanAnswerKey> = {
  id: 'image_clean', version: '2.0.0',
  grade(submission, answerKey) {
    if (!isRecord(submission?.decisions) || !isRecord(answerKey?.correctDecisions)) return invalid(imageCleanGrader);
    const keys = Object.keys(answerKey.correctDecisions);
    if (!keys.length) return invalid(imageCleanGrader, '标准答案未配置');
    let correctCount = 0;
    let missedDiscard = 0;
    let wronglyDiscarded = 0;
    for (const id of keys) {
      const expected = answerKey.correctDecisions[id];
      const actual = submission.decisions[id];
      if (actual === expected) correctCount++;
      else if (expected === 'discard') missedDiscard++; else wronglyDiscarded++;
    }
    const score = correctCount / keys.length;
    const correct = correctCount === keys.length;
    const feedback = correct ? '做对了！错误图片已删除，正确图片均被保留。' : [missedDiscard ? `漏删 ${missedDiscard} 张错误图片` : '', wronglyDiscarded ? `误删 ${wronglyDiscarded} 张正确图片` : ''].filter(Boolean).join('；');
    return { correct, score, feedback, graderVersion: versionOf(imageCleanGrader), details: { missedDiscard, wronglyDiscarded } };
  },
};

// 几何公共类型与工具
export interface Point { x: number; y: number }
export interface BoundingBox extends Point { width: number; height: number; label: string; attributes?: Record<string, string> }
export interface PointAnnotation extends Point { label: string; attributes?: Record<string, string> }
export interface PolylineAnnotation { points: Point[]; label: string; attributes?: Record<string, string>; closed?: boolean }
function validUnit(n: unknown): n is number { return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1; }
function validBox(b: BoundingBox): boolean { return !!b && validUnit(b.x) && validUnit(b.y) && typeof b.width === 'number' && typeof b.height === 'number' && b.width > 0 && b.height > 0 && b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001 && !!asString(b.label); }
function attrsMatch(a?: Record<string, string>, b?: Record<string, string>): boolean {
  if (!b) return true;
  return Object.entries(b).every(([k, v]) => a?.[k] === v);
}
export function calculateIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width), y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/** 最大权重一对一匹配。小规模用 DP，较大规模用全局边排序。 */
function optimalPairs(matrix: number[][], threshold: number): Array<[number, number, number]> {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  if (!rows || !cols) return [];
  if (cols <= 18 && rows <= 18) {
    const memo = new Map<string, { score: number; pairs: Array<[number, number, number]> }>();
    const solve = (r: number, mask: number): { score: number; pairs: Array<[number, number, number]> } => {
      if (r >= rows) return { score: 0, pairs: [] };
      const key = `${r}:${mask}`;
      const cached = memo.get(key); if (cached) return cached;
      let best = solve(r + 1, mask);
      for (let c = 0; c < cols; c++) {
        const weight = matrix[r][c] ?? 0;
        if ((mask & (1 << c)) || weight < threshold) continue;
        const tail = solve(r + 1, mask | (1 << c));
        const candidate = { score: weight + tail.score, pairs: [[r, c, weight] as [number, number, number], ...tail.pairs] };
        if (candidate.score > best.score || (candidate.score === best.score && candidate.pairs.length > best.pairs.length)) best = candidate;
      }
      memo.set(key, best); return best;
    };
    return solve(0, 0).pairs;
  }
  const edges: Array<[number, number, number]> = [];
  matrix.forEach((row, r) => row.forEach((w, c) => { if (w >= threshold) edges.push([r, c, w]); }));
  edges.sort((a, b) => b[2] - a[2]);
  const usedR = new Set<number>(), usedC = new Set<number>();
  return edges.filter(([r, c]) => { if (usedR.has(r) || usedC.has(c)) return false; usedR.add(r); usedC.add(c); return true; });
}

// 7. 矩形框标注（IoU 重叠度算法，默认阈值 45%，支持类别 + 属性匹配）
export interface ImageAnnotationSubmission { boxes: BoundingBox[] }
export interface ImageAnnotationAnswerKey { boxes: BoundingBox[]; iouThreshold?: number }
export const imageAnnotationGrader: Grader<ImageAnnotationSubmission, ImageAnnotationAnswerKey> = {
  id: 'image_annotation', version: '2.1.0',
  grade(submission, answerKey) {
    if (!Array.isArray(submission?.boxes) || !Array.isArray(answerKey?.boxes) || submission.boxes.some(b => !validBox(b)) || answerKey.boxes.some(b => !validBox(b))) return invalid(imageAnnotationGrader, '标注坐标必须是相对于原图的 0—1 归一化坐标');
    const threshold = Math.max(0, Math.min(1, answerKey.iouThreshold ?? 0.45));
    if (!answerKey.boxes.length) {
      const correct = !submission.boxes.length;
      return { correct, score: correct ? 1 : 0, feedback: correct ? '做对了！' : '存在多余标注', graderVersion: versionOf(imageAnnotationGrader) };
    }
    const matrix = answerKey.boxes.map(expected => submission.boxes.map(actual =>
      actual.label === expected.label && attrsMatch(actual.attributes, expected.attributes) ? calculateIoU(actual, expected) : 0,
    ));
    const pairs = optimalPairs(matrix, threshold);
    const matchedExpected = new Set(pairs.map(p => p[0]));
    const matchedActual = new Set(pairs.map(p => p[1]));
    const missed = answerKey.boxes.length - matchedExpected.size;
    const extra = submission.boxes.length - matchedActual.size;
    const geometryQuality = pairs.reduce((s, p) => s + p[2], 0) / answerKey.boxes.length;
    const penalty = extra / Math.max(1, answerKey.boxes.length);
    const score = clamp(geometryQuality - penalty * 0.25);
    const correct = missed === 0 && extra === 0 && pairs.every(p => p[2] >= threshold);
    return { correct, score: correct ? 1 : score, feedback: correct ? '做对了！位置、类别和属性均正确。' : [missed ? `漏标 ${missed} 个目标` : '', extra ? `多标 ${extra} 个目标` : '', pairs.some(p => p[2] < Math.max(0.7, threshold)) ? '部分轮廓偏离目标' : ''].filter(Boolean).join('；'), graderVersion: versionOf(imageAnnotationGrader), details: { threshold, pairs: pairs.map(([expectedIndex, submittedIndex, iou]) => ({ expectedIndex, submittedIndex, iou })), missed, extra } };
  },
};

// 8. 点标注
export interface PointAnnotationSubmission { points: PointAnnotation[] }
export interface PointAnnotationAnswerKey { points: PointAnnotation[]; distanceTolerance?: number }
export const pointAnnotationGrader: Grader<PointAnnotationSubmission, PointAnnotationAnswerKey> = {
  id: 'point_annotation', version: '1.0.0',
  grade(submission, answerKey) {
    if (!Array.isArray(submission?.points) || !Array.isArray(answerKey?.points)) return invalid(pointAnnotationGrader);
    const valid = (p: PointAnnotation) => validUnit(p.x) && validUnit(p.y) && !!asString(p.label);
    if (submission.points.some(p => !valid(p)) || answerKey.points.some(p => !valid(p))) return invalid(pointAnnotationGrader);
    const tolerance = Math.max(0.001, Math.min(1, answerKey.distanceTolerance ?? 0.05));
    const matrix = answerKey.points.map(e => submission.points.map(a => {
      if (e.label !== a.label || !attrsMatch(a.attributes, e.attributes)) return 0;
      const d = Math.hypot(e.x - a.x, e.y - a.y);
      return d <= tolerance ? 1 - d / tolerance : 0;
    }));
    const pairs = optimalPairs(matrix, 0.000001);
    const missed = answerKey.points.length - pairs.length;
    const extra = submission.points.length - pairs.length;
    const score = clamp((pairs.reduce((s, p) => s + p[2], 0) - extra * 0.25) / Math.max(1, answerKey.points.length));
    const correct = missed === 0 && extra === 0 && pairs.every(p => p[2] > 0);
    // pairs 供练习判分反馈可视化定位"学员第 i 个点对上标准答案第 j 个"。
    return { correct, score: correct ? 1 : score, feedback: correct ? '点标注正确。' : [missed ? `漏标 ${missed} 个点` : '', extra ? `多标 ${extra} 个点` : ''].filter(Boolean).join('；'), graderVersion: versionOf(pointAnnotationGrader), details: { tolerance, pairs: pairs.map(([expectedIndex, submittedIndex, pscore]) => ({ expectedIndex, submittedIndex, score: pscore })), missed, extra } };
  },
};

function samplePolyline(points: Point[], count = 64): Point[] {
  if (points.length < 2) return points;
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total === 0) return Array.from({ length: count }, () => points[0]);
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    const target = total * i / Math.max(1, count - 1);
    let acc = 0, seg = 0;
    while (seg < lengths.length - 1 && acc + lengths[seg] < target) { acc += lengths[seg]; seg++; }
    const t = lengths[seg] ? (target - acc) / lengths[seg] : 0;
    out.push({ x: points[seg].x + (points[seg + 1].x - points[seg].x) * t, y: points[seg].y + (points[seg + 1].y - points[seg].y) * t });
  }
  return out;
}
function chamferDistance(a: Point[], b: Point[]): number {
  const directed = (p: Point[], q: Point[]) => p.reduce((sum, x) => sum + Math.min(...q.map(y => Math.hypot(x.x - y.x, x.y - y.y))), 0) / Math.max(1, p.length);
  return (directed(a, b) + directed(b, a)) / 2;
}
// 8. 折线标注（双向 Chamfer 距离，默认阈值 8% 图片尺寸，等距重采样消除点密度差异）
export interface PolylineSubmission { lines: PolylineAnnotation[] }
export interface PolylineAnswerKey { lines: PolylineAnnotation[]; distanceTolerance?: number }
export const polylineAnnotationGrader: Grader<PolylineSubmission, PolylineAnswerKey> = {
  id: 'polyline_annotation', version: '2.0.0',
  grade(submission, answerKey) {
    if (!Array.isArray(submission?.lines) || !Array.isArray(answerKey?.lines)) return invalid(polylineAnnotationGrader);
    const tolerance = Math.max(0.001, Math.min(1, answerKey.distanceTolerance ?? 0.08));
    const validLine = (l: PolylineAnnotation) => !!asString(l.label) && Array.isArray(l.points) && l.points.length >= 2 && l.points.every(p => validUnit(p.x) && validUnit(p.y));
    if (submission.lines.some(l => !validLine(l)) || answerKey.lines.some(l => !validLine(l))) return invalid(polylineAnnotationGrader);
    const matrix = answerKey.lines.map(e => submission.lines.map(a => {
      if (e.label !== a.label || !attrsMatch(a.attributes, e.attributes)) return 0;
      const d = chamferDistance(samplePolyline(e.points), samplePolyline(a.points));
      return d <= tolerance ? 1 - d / tolerance : 0;
    }));
    const pairs = optimalPairs(matrix, 0.000001);
    const missed = answerKey.lines.length - pairs.length, extra = submission.lines.length - pairs.length;
    const score = clamp((pairs.reduce((s, p) => s + p[2], 0) - extra * 0.25) / Math.max(1, answerKey.lines.length));
    const correct = missed === 0 && extra === 0 && pairs.every(p => p[2] > 0);
    // pairs 供练习判分反馈可视化定位"学员第 i 条线对上标准答案第 j 条",score 为 Chamfer 相似度 0—1。
    return { correct, score: correct ? 1 : score, feedback: correct ? '线框标注正确。' : [missed ? `漏标 ${missed} 条线` : '', extra ? `多标 ${extra} 条线` : '', '请检查线条是否贴合轮廓'].filter(Boolean).join('；'), graderVersion: versionOf(polylineAnnotationGrader), details: { tolerance, pairs: pairs.map(([expectedIndex, submittedIndex, similarity]) => ({ expectedIndex, submittedIndex, score: similarity })), missed, extra } };
  },
};

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const intersects = (a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
function polygonIoU(a: Point[], b: Point[], grid = 80): number {
  let inter = 0, union = 0;
  for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
    const p = { x: (x + 0.5) / grid, y: (y + 0.5) / grid };
    const ia = pointInPolygon(p, a), ib = pointInPolygon(p, b);
    if (ia || ib) union++; if (ia && ib) inter++;
  }
  return union ? inter / union : 0;
}
// 9. 轮廓标注（网格栅格化多边形 IoU，80×80 采样，默认阈值 40%）
export interface PolygonSubmission { polygons: PolylineAnnotation[] }
export interface PolygonAnswerKey { polygons: PolylineAnnotation[]; iouThreshold?: number }
export const polygonAnnotationGrader: Grader<PolygonSubmission, PolygonAnswerKey> = {
  id: 'polygon_annotation', version: '2.0.0',
  grade(submission, answerKey) {
    if (!Array.isArray(submission?.polygons) || !Array.isArray(answerKey?.polygons)) return invalid(polygonAnnotationGrader);
    const threshold = Math.max(0, Math.min(1, answerKey.iouThreshold ?? 0.4));
    const validPoly = (l: PolylineAnnotation) => !!asString(l.label) && Array.isArray(l.points) && l.points.length >= 3 && l.points.every(p => validUnit(p.x) && validUnit(p.y));
    if (submission.polygons.some(l => !validPoly(l)) || answerKey.polygons.some(l => !validPoly(l))) return invalid(polygonAnnotationGrader);
    const matrix = answerKey.polygons.map(e => submission.polygons.map(a => e.label === a.label && attrsMatch(a.attributes, e.attributes) ? polygonIoU(e.points, a.points) : 0));
    const pairs = optimalPairs(matrix, threshold);
    const missed = answerKey.polygons.length - pairs.length, extra = submission.polygons.length - pairs.length;
    const score = clamp((pairs.reduce((s, p) => s + p[2], 0) - extra * 0.25) / Math.max(1, answerKey.polygons.length));
    const correct = missed === 0 && extra === 0;
    // pairs 供练习判分反馈可视化定位"学员第 i 个轮廓对上标准答案第 j 个",score 为栅格化 IoU 0—1。
    return { correct, score: correct ? 1 : score, feedback: correct ? '轮廓标注正确。' : [missed ? `漏标 ${missed} 个轮廓` : '', extra ? `多标 ${extra} 个轮廓` : ''].filter(Boolean).join('；'), graderVersion: versionOf(polygonAnnotationGrader), details: { threshold, pairs: pairs.map(([expectedIndex, submittedIndex, iou]) => ({ expectedIndex, submittedIndex, score: iou })), missed, extra } };
  },
};

// 9. 文本情感
export interface TextSentimentSubmission { sentiments: Record<string, string> }
export interface TextSentimentAnswerKey { correctSentiments: Record<string, string> }
export const textSentimentGrader: Grader<TextSentimentSubmission, TextSentimentAnswerKey> = {
  id: 'text_sentiment', version: '2.0.0',
  grade(submission, answerKey) {
    if (!isRecord(submission?.sentiments) || !isRecord(answerKey?.correctSentiments)) return invalid(textSentimentGrader);
    const keys = Object.keys(answerKey.correctSentiments); if (!keys.length) return invalid(textSentimentGrader, '标准答案未配置');
    const wrong = keys.filter(k => normLabel(submission.sentiments[k]) !== normLabel(answerKey.correctSentiments[k]));
    const score = (keys.length - wrong.length) / keys.length;
    return { correct: !wrong.length, score, feedback: !wrong.length ? '做对了！好评、中评、差评均标注正确。' : `${wrong.length} 条评论标注不正确`, graderVersion: versionOf(textSentimentGrader), details: { wrongItemIds: wrong } };
  },
};

// 10. 音频转写
export interface AudioTranscriptionSubmission { transcript: string }
export interface AudioTranscriptionAnswerKey { correctTranscript: string; similarityThreshold?: number; requiredFillers?: string[] }
function toHalfWidth(text: string): string { return text.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' '); }
function normalizeTranscript(text: string): string {
  return toHalfWidth(text).normalize('NFKC').toLowerCase().replace(/[\s，。！？；：、“”‘’（）()【】\[\],.!?;:'"`~—-]/g, '');
}
export function levenshteinDistance(a: string, b: string): number {
  // 长度差是编辑距离的下界:悬殊输入直接返回下界,避免超大 transcript 触发 O(n·m) 全量计算。
  const diff = Math.abs(a.length - b.length);
  if (diff > 2000) return diff;
  // 正常转写题素材仅数百字;超长输入按不匹配处理,防御持锁事务内的资源耗尽。
  if (a.length > 10_000 || b.length > 10_000) return diff + Math.max(a.length, b.length);
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]; previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = a[i - 1] === b[j - 1] ? diagonal : 1 + Math.min(previous[j], previous[j - 1], diagonal);
      diagonal = above;
    }
  }
  return previous[b.length];
}
export const audioTranscriptionGrader: Grader<AudioTranscriptionSubmission, AudioTranscriptionAnswerKey> = {
  id: 'audio_transcription', version: '2.0.0',
  grade(submission, answerKey) {
    if (typeof submission?.transcript !== 'string' || typeof answerKey?.correctTranscript !== 'string' || !answerKey.correctTranscript.trim()) return invalid(audioTranscriptionGrader);
    const actual = normalizeTranscript(submission.transcript), expected = normalizeTranscript(answerKey.correctTranscript);
    const distance = levenshteinDistance(actual, expected);
    const cer = distance / Math.max(1, expected.length);
    const similarity = clamp(1 - cer);
    const configuredFillers = answerKey.requiredFillers ?? ['嗯', '啊', '哦'];
    const required = configuredFillers.filter(f => expected.includes(normalizeTranscript(f)));
    const missingFillers = required.filter(f => !actual.includes(normalizeTranscript(f)));
    const threshold = Math.max(0, Math.min(1, answerKey.similarityThreshold ?? 0.8));
    const fillerRecall = required.length ? (required.length - missingFillers.length) / required.length : 1;
    const score = clamp(similarity * 0.85 + fillerRecall * 0.15);
    const correct = similarity >= threshold && missingFillers.length === 0;
    return { correct, score: correct ? Math.max(score, threshold) : score, feedback: correct ? '转写正确，语气助词也保留完整。' : [`文字准确率约 ${Math.round(similarity * 100)}%`, missingFillers.length ? `漏写语气助词：${missingFillers.join('、')}` : ''].filter(Boolean).join('；'), graderVersion: versionOf(audioTranscriptionGrader), details: { cer, similarity, requiredFillers: required, missingFillers } };
  },
};

// 11. 通用数据标注和质量检验
export interface DataLabelingSubmission { labels: Record<string, string> }
export interface DataLabelingAnswerKey { correctLabels: Record<string, string> }
export const dataLabelingGrader: Grader<DataLabelingSubmission, DataLabelingAnswerKey> = {
  id: 'data_labeling', version: '2.0.0',
  grade(submission, answerKey) {
    if (!isRecord(submission?.labels) || !isRecord(answerKey?.correctLabels)) return invalid(dataLabelingGrader);
    const keys = Object.keys(answerKey.correctLabels); if (!keys.length) return invalid(dataLabelingGrader, '标准答案未配置');
    const wrong = keys.filter(k => normLabel(submission.labels[k]) !== normLabel(answerKey.correctLabels[k]));
    return { correct: !wrong.length, score: (keys.length - wrong.length) / keys.length, feedback: !wrong.length ? '全部标注正确。' : `${wrong.length} 项标注不正确`, graderVersion: versionOf(dataLabelingGrader), details: { wrongItemIds: wrong } };
  },
};
export interface DatasetQualitySubmission { flaggedItems: string[] }
export interface DatasetQualityAnswerKey { correctFlaggedItems: string[] }
export const datasetQualityGrader: Grader<DatasetQualitySubmission, DatasetQualityAnswerKey> = {
  id: 'dataset_quality', version: '2.0.0',
  grade(submission, answerKey) {
    if (!Array.isArray(submission?.flaggedItems) || !Array.isArray(answerKey?.correctFlaggedItems)) return invalid(datasetQualityGrader);
    const actual = new Set(unique(submission.flaggedItems.map(String))), expected = new Set(unique(answerKey.correctFlaggedItems.map(String)));
    // 标准答案为空属于配置缺陷:不能给乱标满分,判 invalid 让考务修复。
    if (!expected.size) return invalid(datasetQualityGrader, '标准答案未配置');
    const tp = [...actual].filter(x => expected.has(x)).length, fp = [...actual].filter(x => !expected.has(x)).length, fn = [...expected].filter(x => !actual.has(x)).length;
    const precision = tp / Math.max(1, tp + fp), recall = tp / Math.max(1, tp + fn), score = (2 * precision * recall) / Math.max(Number.EPSILON, precision + recall);
    const correct = fp === 0 && fn === 0;
    return { correct, score: correct ? 1 : clamp(score), feedback: correct ? '问题数据识别正确。' : [fp ? `误标 ${fp} 条正常数据` : '', fn ? `漏标 ${fn} 条问题数据` : ''].filter(Boolean).join('；'), graderVersion: versionOf(datasetQualityGrader), details: { tp, fp, fn } };
  },
};

// 12. 提示词描述题。根据图片素材撰写自然语言提示词，按关键词命中率评分。
export interface PromptDescriptionSubmission { text: string }
export interface PromptDescriptionAnswerKey {
  keywords: string[];
  referencePrompt?: string;
  passThreshold?: number;
}
function normalizePromptText(text: string): string {
  return toHalfWidth(text).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}
export const promptDescriptionGrader: Grader<PromptDescriptionSubmission, PromptDescriptionAnswerKey> = {
  id: 'prompt_description', version: '1.0.0',
  grade(submission, answerKey) {
    if (typeof submission?.text !== 'string') return invalid(promptDescriptionGrader, '请输入提示词描述');
    const text = submission.text.trim();
    if (!text) return invalid(promptDescriptionGrader, '请输入提示词描述');
    const rawKeywords = Array.isArray(answerKey?.keywords) ? answerKey.keywords : [];
    const keywordGroups: string[][] = rawKeywords
      .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      .map(k => k.split('|').map(s => s.trim()).filter(Boolean));
    if (!keywordGroups.length) return invalid(promptDescriptionGrader, '标准答案关键词未配置');
    const normalizedText = normalizePromptText(text);
    const matched: string[] = [];
    const missed: string[] = [];
    for (const group of keywordGroups) {
      const hit = group.some(term => normalizedText.includes(normalizePromptText(term)));
      if (hit) matched.push(group[0]); else missed.push(group[0]);
    }
    const ratio = matched.length / keywordGroups.length;
    const threshold = Math.max(0, Math.min(1, answerKey.passThreshold ?? 0.6));
    const correct = ratio >= threshold;
    const parts: string[] = [];
    if (correct) parts.push(`做对了！命中 ${matched.length}/${keywordGroups.length} 个关键词。`);
    else parts.push(`命中 ${matched.length}/${keywordGroups.length} 个关键词。`);
    if (missed.length) parts.push(`未命中关键词：${missed.join('、')}`);
    if (answerKey.referencePrompt) parts.push(`参考提示词：${answerKey.referencePrompt}`);
    return {
      correct, score: ratio, feedback: parts.join(' '),
      graderVersion: versionOf(promptDescriptionGrader),
      details: { matched, missed, ratio, threshold, total: keywordGroups.length },
    };
  },
};

// 13. 综合任务（答案键内部配置由服务端冻结，客户端不能提供 graderId）
export interface CompositeTaskSubmission { subtasks: Record<string, unknown> }
export interface CompositeTaskAnswerKey { subtasks: Record<string, { weight: number; graderId: string; answerKey: unknown }> }
export const compositeTaskGrader: Grader<CompositeTaskSubmission, CompositeTaskAnswerKey> = {
  id: 'composite_task', version: '2.0.0',
  grade(submission, answerKey) {
    if (!isRecord(submission?.subtasks) || !isRecord(answerKey?.subtasks)) return invalid(compositeTaskGrader);
    let totalWeight = 0, weighted = 0; const feedback: string[] = [], details: Record<string, unknown> = {};
    for (const [id, cfg] of Object.entries(answerKey.subtasks)) {
      // 禁止子任务再次路由到综合任务评分器,防止递归加权计分。
      if (!isRecord(cfg) || typeof cfg.weight !== 'number' || typeof cfg.graderId !== 'string' || cfg.graderId === compositeTaskGrader.id) continue;
      totalWeight += Math.max(0, cfg.weight);
      const result = gradeByType(cfg.graderId, submission.subtasks[id], cfg.answerKey);
      weighted += result.score * Math.max(0, cfg.weight); details[id] = result;
      if (!result.correct) feedback.push(`${id}：${result.feedback}`);
    }
    if (!totalWeight) return invalid(compositeTaskGrader, '综合任务权重未配置');
    const score = clamp(weighted / totalWeight);
    return { correct: score >= 0.999999, score, feedback: score >= 0.999999 ? '综合任务全部正确。' : feedback.join('；'), graderVersion: versionOf(compositeTaskGrader), details };
  },
};

// 14. Excel 综合操作题。学生需完成多项 Excel 操作（边框、公式、排序、分类汇总、填充色、小数格式），评分器逐项校验最终状态。
export interface ExcelComprehensiveSubmission {
  borderApplied?: boolean;
  rows?: Array<{ id: string; cells: string[] }>;
  rowOrder?: string[];
  headerColor?: string;
  decimalPlaces?: number;
  summaryGroups?: Array<{ key: string; averages: Record<string, string | number> }>;
}
export interface ExcelComprehensiveAnswerKey {
  // 班级列索引（用于校验公式结果）
  classColumnIndex?: number;
  // 公式结果：rowId -> 期望的班级值
  formulaResults?: Record<string, string>;
  // 排序后期望的行顺序（rowId 数组）
  sortedRowOrder?: string[];
  // 排序判分模式: 缺省=精确序列匹配; 'class-group'=只要求班级分组按期望顺序(组内行序不限)
  sortMode?: 'exact' | 'class-group';
  // 标题行期望填充色
  headerColor?: string;
  // 成绩列期望保留的小数位数
  decimalPlaces?: number;
  // 分类汇总期望的各组平均值
  summaryAverages?: Array<{ key: string; averages: Record<string, number> }>;
  // 数值比较容差（默认 0.01）
  numericTolerance?: number;
}
/** 将字符串安全解析为数字，解析失败返回 null。 */
function safeNumber(value: unknown): number | null {
  return parseStrictNumber(value);
}
export const excelComprehensiveGrader: Grader<ExcelComprehensiveSubmission, ExcelComprehensiveAnswerKey> = {
  id: 'excel_comprehensive', version: '1.0.0',
  grade(submission, answerKey) {
    if (!isRecord(submission) || !isRecord(answerKey)) return invalid(excelComprehensiveGrader);
    const tolRaw = answerKey.numericTolerance;
    const tolerance = typeof tolRaw === 'number' && Number.isFinite(tolRaw) ? Math.max(0, tolRaw) : 0.01;
    const results: Array<{ label: string; passed: boolean; detail: string }> = [];

    // ── 检查 1: 表格边框 ──
    if (answerKey.headerColor !== undefined || 'borderRequired' in answerKey || answerKey.formulaResults || answerKey.sortedRowOrder) {
      const borderPassed = submission.borderApplied === true;
      results.push({ label: '设置表格边框', passed: borderPassed, detail: borderPassed ? '已设置边框' : '未设置表格边框' });
    }

    // ── 检查 2: 公式结果（班级列）──
    if (isRecord(answerKey.formulaResults) && typeof answerKey.classColumnIndex === 'number') {
      const colIdx = answerKey.classColumnIndex;
      const rows = Array.isArray(submission.rows) ? submission.rows : [];
      const rowMap = new Map(rows.map(r => [String(r.id), r]));
      let formulaOk = 0;
      const formulaTotal = Object.keys(answerKey.formulaResults).length;
      const formulaWrong: string[] = [];
      for (const [rowId, expected] of Object.entries(answerKey.formulaResults)) {
        const row = rowMap.get(rowId);
        const actual = row?.cells?.[colIdx] ?? '';
        if (normLabel(actual) === normLabel(expected)) formulaOk++;
        else formulaWrong.push(`${rowId}: 期望"${expected}"，实际"${actual}"`);
      }
      const formulaPassed = formulaOk === formulaTotal && formulaTotal > 0;
      results.push({ label: '用公式求出班级', passed: formulaPassed, detail: formulaPassed ? `${formulaOk}/${formulaTotal} 个班级值正确` : formulaWrong.slice(0, 3).join('；') });
    }

    // ── 检查 3: 排序顺序 ──
    if (Array.isArray(answerKey.sortedRowOrder) && answerKey.sortedRowOrder.length > 0) {
      const actualOrder = Array.isArray(submission.rowOrder) ? submission.rowOrder.map(String) : (Array.isArray(submission.rows) ? submission.rows.map(r => String(r.id)) : []);
      const expectedOrder = answerKey.sortedRowOrder.map(String);
      let orderMatch: boolean;
      let orderLabel = '按班级和成绩排序';
      if (answerKey.sortMode === 'class-group' && isRecord(answerKey.formulaResults)) {
        // 弱化排序(题面"按班级降序"): 只要求班级分组按期望顺序排列, 组内行序不限。
        const clsOf = (id: string) => String((answerKey.formulaResults as Record<string, unknown>)[id] ?? '');
        orderMatch = actualOrder.length === expectedOrder.length && actualOrder.every((id, i) => clsOf(id) === clsOf(expectedOrder[i]));
        orderLabel = '按班级排序';
      } else {
        orderMatch = actualOrder.length === expectedOrder.length && actualOrder.every((id, i) => id === expectedOrder[i]);
      }
      results.push({ label: orderLabel, passed: orderMatch, detail: orderMatch ? '排序顺序正确' : '排序顺序不正确' });
    }

    // ── 检查 4: 分类汇总 ──
    if (Array.isArray(answerKey.summaryAverages) && answerKey.summaryAverages.length > 0) {
      const actualGroups = Array.isArray(submission.summaryGroups) ? submission.summaryGroups : [];
      let summaryOk = 0;
      const summaryTotal = answerKey.summaryAverages.length;
      const summaryWrong: string[] = [];
      for (const expected of answerKey.summaryAverages) {
        const actual = actualGroups.find(g => normLabel(g.key) === normLabel(expected.key));
        if (!actual) { summaryWrong.push(`缺少"${expected.key}"的汇总`); continue; }
        let avgOk = true;
        for (const [col, expVal] of Object.entries(expected.averages)) {
          const actVal = actual.averages?.[col];
          const en = safeNumber(expVal);
          const an = safeNumber(actVal);
          const match = en !== null && an !== null ? Math.abs(en - an) <= tolerance : normLabel(actVal) === normLabel(expVal);
          if (!match) { avgOk = false; summaryWrong.push(`"${expected.key}"的${col}平均值不正确`); }
        }
        if (avgOk) summaryOk++;
      }
      const summaryPassed = summaryOk === summaryTotal;
      results.push({ label: '分类汇总求平均值', passed: summaryPassed, detail: summaryPassed ? `${summaryOk}/${summaryTotal} 个分组正确` : summaryWrong.slice(0, 3).join('；') });
    }

    // ── 检查 5: 标题行填充色 ──
    if (typeof answerKey.headerColor === 'string') {
      // 颜色归一: 两端 trim; 空串/无/none 视为"未填色", 与组件默认选项"无"(提交空串)对齐。
      const norm = (s: unknown) => {
        const t = normLabel(s);
        if (!t || t === '无' || t.toLowerCase() === 'none') return '';
        return t;
      };
      const colorPassed = norm(submission.headerColor) === norm(answerKey.headerColor);
      const label = norm(answerKey.headerColor) ? answerKey.headerColor : '无';
      results.push({ label: `标题行填充${label}色`, passed: colorPassed, detail: colorPassed ? '颜色正确' : `期望"${label}"色` });
    }

    // ── 检查 6: 成绩保留小数 ──
    if (typeof answerKey.decimalPlaces === 'number') {
      const decimalPassed = submission.decimalPlaces === answerKey.decimalPlaces;
      results.push({ label: `成绩保留${answerKey.decimalPlaces}位小数`, passed: decimalPassed, detail: decimalPassed ? '小数格式正确' : `期望保留${answerKey.decimalPlaces}位小数` });
    }

    if (!results.length) return invalid(excelComprehensiveGrader, '评分项未配置');
    const passedCount = results.filter(r => r.passed).length;
    const score = clamp(passedCount / results.length);
    const correct = passedCount === results.length;
    const feedback = correct
      ? '做对了！所有 Excel 操作均已完成。'
      : results.filter(r => !r.passed).map(r => `${r.label}：${r.detail}`).join('；');
    return { correct, score, feedback, graderVersion: versionOf(excelComprehensiveGrader), details: { checks: results, passedCount, totalChecks: results.length } };
  },
};

const graders = [singleChoiceGrader, trueFalseGrader, fillInBlankGrader, excelDeleteRowsGrader, statsTableGrader, fileClassifyGrader, imageCleanGrader, imageAnnotationGrader, pointAnnotationGrader, polylineAnnotationGrader, polygonAnnotationGrader, textSentimentGrader, audioTranscriptionGrader, dataLabelingGrader, datasetQualityGrader, promptDescriptionGrader, compositeTaskGrader, excelComprehensiveGrader] as Array<Grader<unknown, unknown>>;
const graderRegistry = new Map(graders.map(g => [g.id, g]));

export const TASK_GRADER_MAP: Readonly<Record<string, string>> = Object.freeze({
  excel_delete_rows: 'excel_delete_rows',
  stats_table: 'stats_table',
  file_classify: 'file_classify',
  image_clean: 'image_clean',
  image_annotation: 'image_annotation',
  bounding_box: 'image_annotation',
  point_annotation: 'point_annotation',
  polyline_annotation: 'polyline_annotation',
  polygon_annotation: 'polygon_annotation',
  text_sentiment: 'text_sentiment',
  audio_transcription: 'audio_transcription',
  data_labeling: 'data_labeling',
  dataset_quality: 'dataset_quality',
  composite_task: 'composite_task',
  excel_comprehensive: 'excel_comprehensive',
});

export function graderIdForTaskType(taskType: string): string | null { return TASK_GRADER_MAP[taskType] ?? null; }
export function gradeTaskByType(taskType: string, submission: unknown, answerKey: unknown): GraderResult {
  const graderId = graderIdForTaskType(taskType);
  if (!graderId) return { correct: false, score: 0, feedback: `不支持的任务类型：${taskType}`, graderVersion: 'unknown@0.0.0' };
  return gradeByType(graderId, submission, answerKey);
}
/** 单次评分输入的序列化上限:练习/考试提交的 response 超过此大小按 invalid 处理,
 *  防止超大 transcript/标注点阵在持锁事务内触发分钟级评分拖垮连接池。 */
export const MAX_GRADING_INPUT_BYTES = 64 * 1024;
function oversizeInput(value: unknown): boolean {
  try { return JSON.stringify(value ?? {}).length > MAX_GRADING_INPUT_BYTES; } catch { return true; }
}

export function gradeByType(graderId: string, submission: unknown, answerKey: unknown): GraderResult {
  const grader = graderRegistry.get(graderId);
  if (!grader) return { correct: false, score: 0, feedback: `未知评分器：${graderId}`, graderVersion: 'unknown@0.0.0' };
  if (oversizeInput(submission)) {
    return { correct: false, score: 0, feedback: '提交内容过大，请缩减后重新提交', graderVersion: versionOf(grader), details: { invalid: true } };
  }
  try {
    const result = grader.grade(submission, answerKey);
    // 契约兜底:无论评分器内部如何计算,出口分数强制落在 0..1。
    return { ...result, score: clamp(result.score) };
  }
  catch { return { correct: false, score: 0, feedback: '评分输入格式不正确', graderVersion: versionOf(grader), details: { invalid: true } }; }
}
export function getRegisteredGraderIds(): string[] { return [...graderRegistry.keys()]; }

/* ---------- 学员作答与题库 answer_key 的共享归一(练习/考试两个入口必须使用同一套) ---------- */

const TRUE_TOKENS = new Set(['A', 'TRUE', 'T', 'YES', 'Y', '1', '正确', '对', '是']);
const FALSE_TOKENS = new Set(['B', 'FALSE', 'F', 'NO', 'N', '0', '错误', '错', '否']);

/** 学员判断题作答归一为三态:识别的真/假 token 归一为布尔,未识别返回 null(交评分器判 invalid 0 分)。练习与考试入口共用,保证同一答案判定一致。 */
export function normalizeTrueFalseAnswer(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  const upper = String(raw ?? '').trim().toUpperCase();
  if (TRUE_TOKENS.has(upper)) return true;
  if (FALSE_TOKENS.has(upper)) return false;
  return null;
}

/** 从题库 answer_key(JSONB 形态不一:布尔/字符串/对象)解析判断题标准答案,无法解析返回 null。 */
export function parseTrueFalseAnswerKey(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  if (isRecord(raw) && typeof raw.correctAnswer === 'boolean') return raw.correctAnswer;
  if (typeof raw === 'string') {
    const text = raw.trim().replace(/^["']|["']$/g, '');
    const upper = text.toUpperCase();
    if (TRUE_TOKENS.has(upper)) return true;
    // 判断题常以 A=正确 / B=错误 存储;FALSE/F/错误/错/否/B 均为假。
    if (FALSE_TOKENS.has(upper)) return false;
  }
  return null;
}

/** 从题库 answer_key 解析单选题正确选项键(单个 A-Z 字母),无法解析返回 null。 */
export function parseSingleChoiceAnswerKey(raw: unknown): string | null {
  const value: unknown = isRecord(raw) ? (raw.correctOption ?? raw.letter) : raw;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^["']|["']$/g, '').toUpperCase();
  return OPTION_KEY.test(text) ? text : null;
}

/** 从题库 answer_key 解析填空题可接受答案列表,无法解析返回 null。 */
export function parseFillInBlankAnswerKey(raw: unknown): string[] | null {
  if (isRecord(raw) && Array.isArray(raw.acceptable)) return raw.acceptable.filter((v): v is string => typeof v === 'string');
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return null;
}

/** 从题库 answer_key 解析提示词描述题标准答案（关键词 + 参考答案 + 通过阈值），无法解析返回 null。 */
export function parsePromptDescriptionAnswerKey(raw: unknown): PromptDescriptionAnswerKey | null {
  if (!isRecord(raw)) return null;
  const keywords = Array.isArray(raw.keywords) ? raw.keywords.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
  if (!keywords.length) return null;
  const answerKey: PromptDescriptionAnswerKey = { keywords };
  if (typeof raw.referencePrompt === 'string' && raw.referencePrompt.trim()) answerKey.referencePrompt = raw.referencePrompt.trim();
  if (typeof raw.passThreshold === 'number' && Number.isFinite(raw.passThreshold)) answerKey.passThreshold = raw.passThreshold;
  return answerKey;
}
