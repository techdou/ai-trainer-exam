/**
 * 评分引擎核心
 * 所有评分器均为确定性纯函数：相同输入必定产生相同输出
 * 禁止：随机数、当前时间、网络请求、外部状态
 */

// ─── 通用接口 ──────────────────────────────────────────────

export interface GraderResult {
  /** 是否完全正确 */
  correct: boolean;
  /** 0-1 之间的得分比例（0=全错, 1=全对, 中间值=部分正确） */
  score: number;
  /** 人类可读的反馈 */
  feedback: string;
  /** 评分引擎版本号，用于审计追踪 */
  graderVersion: string;
}

export interface Grader<TSubmission, TAnswerKey> {
  /** 评分器唯一标识 */
  id: string;
  /** 评分器版本 */
  version: string;
  /** 对学员提交进行评分 */
  grade(submission: TSubmission, answerKey: TAnswerKey): GraderResult;
}

// ─── 1. 单选题评分器 ────────────────────────────────────────

export interface SingleChoiceSubmission {
  selectedOption: string; // "A" | "B" | "C" | "D"
}

export interface SingleChoiceAnswerKey {
  correctOption: string; // "A" | "B" | "C" | "D"
}

export const singleChoiceGrader: Grader<SingleChoiceSubmission, SingleChoiceAnswerKey> = {
  id: 'single_choice',
  version: '1.0.0',
  grade(submission, answerKey) {
    const correct = submission.selectedOption.toUpperCase() === answerKey.correctOption.toUpperCase();
    return {
      correct,
      score: correct ? 1 : 0,
      feedback: correct ? '做对了！' : `选错了，正确答案是 ${answerKey.correctOption}`,
      graderVersion: `${singleChoiceGrader.id}@${singleChoiceGrader.version}`,
    };
  },
};

// ─── 2. 判断题评分器 ────────────────────────────────────────

export interface TrueFalseSubmission {
  answer: boolean; // true = 正确, false = 错误
}

export interface TrueFalseAnswerKey {
  correctAnswer: boolean;
}

export const trueFalseGrader: Grader<TrueFalseSubmission, TrueFalseAnswerKey> = {
  id: 'true_false',
  version: '1.0.0',
  grade(submission, answerKey) {
    const correct = submission.answer === answerKey.correctAnswer;
    return {
      correct,
      score: correct ? 1 : 0,
      feedback: correct ? '做对了！' : `判断错误，正确答案是"${answerKey.correctAnswer ? '正确' : '错误'}"`,
      graderVersion: `${trueFalseGrader.id}@${trueFalseGrader.version}`,
    };
  },
};

// ─── 3. Excel 删行评分器 ─────────────────────────────────────

export interface ExcelDeleteRowsSubmission {
  /** 学员保留的行号集合（0-indexed） */
  retainedRowIndexes: number[];
}

export interface ExcelDeleteRowsAnswerKey {
  /** 应当保留的行号集合 */
  correctRetainedRowIndexes: number[];
}

export const excelDeleteRowsGrader: Grader<ExcelDeleteRowsSubmission, ExcelDeleteRowsAnswerKey> = {
  id: 'excel_delete_rows',
  version: '1.0.0',
  grade(submission, answerKey) {
    const retainedSet = new Set(submission.retainedRowIndexes);
    const correctSet = new Set(answerKey.correctRetainedRowIndexes);

    // 计算精确匹配
    const truePositives = [...retainedSet].filter(i => correctSet.has(i)).length;
    const falsePositives = [...retainedSet].filter(i => !correctSet.has(i)).length;
    const falseNegatives = [...correctSet].filter(i => !retainedSet.has(i)).length;

    if (truePositives === correctSet.size && falsePositives === 0 && falseNegatives === 0) {
      return {
        correct: true,
        score: 1,
        feedback: '做对了！行删除操作完全正确。',
        graderVersion: `${excelDeleteRowsGrader.id}@${excelDeleteRowsGrader.version}`,
      };
    }

    // F1 分数作为部分得分
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    const feedbackParts: string[] = [];
    if (falsePositives > 0) {
      feedbackParts.push(`多删了 ${falsePositives} 行不该删的行`);
    }
    if (falseNegatives > 0) {
      feedbackParts.push(`漏删了 ${falseNegatives} 行应该删的行`);
    }

    return {
      correct: false,
      score: f1,
      feedback: feedbackParts.join('；'),
      graderVersion: `${excelDeleteRowsGrader.id}@${excelDeleteRowsGrader.version}`,
    };
  },
};

// ─── 4. 统计表填表评分器 ──────────────────────────────────────

