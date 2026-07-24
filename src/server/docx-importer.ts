/**
 * DOCX 理论题库导入器
 * 解析"人工智能训练师五级理论复习资料.docx"中的单选题和判断题。
 *
 * 格式特征（从实际文件分析）:
 * - 单选题：编号 + 题干 + (A)(B)(C)(D) 选项 + 答案（行尾或独立行，如 C, "C, B）
 * - 判断题：编号 + 题干 + 答案（正确/错误，或 √/×，或 (A)正确(B)错误 后接 A/B）
 * - 全角/半角混用，异常换行，题号缺失或重复
 * - 答案可能出现在选项后的同一行尾（如 ...全部删除"C）
 *
 * 导入后题目进入 imported_unreviewed 状态，不直接发布。
 */

/** 解析出的原始题目（导入前中间态） */
export interface ParsedQuestion {
  sourceIndex: number; // 在原文中的序号
  sourceNumber: string | null; // 题号（可能有缺失/重复）
  questionType: 'single_choice' | 'true_false';
  stem: string;
  options: string[]; // 单选题的选项文本，判断题为空
  answerKey: string; // 单选题: 'A'|'B'|'C'|'D'; 判断题: 'true'|'false'
  rawText: string; // 原始文本（调试用）
  warnings: string[]; // 质检告警
}

/** 导入结果 */
export interface ParseResult {
  questions: ParsedQuestion[];
  skipped: { rawText: string; reason: string }[];
  issues: { questionNo: string; type: string; message: string }[];
  stats: {
    totalLines: number;
    singleChoice: number;
    trueFalse: number;
    duplicateNumbers: string[];
    missingAnswers: number;
  };
}

/**
 * 从 DOCX 文件的 ArrayBuffer/Buffer 解析题库。
 * 使用 mammoth 提取纯文本，再用正则切分题目。
 */
export async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return parsePlainText(result.value);
}

/**
 * 从纯文本解析题库（单元测试入口）。
 */
export function parsePlainText(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const questions: ParsedQuestion[] = [];
  const skipped: { rawText: string; reason: string }[] = [];
  const numbersSeen = new Map<string, number>();

  // 将所有文本按题目边界切分
  // 题目起始标志：行首数字 + 点号/顿号/空格 + 题干内容
  // 注意：文档有"一、单选题" "二、判断题" 这样的章节标题
  let currentSection: 'single_choice' | 'true_false' | null = null;
  let buffer: string[] = [];
  let currentNumber: string | null = null;
  let lineIdx = 0;

  // 先合并连续行（同一题目的选项可能跨行）
  // 用一个更可靠的方法：识别"题号.题干"模式来切分
  const questionBlocks = splitIntoQuestionBlocks(lines);

  for (const block of questionBlocks) {
    const q = parseSingleBlock(block.text, block.sectionType);
    if (q) {
      questions.push(q);
      if (q.sourceNumber) {
        const count = numbersSeen.get(q.sourceNumber) ?? 0;
        numbersSeen.get(q.sourceNumber);
        numbersSeen.set(q.sourceNumber, count + 1);
      }
    } else {
      skipped.push({ rawText: block.text.join(' '), reason: '无法识别题目结构' });
    }
    lineIdx++;
  }

  // 检测重复题号
  const duplicateNumbers: string[] = [];
  for (const [num, count] of numbersSeen) {
    if (count > 1) duplicateNumbers.push(num);
  }

  // 近似重复题检测（题干完全相同）
  const stemSet = new Map<string, number>();
  for (const q of questions) {
    const normalized = q.stem.replace(/\s+/g, '').slice(0, 80);
    const c = stemSet.get(normalized) ?? 0;
    stemSet.set(normalized, c + 1);
    if (c >= 1) {
      q.warnings.push('近似重复题：题干与已有题目高度相似');
    }
  }

  const missingAnswers = questions.filter((q) => !q.answerKey).length;

  return {
    questions,
    skipped,
    issues: [],
    stats: {
      totalLines: lines.length,
      singleChoice: questions.filter((q) => q.questionType === 'single_choice').length,
      trueFalse: questions.filter((q) => q.questionType === 'true_false').length,
      duplicateNumbers,
      missingAnswers,
    },
  };
}

interface Block {
  text: string[];
  sectionType: 'single_choice' | 'true_false' | null;
}

