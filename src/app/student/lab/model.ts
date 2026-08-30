/**
 * 实训课堂的朴素贝叶斯文本分类器(纯前端, 无依赖)。
 * 字符 bigram 词袋 + 拉普拉斯平滑, 支持任意标签数;
 * 训练结果同时暴露各类高频词组, 供"模型学到了什么"可视化。
 */

export type Labels = readonly string[];

export interface NaiveBayesModel {
  /** 各标签下每个 bigram 的出现次数 */
  counts: Record<string, Record<string, number>>;
  /** 各标签的 bigram 总数 */
  totals: Record<string, number>;
  /** 各标签的样本数 */
  docCount: Record<string, number>;
  vocabSize: number;
  /** 各标签按频次降序的高频词组(含次数), 用于训练结果可视化 */
  topTokens: Record<string, Array<{ token: string; count: number }>>;
}

export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[\s，。！？、,.!?！？]/g, '');
  const tokens: string[] = [];
  for (let i = 0; i < normalized.length - 1; i++) tokens.push(normalized.slice(i, i + 2));
  return tokens;
}

export function trainNaiveBayes(
  samples: Array<{ text: string; label: string }>,
  labels: Labels,
  topN = 5,
): NaiveBayesModel {
  const counts: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  const docCount: Record<string, number> = {};
  for (const label of labels) {
    counts[label] = {};
    totals[label] = 0;
    docCount[label] = 0;
  }
  for (const s of samples) {
    docCount[s.label] = (docCount[s.label] ?? 0) + 1;
    for (const token of tokenize(s.text)) {
      counts[s.label][token] = (counts[s.label][token] ?? 0) + 1;
      totals[s.label]++;
    }
  }
  const vocabulary = new Set<string>();
  for (const label of labels) for (const token of Object.keys(counts[label])) vocabulary.add(token);

  const topTokens: Record<string, Array<{ token: string; count: number }>> = {};
  for (const label of labels) {
    topTokens[label] = Object.entries(counts[label])
      .map(([token, count]) => ({ token, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }
  return { counts, totals, docCount, vocabSize: vocabulary.size, topTokens };
}

/** 各标签的对数得分(先验 + 平滑后的条件概率) */
function logScores(model: NaiveBayesModel, labels: Labels, text: string): Record<string, number> {
  const tokens = tokenize(text);
  const totalDocs = labels.reduce((sum, l) => sum + model.docCount[l], 0);
  const scores: Record<string, number> = {};
  for (const label of labels) {
    let score = Math.log((model.docCount[label] + 1) / (totalDocs + labels.length));
    for (const token of tokens) {
      score += Math.log(
        ((model.counts[label][token] ?? 0) + 1) / (model.totals[label] + model.vocabSize + 1),
      );
    }
    scores[label] = score;
  }
  return scores;
}

export function predict(model: NaiveBayesModel, labels: Labels, text: string): string {
  const scores = logScores(model, labels, text);
  return labels.reduce((best, l) => (scores[l] > scores[best] ? l : best), labels[0]);
}

/**
 * 模型置信度: 对数得分经 softmax 归一化后的最高类概率(0~1)。
 * log 差值大时 softmax 会饱和, 这里对差值做上限截断, 让显示值不至于永远 100%。
 */
export function confidence(model: NaiveBayesModel, labels: Labels, text: string): number {
  const scores = logScores(model, labels, text);
  const max = Math.max(...labels.map(l => scores[l]));
  // 截断: 与最高分的差距最多按 4 个自然对数单位参与 softmax
  const exps = labels.map(l => Math.exp(Math.max(scores[l] - max, -4)));
  const sum = exps.reduce((a, b) => a + b, 0);
  return Math.max(...exps) / sum;
}