export interface StatsTableSubmission {
  /** 键为单元格坐标（如 "B3"），值为学员填入的内容 */
  cells: Record<string, string | number>;
}

export interface StatsTableAnswerKey {
  /** 键为单元格坐标，值为正确答案 */
  correctCells: Record<string, string | number>;
  /** 数值型单元格的容差（绝对误差） */
  numericTolerance?: number;
}

export const statsTableGrader: Grader<StatsTableSubmission, StatsTableAnswerKey> = {
  id: 'stats_table',
  version: '1.0.0',
  grade(submission, answerKey) {
    const tolerance = answerKey.numericTolerance ?? 0.01;
    const keys = Object.keys(answerKey.correctCells);

    if (keys.length === 0) {
      return { correct: true, score: 1, feedback: '无填写内容', graderVersion: `${statsTableGrader.id}@${statsTableGrader.version}` };
    }

    let correctCount = 0;
    const wrongCells: string[] = [];

    for (const key of keys) {
      const expected = answerKey.correctCells[key];
      const actual = submission.cells[key];

      if (actual === undefined || actual === '') {
        wrongCells.push(`${key} 未填写`);
        continue;
      }

      const numExpected = typeof expected === 'number' ? expected : parseFloat(String(expected));
      const numActual = typeof actual === 'number' ? actual : parseFloat(String(actual));

      if (!isNaN(numExpected) && !isNaN(numActual)) {
        // 数值比较
        if (Math.abs(numActual - numExpected) <= tolerance) {
          correctCount++;
        } else {
          wrongCells.push(`${key} 填写不正确（正确值: ${numExpected}）`);
        }
      } else {
        // 字符串精确比较
        if (String(actual).trim() === String(expected).trim()) {
          correctCount++;
        } else {
          wrongCells.push(`${key} 填写不正确`);
        }
      }
    }

    const score = correctCount / keys.length;
    return {
      correct: score === 1,
      score,
      feedback: score === 1 ? '做对了！所有单元格填写正确。' : wrongCells.join('；'),
      graderVersion: `${statsTableGrader.id}@${statsTableGrader.version}`,
    };
  },
};

// ─── 5. 文件分类评分器 ────────────────────────────────────────

export interface FileClassifySubmission {
  /** 文件名 → 分类标签 */
  classifications: Record<string, string>;
}

export interface FileClassifyAnswerKey {
  /** 文件名 → 正确分类标签 */
  correctClassifications: Record<string, string>;
}

export const fileClassifyGrader: Grader<FileClassifySubmission, FileClassifyAnswerKey> = {
  id: 'file_classify',
  version: '1.0.0',
  grade(submission, answerKey) {
    const keys = Object.keys(answerKey.correctClassifications);

    if (keys.length === 0) {
      return { correct: true, score: 1, feedback: '无分类内容', graderVersion: `${fileClassifyGrader.id}@${fileClassifyGrader.version}` };
    }

    let correctCount = 0;
    const wrongFiles: string[] = [];

    for (const key of keys) {
      const expected = answerKey.correctClassifications[key];
      const actual = submission.classifications[key];

      if (actual === expected) {
        correctCount++;
      } else {
        wrongFiles.push(`${key} 分类不正确（应为"${expected}"）`);
      }
    }

    const score = correctCount / keys.length;
    return {
      correct: score === 1,
      score,
      feedback: score === 1 ? '做对了！所有文件分类正确。' : wrongFiles.join('；'),
      graderVersion: `${fileClassifyGrader.id}@${fileClassifyGrader.version}`,
    };
  },
};

// ─── 6. 图片清洗评分器 ────────────────────────────────────────

export interface ImageCleanSubmission {
  /** 图片ID → "keep" | "discard" */
  decisions: Record<string, 'keep' | 'discard'>;
}

export interface ImageCleanAnswerKey {
  /** 图片ID → "keep" | "discard" */
  correctDecisions: Record<string, 'keep' | 'discard'>;
}

export const imageCleanGrader: Grader<ImageCleanSubmission, ImageCleanAnswerKey> = {
  id: 'image_clean',
  version: '1.0.0',
  grade(submission, answerKey) {
    const keys = Object.keys(answerKey.correctDecisions);

    if (keys.length === 0) {
      return { correct: true, score: 1, feedback: '无清洗内容', graderVersion: `${imageCleanGrader.id}@${imageCleanGrader.version}` };
    }

    let correctCount = 0;
    const wrongItems: string[] = [];

    for (const key of keys) {
      const expected = answerKey.correctDecisions[key];
      const actual = submission.decisions[key];

      if (actual === expected) {
        correctCount++;
      } else {
        const expectedLabel = expected === 'keep' ? '保留' : '丢弃';
        wrongItems.push(`图片${key}判断不正确（应为"${expectedLabel}"）`);
      }
    }

    const score = correctCount / keys.length;
    return {
      correct: score === 1,
      score,
      feedback: score === 1 ? '做对了！所有图片清洗判断正确。' : wrongItems.join('；'),
      graderVersion: `${imageCleanGrader.id}@${imageCleanGrader.version}`,
    };
  },
};

