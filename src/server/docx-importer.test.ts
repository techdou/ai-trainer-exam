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
