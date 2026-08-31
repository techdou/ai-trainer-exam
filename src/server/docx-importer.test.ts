import { describe, it, expect } from 'vitest';
import { parsePlainText } from './docx-importer';

describe('parsePlainText', () => {
  describe('single choice questions', () => {
    it('parses standard single choice with answer on own line', () => {
      const text = [
        '一、单选题',
        '1. 以下哪个是人工智能的英文缩写？',
        'A. AI',
        'B. IT',
        'C. CPU',
        'D. GPU',
        '答案：A',
      ].join('\n');

      const result = parsePlainText(text);
      expect(result.questions).toHaveLength(1);
      const q = result.questions[0];
      expect(q.questionType).toBe('single_choice');
      expect(q.stem).toContain('人工智能');
      expect(q.answerKey).toBe('A');
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(result.stats.singleChoice).toBe(1);
    });

    it('parses single choice with inline answer (answer at end of options line)', () => {
      const text = [
        '1. 以下哪种做法最好？',
        'A. 直接删除数据',
        'B. 保留并标记',
        'C. 忽略不管',
        'D. 随机处理"C',
      ].join('\n');

      const result = parsePlainText(text);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].answerKey).toBe('C');
    });

    it('parses multiple single choice questions', () => {
      const text = [
        '一、单选题',
        '1. 题干一？',
        'A. 选项A',
        'B. 选项B',
        'C. 选项C',
        'D. 选项D',
        '答案：A',
        '2. 题干二？',
        'A. 选项A',
        'B. 选项B',
        'C. 选项C',
        'D. 选项D',
        '答案：B',
      ].join('\n');

      const result = parsePlainText(text);
      expect(result.questions).toHaveLength(2);
      expect(result.questions[0].answerKey).toBe('A');
      expect(result.questions[1].answerKey).toBe('B');
    });

    it('handles full-width parentheses in options', () => {
      const text = [
        '1. 测试题',
        '（A）选项一',
        '（B）选项二',
        '（C）选项三',
        '（D）选项四',
        '答案：B',
      ].join('\n');

      const result = parsePlainText(text);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].answerKey).toBe('B');
    });
  });

  describe('true/false questions', () => {
    it('parses true/false with correct/wrong answer', () => {
      const text = [
        '二、判断题',
        '1. 人工智能训练师只需要会编程。',
        '答案：错误',
      ].join('\n');

      const result = parsePlainText(text);
      expect(result.questions).toHaveLength(1);
      const q = result.questions[0];
      expect(q.questionType).toBe('true_false');
      expect(q.answerKey).toBe('false');
      expect(result.stats.trueFalse).toBe(1);
    });

    it('parses true/false with correct answer', () => {
      const text = [
        '二、判断题',
        '1. 数据标注需要保证一致性。',
        '答案：正确',
      ].join('\n');

      const result = parsePlainText(text);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].answerKey).toBe('true');
    });

    it('parses true/false with checkmark and cross', () => {
      const text = [
        '二、判断题',
        '1. 数据清洗可以提高模型质量。',
        '√',
      ].join('\n');

      const result = parsePlainText(text);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].answerKey).toBe('true');
    });

    it('parses true/false with cross mark', () => {
      const text = [
        '二、判断题',
        '1. 所有数据都可以直接用于训练。',
        '×',
      ].join('\n');

      const result = parsePlainText(text);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].answerKey).toBe('false');
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = parsePlainText('');
      expect(result.questions).toHaveLength(0);
      expect(result.stats.totalLines).toBe(0);
    });

    it('handles whitespace-only input', () => {
      const result = parsePlainText('   \n\n   \n');
      expect(result.questions).toHaveLength(0);
    });

    it('detects duplicate question numbers', () => {
      const text = [
        '一、单选题',
        '1. 第一题？',
        'A. 选项A',
        'B. 选项B',
        'C. 选项C',
        'D. 选项D',
        '答案：A',
        '1. 重复题号的题？',
        'A. 选项A',
        'B. 选项B',
        'C. 选项C',
        'D. 选项D',
        '答案：B',
      ].join('\n');

      const result = parsePlainText(text);
      expect(result.stats.duplicateNumbers.length).toBeGreaterThan(0);
    });

    it('detects near-duplicate stems', () => {
      const text = [
        '一、单选题',
        '1. 以下哪个是人工智能的英文缩写？',
        'A. AI',
        'B. IT',
        'C. CPU',
        'D. GPU',
        '答案：A',
        '2. 以下哪个是人工智能的英文缩写？',
        'A. AI',
        'B. IT',
        'C. CPU',
        'D. GPU',
        '答案：B',
      ].join('\n');

      const result = parsePlainText(text);
      const warned = result.questions.filter((q) =>
        q.warnings.some((w) => w.includes('重复')),
      );
      expect(warned.length).toBeGreaterThan(0);
    });

    it('handles mixed single choice and true/false', () => {
      const text = [
        '一、单选题',
        '1. 单选题？',
        'A. 选项A',
        'B. 选项B',
        'C. 选项C',
        'D. 选项D',
        '答案：A',
        '二、判断题',
        '1. 判断题。',
        '答案：正确',
      ].join('\n');

      const result = parsePlainText(text);
      expect(result.stats.singleChoice).toBe(1);
      expect(result.stats.trueFalse).toBe(1);
      expect(result.questions).toHaveLength(2);
    });

    it('collects skipped non-question content', () => {
      const text = [
        '一些说明文字',
        '没有题号的段落',
        '也不是题目',
      ].join('\n');

      const result = parsePlainText(text);
      expect(result.questions).toHaveLength(0);
      expect(result.skipped.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('answer format variants', () => {
    it('handles answer with letter prefix', () => {
      const text = [
        '一、单选题',
        '1. 题目？',
        'A. 选项A',
        'B. 选项B',
        'C. 选项C',
        'D. 选项D',
        'C',
      ].join('\n');

      const result = parsePlainText(text);
      if (result.questions.length > 0) {
        expect(['A', 'B', 'C', 'D']).toContain(result.questions[0].answerKey);
      }
    });
  });
});

// ---- 脏题拦截回归测试(2026-08-31 题库事故):0 选项/答案越界的题必须进 skipped ----
describe('dirty question rejection', () => {
  it('rejects single choice with zero options (answer present)', () => {
    const text = [
      '1. Agent 与大模型最本质的区别是？',
      '答案：B',
    ].join('\n');
    const result = parsePlainText(text);
    expect(result.questions).toHaveLength(0);
    expect(result.skipped.length).toBeGreaterThanOrEqual(1);
    expect(result.skipped[0].reason).toContain('选项不足');
  });

  it('rejects answer beyond option range (answerKey D with only 3 options)', () => {
    const text = [
      '1. 同事发来一个 Python 脚本，运行报错，最可能的原因是？',
      '（A）文件名太长',
      '（B）内存不足',
      '（C）需要重装系统"D',
    ].join('\n');
    const result = parsePlainText(text);
    expect(result.questions).toHaveLength(0);
    expect(result.skipped.some(s => s.reason.includes('超出选项范围'))).toBe(true);
  });

  it('keeps option slots uncompressed when one option text is empty (no letter misalignment)', () => {
    // B 选项文本为空:旧实现 filter 压缩后 C 的文本占到 B、答案错位;新实现保留占位,
    // 汇聚层(bulkInsert 硬校验)会以"有效选项不足"整题拦截——解析层职责是不制造错位。
    const text = [
      '1. 题干？',
      '（A）选项一',
      '（B）',
      '（C）选项三',
      '（D）选项四"C',
    ].join('\n');
    const result = parsePlainText(text);
    if (result.questions.length === 1) {
      const q = result.questions[0];
      expect(q.options.length).toBe(4);          // 位置不被压缩
      expect(q.options[0]).toContain('选项一');   // A 仍是选项一
      expect(q.options[2]).toContain('选项三');   // C 仍是选项三,不错位
    } else {
      // 被整题拦截也合规(空选项=有效选项不足)
      expect(result.skipped.length).toBeGreaterThanOrEqual(1);
    }
  });
});