// ─── 7. 图片标注评分器（IoU） ──────────────────────────────────

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface ImageAnnotationSubmission {
  boxes: BoundingBox[];
}

export interface ImageAnnotationAnswerKey {
  boxes: BoundingBox[];
  /** IoU 阈值，默认 0.5 */
  iouThreshold?: number;
}

function calculateIoU(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;

  return union > 0 ? intersection / union : 0;
}

export const imageAnnotationGrader: Grader<ImageAnnotationSubmission, ImageAnnotationAnswerKey> = {
  id: 'image_annotation',
  version: '1.0.0',
  grade(submission, answerKey) {
    const threshold = answerKey.iouThreshold ?? 0.5;

    if (answerKey.boxes.length === 0) {
      return {
        correct: submission.boxes.length === 0,
        score: submission.boxes.length === 0 ? 1 : 0,
        feedback: submission.boxes.length === 0 ? '做对了！' : '标注了多余的框',
        graderVersion: `${imageAnnotationGrader.id}@${imageAnnotationGrader.version}`,
      };
    }

    // 匹配：每个 answerKey box 找最佳匹配的 submission box
    const matched = new Set<number>();
    let correctCount = 0;
    const unmatchedAnswerBoxes: string[] = [];

    for (const answerBox of answerKey.boxes) {
      let bestIoU = 0;
      let bestIdx = -1;

      for (let i = 0; i < submission.boxes.length; i++) {
        if (matched.has(i)) continue;
        const subBox = submission.boxes[i];
        if (subBox.label !== answerBox.label) continue;

        const iou = calculateIoU(subBox, answerBox);
        if (iou > bestIoU) {
          bestIoU = iou;
          bestIdx = i;
        }
      }

      if (bestIoU >= threshold && bestIdx >= 0) {
        correctCount++;
        matched.add(bestIdx);
      } else {
        unmatchedAnswerBoxes.push(`标签"${answerBox.label}"的框未正确标注`);
      }
    }

    // 惩罚多余的标注框
    const extraBoxes = submission.boxes.length - matched.size;
    const precision = submission.boxes.length > 0 ? correctCount / submission.boxes.length : 0;
    const recall = answerKey.boxes.length > 0 ? correctCount / answerKey.boxes.length : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    const feedbackParts: string[] = [];
    if (unmatchedAnswerBoxes.length > 0) {
      feedbackParts.push(unmatchedAnswerBoxes.join('；'));
    }
    if (extraBoxes > 0) {
      feedbackParts.push(`多了 ${extraBoxes} 个多余的标注框`);
    }

    return {
      correct: f1 >= 0.9, // 90%以上算正确
      score: f1,
      feedback: f1 >= 0.9 ? '做对了！标注基本正确。' : feedbackParts.join('；'),
      graderVersion: `${imageAnnotationGrader.id}@${imageAnnotationGrader.version}`,
    };
  },
};

// ─── 8. 文本情感标注评分器 ──────────────────────────────────────

export interface TextSentimentSubmission {
  /** 文本ID → 情感标签（"positive" | "negative" | "neutral"） */
  sentiments: Record<string, string>;
}

export interface TextSentimentAnswerKey {
  /** 文本ID → 正确情感标签 */
  correctSentiments: Record<string, string>;
}

export const textSentimentGrader: Grader<TextSentimentSubmission, TextSentimentAnswerKey> = {
  id: 'text_sentiment',
  version: '1.0.0',
  grade(submission, answerKey) {
    const keys = Object.keys(answerKey.correctSentiments);

    if (keys.length === 0) {
      return { correct: true, score: 1, feedback: '无标注内容', graderVersion: `${textSentimentGrader.id}@${textSentimentGrader.version}` };
    }

    let correctCount = 0;
    const wrongItems: string[] = [];
    const sentimentLabels: Record<string, string> = { positive: '正面', negative: '负面', neutral: '中性' };

    for (const key of keys) {
      const expected = answerKey.correctSentiments[key];
      const actual = submission.sentiments[key];

      if (actual === expected) {
        correctCount++;
      } else {
        wrongItems.push(`文本${key}情感标注不正确（应为"${sentimentLabels[expected] ?? expected}"）`);
      }
    }

    const score = correctCount / keys.length;
    return {
      correct: score === 1,
      score,
      feedback: score === 1 ? '做对了！所有情感标注正确。' : wrongItems.join('；'),
      graderVersion: `${textSentimentGrader.id}@${textSentimentGrader.version}`,
    };
  },
};

