import { describe, expect, it } from 'vitest';
import {
  gradeByType, singleChoiceGrader, fileClassifyGrader, textSentimentGrader, dataLabelingGrader,
  compositeTaskGrader, normalizeTrueFalseAnswer, parseTrueFalseAnswerKey, parseSingleChoiceAnswerKey,
} from '../index';

describe('审查修复回归:选项键严格校验', () => {
  it('单选接受合法选项键', () => {
    expect(singleChoiceGrader.grade({ selectedOption: 'a' }, { correctOption: 'A' }).correct).toBe(true);
  });
  it('文本型 answer_key 不能被当作选项键骗分', () => {
    const r = singleChoiceGrader.grade({ selectedOption: '人工智能' }, { correctOption: '人工智能' });
    expect(r.correct).toBe(false);
    expect(r.details?.invalid).toBe(true);
  });
  it('多字符选项键一律 invalid', () => {
    expect(singleChoiceGrader.grade({ selectedOption: 'AB' }, { correctOption: 'AB' }).correct).toBe(false);
    expect(singleChoiceGrader.grade({ selectedOption: '1' }, { correctOption: '1' }).correct).toBe(false);
  });
});

describe('审查修复回归:gradeByType 出口 clamp', () => {
  it('任何评分器结果都被钳制在 0..1', () => {
    const r = gradeByType('image_clean', { decisions: { a: 'keep' } }, { correctDecisions: { a: 'keep' } });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
  it('未知评分器返回 0 分', () => {
    expect(gradeByType('not_a_grader', {}, {}).score).toBe(0);
  });
});

describe('审查修复回归:标签比较统一 trim', () => {
  it('文件分类容忍尾随空格', () => {
    expect(fileClassifyGrader.grade({ classifications: { f1: '合同 ' } }, { correctClassifications: { f1: '合同' } }).correct).toBe(true);
  });
  it('情感标注容忍尾随空格', () => {
    expect(textSentimentGrader.grade({ sentiments: { c1: '好评 ' } }, { correctSentiments: { c1: '好评' } }).correct).toBe(true);
  });
  it('数据标注容忍尾随空格', () => {
    expect(dataLabelingGrader.grade({ labels: { d1: ' 合格' } }, { correctLabels: { d1: '合格' } }).correct).toBe(true);
  });
});

describe('审查修复回归:综合任务递归防御', () => {
  it('子任务不允许再次使用 composite_task 评分器', () => {
    const r = compositeTaskGrader.grade(
      { subtasks: { s1: { selectedOption: 'A' } } },
      { subtasks: { s1: { weight: 1, graderId: 'composite_task', answerKey: { subtasks: {} } } } },
    );
    // 递归配置被跳过,权重为 0 → invalid 而非递归计分
    expect(r.correct).toBe(false);
  });
  it('叶子评分器正常工作', () => {
    const r = compositeTaskGrader.grade(
      { subtasks: { s1: { selectedOption: 'A' } } },
      { subtasks: { s1: { weight: 1, graderId: 'single_choice', answerKey: { correctOption: 'A' } } } },
    );
    expect(r.correct).toBe(true);
    expect(r.score).toBe(1);
  });
});

describe('审查修复回归:共享答案归一(练习/考试一致)', () => {
  it('判断题真值集合两端一致(未识别输入归 null,交评分器判 invalid)', () => {
    for (const v of ['A', 'a', 'TRUE', 'true', '正确', '对', '是', true]) {
      expect(normalizeTrueFalseAnswer(v)).toBe(true);
    }
    for (const v of ['B', 'b', 'FALSE', 'F', 'NO', 'N', '0', '错误', '错', '否', false]) {
      expect(normalizeTrueFalseAnswer(v)).toBe(false);
    }
    for (const v of ['', '   ', '随便乱填', 'C', null, undefined, 42]) {
      expect(normalizeTrueFalseAnswer(v)).toBe(null);
    }
  });
  it('判断题乱输入经 gradeByType 判 invalid 0 分,不能白拿答案为"错"的题', () => {
    const r = gradeByType('true_false', { answer: normalizeTrueFalseAnswer('乱串xyz') }, { correctAnswer: false });
    expect(r.correct).toBe(false);
    expect(r.score).toBe(0);
    expect(r.details).toMatchObject({ invalid: true });
  });
  it('解析判断题 answer_key 的多种形态', () => {
    expect(parseTrueFalseAnswerKey(true)).toBe(true);
    expect(parseTrueFalseAnswerKey(false)).toBe(false);
    expect(parseTrueFalseAnswerKey('A')).toBe(true);
    expect(parseTrueFalseAnswerKey('B')).toBe(false);
    expect(parseTrueFalseAnswerKey('"true"')).toBe(true);
    expect(parseTrueFalseAnswerKey('正确')).toBe(true);
    expect(parseTrueFalseAnswerKey('错误')).toBe(false);
    expect(parseTrueFalseAnswerKey({ correctAnswer: true })).toBe(true);
    expect(parseTrueFalseAnswerKey('不知道')).toBe(null);
  });
  it('解析单选题 answer_key 的多种形态', () => {
    expect(parseSingleChoiceAnswerKey('C')).toBe('C');
    expect(parseSingleChoiceAnswerKey('c')).toBe('C');
    expect(parseSingleChoiceAnswerKey('"B"')).toBe('B');
    expect(parseSingleChoiceAnswerKey({ correctOption: 'D' })).toBe('D');
    expect(parseSingleChoiceAnswerKey({ letter: 'a' })).toBe('A');
    expect(parseSingleChoiceAnswerKey('人工智能')).toBe(null);
    expect(parseSingleChoiceAnswerKey('AB')).toBe(null);
    expect(parseSingleChoiceAnswerKey(1)).toBe(null);
  });
});