/**
 * 将行列表切分为题目块。
 * 章节标题（"一、单选题" / "二、判断题"）决定后续题目的题型。
 * 题目边界：行首匹配 数字+点/顿号 的模式。
 */
function splitIntoQuestionBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let currentBlock: string[] | null = null;
  let currentSection: 'single_choice' | 'true_false' | null = null;

  // 章节/题号识别正则
  const sectionChoice = /[一二三四五六七八九十]+[、.\s]*单选/;
  const sectionJudge = /[一二三四五六七八九十]+[、.\s]*判断/;
  // 题号：行首数字 + . 或 、 或 空格
  const questionStart = /^(\d{1,4})[.、\s]+/;

  for (const line of lines) {
    // 检测章节标题
    if (sectionChoice.test(line) && line.length < 20) {
      currentSection = 'single_choice';
      continue;
    }
    if (sectionJudge.test(line) && line.length < 20) {
      currentSection = 'true_false';
      continue;
    }

    const m = line.match(questionStart);
    if (m && line.length > 10) {
      // 新题开始
      if (currentBlock) {
        blocks.push({ text: currentBlock, sectionType: currentSection });
      }
      currentBlock = [line];
    } else if (currentBlock) {
      // 题目续行
      currentBlock.push(line);
    } else {
      // 题号前的杂散文本，跳过
    }
  }
  if (currentBlock) {
    blocks.push({ text: currentBlock, sectionType: currentSection });
  }

  return blocks;
}

/**
 * 解析单个题目块。
 */
function parseSingleBlock(
  lines: string[],
  defaultSection: 'single_choice' | 'true_false' | null,
): ParsedQuestion | null {
  const fullText = lines.join('\n');
  const sourceIdx = 0; // 由调用方设置

  // 判断题型：如果块中有 (A)正确 (B)错误 或 √/× → true_false
  // 如果块中有 (A)...(B)...(C)...(D)... → single_choice
  const hasFourOptions = /\(?[Aa]\)[\s\S]+\(?[Bb]\)[\s\S]+\(?[Cc]\)[\s\S]+\(?[Dd]\)/.test(fullText);
  const hasTrueFalse = /\(?[Aa]\)\s*正确|√|×|对\b|错\b/.test(fullText);

  let questionType: 'single_choice' | 'true_false';
  if (defaultSection === 'true_false') {
    questionType = 'true_false';
  } else if (hasFourOptions) {
    questionType = 'single_choice';
  } else if (hasTrueFalse && !hasFourOptions) {
    questionType = 'true_false';
  } else if (defaultSection === 'single_choice') {
    questionType = 'single_choice';
  } else {
    questionType = 'single_choice'; // 默认
  }

  // 提取题号
  const firstLine = lines[0] ?? '';
  const numMatch = firstLine.match(/^(\d{1,4})[.、\s]+/);
  const sourceNumber = numMatch ? numMatch[1] : null;

  const warnings: string[] = [];
  if (!sourceNumber) warnings.push('题号缺失');

  if (questionType === 'single_choice') {
    return parseSingleChoice(lines, sourceNumber, warnings);
  } else {
    return parseTrueFalse(lines, sourceNumber, warnings);
  }
}

/**
 * 解析单选题
 */