// ─── 9. 音频转写评分器 ────────────────────────────────────────

export interface AudioTranscriptionSubmission {
  /** 转写文本 */
  transcript: string;
}

export interface AudioTranscriptionAnswerKey {
  /** 正确转写文本 */
  correctTranscript: string;
  /** 相似度阈值（0-1），默认 0.8 */
  similarityThreshold?: number;
}

/** 简单的字元级编辑距离 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

export const audioTranscriptionGrader: Grader<AudioTranscriptionSubmission, AudioTranscriptionAnswerKey> = {
  id: 'audio_transcription',
  version: '1.0.0',
  grade(submission, answerKey) {
    const threshold = answerKey.similarityThreshold ?? 0.8;

    const normSub = submission.transcript.replace(/\s+/g, '').toLowerCase();
    const normKey = answerKey.correctTranscript.replace(/\s+/g, '').toLowerCase();

    if (normKey.length === 0) {
      return { correct: normSub.length === 0, score: normSub.length === 0 ? 1 : 0, feedback: '无转写内容', graderVersion: `${audioTranscriptionGrader.id}@${audioTranscriptionGrader.version}` };
    }

    const distance = levenshteinDistance(normSub, normKey);
    const similarity = 1 - distance / Math.max(normSub.length, normKey.length);

    return {
      correct: similarity >= threshold,
      score: similarity,
      feedback: similarity >= threshold
        ? '做对了！转写内容基本正确。'
        : `转写不够准确，相似度 ${Math.round(similarity * 100)}%，需要达到 ${Math.round(threshold * 100)}%`,
      graderVersion: `${audioTranscriptionGrader.id}@${audioTranscriptionGrader.version}`,
    };
  },
};

// ─── 10. 数据标注综合评分器 ────────────────────────────────────

export interface DataLabelingSubmission {
  /** 数据项ID → 标注结果 */
  labels: Record<string, string>;
}

export interface DataLabelingAnswerKey {
  /** 数据项ID → 正确标注 */
  correctLabels: Record<string, string>;
  /** 是否允许部分正确 */
  allowPartial?: boolean;
}

export const dataLabelingGrader: Grader<DataLabelingSubmission, DataLabelingAnswerKey> = {
  id: 'data_labeling',
  version: '1.0.0',
  grade(submission, answerKey) {
    const keys = Object.keys(answerKey.correctLabels);

    if (keys.length === 0) {
      return { correct: true, score: 1, feedback: '无标注内容', graderVersion: `${dataLabelingGrader.id}@${dataLabelingGrader.version}` };
    }

    let correctCount = 0;
    const wrongItems: string[] = [];

    for (const key of keys) {
      const expected = answerKey.correctLabels[key];
      const actual = submission.labels[key];

      if (actual === expected) {
        correctCount++;
      } else {
        wrongItems.push(`第${key}项标注不正确（应为"${expected}"）`);
      }
    }

    const score = correctCount / keys.length;
    return {
      correct: score === 1,
      score,
      feedback: score === 1 ? '做对了！所有标注正确。' : wrongItems.join('；'),
      graderVersion: `${dataLabelingGrader.id}@${dataLabelingGrader.version}`,
    };
  },
};

// ─── 11. 数据集质量检验评分器 ──────────────────────────────────

export interface DatasetQualitySubmission {
  /** 问题数据项的ID集合 */
  flaggedItems: string[];
}

export interface DatasetQualityAnswerKey {
  /** 应标记的问题数据项ID集合 */
  correctFlaggedItems: string[];
}

export const datasetQualityGrader: Grader<DatasetQualitySubmission, DatasetQualityAnswerKey> = {
  id: 'dataset_quality',
  version: '1.0.0',
  grade(submission, answerKey) {
    const submittedSet = new Set(submission.flaggedItems);
    const correctSet = new Set(answerKey.correctFlaggedItems);

    const truePositives = [...submittedSet].filter(i => correctSet.has(i)).length;
    const falsePositives = [...submittedSet].filter(i => !correctSet.has(i)).length;
    const falseNegatives = [...correctSet].filter(i => !submittedSet.has(i)).length;

    if (correctSet.size === 0) {
      return {
        correct: submittedSet.size === 0,
        score: submittedSet.size === 0 ? 1 : 0,
        feedback: submittedSet.size === 0 ? '做对了！没有问题数据。' : '标记了多余的问题数据',
        graderVersion: `${datasetQualityGrader.id}@${datasetQualityGrader.version}`,
      };
    }

    if (truePositives === correctSet.size && falsePositives === 0 && falseNegatives === 0) {
      return {
        correct: true,
        score: 1,
        feedback: '做对了！所有问题数据都被正确标记。',
        graderVersion: `${datasetQualityGrader.id}@${datasetQualityGrader.version}`,
      };
    }

    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    const feedbackParts: string[] = [];
    if (falsePositives > 0) feedbackParts.push(`误标记了 ${falsePositives} 条正常数据`);
    if (falseNegatives > 0) feedbackParts.push(`漏标记了 ${falseNegatives} 条问题数据`);

    return {
      correct: false,
      score: f1,
      feedback: feedbackParts.join('；'),
      graderVersion: `${datasetQualityGrader.id}@${datasetQualityGrader.version}`,
    };
  },
};

// ─── 12. 综合任务评分器（加权组合） ──────────────────────────────

export interface CompositeTaskSubmission {
  /** 子任务提交，键为子任务ID */
  subtasks: Record<string, unknown>;
}

export interface CompositeTaskAnswerKey {
  /** 子任务权重和标准答案，键为子任务ID */
  subtasks: Record<string, {
    weight: number;
    graderId: string;
    answerKey: unknown;
  }>;
}

export const compositeTaskGrader: Grader<CompositeTaskSubmission, CompositeTaskAnswerKey> = {
  id: 'composite_task',
  version: '1.0.0',
  grade(submission, answerKey) {
    const subtaskEntries = Object.entries(answerKey.subtasks);
    if (subtaskEntries.length === 0) {
      return { correct: true, score: 1, feedback: '无子任务', graderVersion: `${compositeTaskGrader.id}@${compositeTaskGrader.version}` };
    }

    let totalWeight = 0;
    let weightedScore = 0;
    const feedbackParts: string[] = [];

    for (const [taskId, config] of subtaskEntries) {
      const subSubmission = submission.subtasks[taskId];
      if (!subSubmission) {
        feedbackParts.push(`子任务"${taskId}"未提交`);
        totalWeight += config.weight;
        continue;
      }

      const result = gradeByType(config.graderId, subSubmission, config.answerKey);
      totalWeight += config.weight;
      weightedScore += result.score * config.weight;

      if (!result.correct) {
        feedbackParts.push(`子任务"${taskId}"：${result.feedback}`);
      }
    }

    const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    return {
      correct: finalScore >= 0.9,
      score: finalScore,
      feedback: finalScore >= 0.9 ? '做对了！综合任务完成良好。' : feedbackParts.join('；'),
      graderVersion: `${compositeTaskGrader.id}@${compositeTaskGrader.version}`,
    };
  },
};

// ─── 评分器路由表 ──────────────────────────────────────────────

const graderRegistry: Map<string, Grader<unknown, unknown>> = new Map();

function registerGrader(grader: Grader<unknown, unknown>): void {
  graderRegistry.set(grader.id, grader);
}

registerGrader(singleChoiceGrader as Grader<unknown, unknown>);
registerGrader(trueFalseGrader as Grader<unknown, unknown>);
registerGrader(excelDeleteRowsGrader as Grader<unknown, unknown>);
registerGrader(statsTableGrader as Grader<unknown, unknown>);
registerGrader(fileClassifyGrader as Grader<unknown, unknown>);
registerGrader(imageCleanGrader as Grader<unknown, unknown>);
registerGrader(imageAnnotationGrader as Grader<unknown, unknown>);
registerGrader(textSentimentGrader as Grader<unknown, unknown>);
registerGrader(audioTranscriptionGrader as Grader<unknown, unknown>);
registerGrader(dataLabelingGrader as Grader<unknown, unknown>);
registerGrader(datasetQualityGrader as Grader<unknown, unknown>);
registerGrader(compositeTaskGrader as Grader<unknown, unknown>);

/** 按类型ID路由评分 */
export function gradeByType(graderId: string, submission: unknown, answerKey: unknown): GraderResult {
  const grader = graderRegistry.get(graderId);
  if (!grader) {
    return {
      correct: false,
      score: 0,
      feedback: `未知的评分器类型：${graderId}`,
      graderVersion: 'unknown@0.0.0',
    };
  }
  return grader.grade(submission, answerKey);
}

/** 获取所有已注册的评分器ID */
export function getRegisteredGraderIds(): string[] {
  return [...graderRegistry.keys()];
}