function parseSingleChoice(
  lines: string[],
  sourceNumber: string | null,
  warnings: string[],
): ParsedQuestion | null {
  const fullText = lines.join('\n');
  const allText = lines.join(' ');

  // ---- FIRST: Extract answer key from trailing "\tX pattern ----
  // The DOCX format embeds the answer at end of last option line as:  "\tC  or  "\tA
  let answerKey: string | null = null;
  const answerInTrailingQuote = allText.match(/[""']\s*\t\s*([A-Da-d])\s*$/);
  if (answerInTrailingQuote) {
    answerKey = answerInTrailingQuote[1].toUpperCase();
  }
  // Fallback: 答案：X / 正确答案：X
  if (!answerKey) {
    const answerLabel = allText.match(/(?:正确)?答案[：:]\s*([A-Da-d])\s*$/);
    if (answerLabel) answerKey = answerLabel[1].toUpperCase();
  }

  // ---- NEXT: Extract options ----
  // 查找选项模式 (A) 或 （A） 或 A. 或 A、或 A）
  const optionPattern = /[（(]([A-Da-d])[）)、.，,\s]+/g;
  const optionMatches: { letter: string; startPos: number; endPos: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = optionPattern.exec(allText)) !== null) {
    optionMatches.push({
      letter: m[1].toUpperCase(),
      startPos: m.index + m[0].length,
      endPos: 0,
    });
  }

  // 设定每个选项文本的结束位置为下一选项的开始
  for (let i = 0; i < optionMatches.length; i++) {
    optionMatches[i].endPos =
      i + 1 < optionMatches.length ? optionMatches[i + 1].startPos - optionMatches[i + 1].letter.length - 1 : allText.length;
  }

  // 过滤出 A/B/C/D 四个选项
  const validOptions = optionMatches.filter((o) => ['A', 'B', 'C', 'D'].includes(o.letter));
  const optionMap = new Map<string, string>();
  for (const o of validOptions) {
    let text = allText.slice(o.startPos, o.endPos).trim();
    // 清理选项文本末尾的答案标记（如 "\tC 或 "C）
    text = text
      .replace(/[""'\t]+[A-Da-d]\s*$/g, '')
      .replace(/[""'\t\r\n\s]+$/g, '')
      // 清理选项文本末尾的下一选项开头的括号（如 " （"）
      .replace(/[（(\s]+$/g, '')
      .trim();
    optionMap.set(o.letter, text);
  }

  if (optionMap.size < 2) {
    warnings.push('选项不足');
  }

  // 提取题干
  const firstLine = lines[0] ?? '';
  const numMatch = firstLine.match(/^\d{1,4}[.、\s]+/);
  const afterNumber = numMatch ? firstLine.slice(numMatch[0].length) : firstLine;
  const firstOptionPos = validOptions.length > 0 ? allText.indexOf(allText.match(/[（(][Aa][）)、.,\s]/)?.[0] ?? '') : -1;
  let stem: string;
  if (firstOptionPos > 0) {
    stem = allText.slice(0, firstOptionPos).trim();
  } else {
    // 选项和题干在同一行的情况
    stem = afterNumber.trim();
  }
  // 去掉题号
  stem = stem.replace(/^\d{1,4}[.、\s]+/, '').trim();
  // 清理题干末尾的？（）等
  stem = stem.replace(/[\s？?]+$/, '').trim();

  if (!answerKey) {
    warnings.push('答案缺失');
  } else if (!['A', 'B', 'C', 'D'].includes(answerKey)) {
    warnings.push(`答案异常: ${answerKey}`);
  }

  const options = ['A', 'B', 'C', 'D'].map((k) => optionMap.get(k) ?? '').filter((s) => s.length > 0);

  return {
    sourceIndex: 0,
    sourceNumber,
    questionType: 'single_choice',
    stem,
    options,
    answerKey: answerKey ?? '',
    rawText: fullText,
    warnings,
  };
}

/**
 * 解析判断题
 */
function parseTrueFalse(
  lines: string[],
  sourceNumber: string | null,
  warnings: string[],
): ParsedQuestion | null {
  const fullText = lines.join('\n');
  const allText = lines.join(' ');

  // ---- FIRST: Extract answer key ----
  // DOCX format: （A）正确"\tA or （B）错误"\tB at end
  let answerKey: string | null = null;
  const abInTrailing = allText.match(/[""']\s*\t\s*([AaBb])\s*$/);
  if (abInTrailing) {
    answerKey = abInTrailing[1].toUpperCase() === 'A' ? 'true' : 'false';
  }
  // Fallback: √ / ×
  if (!answerKey) {
    if (/√/.test(allText)) answerKey = 'true';
    else if (/×/.test(allText)) answerKey = 'false';
  }
  // Fallback: 正确/错误 in quotes at end
  if (!answerKey) {
    const tfQuote = allText.match(/[""']\s*(正确|错误)\s*[""']?\s*$/);
    if (tfQuote) answerKey = tfQuote[1] === '正确' ? 'true' : 'false';
  }
  // Fallback: plain 正确/错误 at end
  if (!answerKey) {
    const plainMatch = allText.match(/(正确|错误)\s*[""']?\s*$/);
    if (plainMatch) answerKey = plainMatch[1] === '正确' ? 'true' : 'false';
  }

  // 判断题的题干 = 全文去掉题号
  let stem = allText.replace(/^\d{1,4}[.、\s]+/, '').trim();

  // 如果是 (A)正确 (B)错误 格式，提取题干
  const tfOptionPattern = /[（(][Aa][）)、.,\s]*(正确|对)/;
  const tfMatch = stem.match(tfOptionPattern);
  if (tfMatch && tfMatch.index !== undefined) {
    stem = stem.slice(0, tfMatch.index).trim();
  }

  // 清理题干末尾的答案标记
  stem = stem.replace(/[""'√×（）()\s]*$/, '').trim();
  stem = stem.replace(/[（(]([Aa])[）)、.,\s]*正确.*$/, '').trim();
  stem = stem.replace(/[（(]([Bb])[）)、.,\s]*错误.*$/, '').trim();

  if (!answerKey) {
    warnings.push('答案缺失');
  }

  return {
    sourceIndex: 0,
    sourceNumber,
    questionType: 'true_false',
    stem,
    options: [],
    answerKey: answerKey ?? '',
    rawText: fullText,
    warnings,
  };
}

/**
 * 从题目文本中提取答案。
 *
 * 单选题答案模式（按优先级）:
 * 1. 行尾引号内字母：..."C 或 ..."C 或 ''C
 * 2. 行尾独立字母：...全部删除"C
 * 3. 答案：X
 * 4. 正确答案：X
 *
 * 判断题答案模式：
 * 1. √ / ×
 * 2. 正确 / 错误（行尾）
 * 3. "A (当有(A)正确(B)错误格式时)
 * 4. "B
 */
export function extractAnswerKey(
  text: string,
  type: 'single_choice' | 'true_false',
): string | null {
  // 去除多余空白用于答案匹配
  const t = text.replace(/\s+/g, ' ').trim();

  if (type === 'true_false') {
    // √ or ×
    if (/√/.test(t)) return 'true';
    if (/×/.test(t)) return 'false';
    // 行尾：正确/错误（在引号内或外）
    const tfQuote = t.match(/["""]\s*(正确|错误)\s*["""]?\s*$/);
    if (tfQuote) return tfQuote[1] === '正确' ? 'true' : 'false';
    // (A)正确(B)错误 后 "A or "B
    const abMatch = t.match(/["""]([AaBb])\s*$/);
    if (abMatch) return abMatch[1].toUpperCase() === 'A' ? 'true' : 'false';
    // 纯文字 正确/错误 在末尾
    const plainMatch = t.match(/(正确|错误)\s*["""]?\s*$/);
    if (plainMatch) return plainMatch[1] === '正确' ? 'true' : 'false';
    return null;
  }

  // 单选题
  // 模式1：行尾引号内字母 "C 或 "C 或 ''C
  const quotedLetter = t.match(/["""]([A-Da-d])\s*["""]?\s*$/);
  if (quotedLetter) return quotedLetter[1].toUpperCase();

  // 模式2：答案：C / 答案:C / 正确答案：C
  const answerLabel = t.match(/(?:正确)?答案[：:]\s*([A-Da-d])\s*$/);
  if (answerLabel) return answerLabel[1].toUpperCase();

  // 模式3：纯字母结尾（不太可靠，仅当行尾就是单个字母+引号）
  // 已被模式1覆盖

  return null;
}

/**
 * 题库质检：检测近似重复题。
 * 使用简单的 Jaccard 字符集相似度。
 */
export function findNearDuplicates(
  questions: ParsedQuestion[],
  threshold = 0.85,
): { q1: number; q2: number; similarity: number }[] {
  const stems = questions.map((q) => {
    const s = q.stem.replace(/[\s，。、？？]/g, '');
    const set = new Set(s);
    return { chars: set, len: s.length };
  });

  const result: { q1: number; q2: number; similarity: number }[] = [];
  for (let i = 0; i < stems.length; i++) {
    for (let j = i + 1; j < stems.length; j++) {
      const intersection = [...stems[i].chars].filter((c) => stems[j].chars.has(c)).length;
      const union = new Set([...stems[i].chars, ...stems[j].chars]).size;
      const sim = union > 0 ? intersection / union : 0;
      if (sim >= threshold) {
        result.push({ q1: i, q2: j, similarity: sim });
      }
    }
  }
  return result;
}
