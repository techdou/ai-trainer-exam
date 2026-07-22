import { describe, it, expect } from 'vitest';
import {
  singleChoiceGrader,
  trueFalseGrader,
  excelDeleteRowsGrader,
  statsTableGrader,
  fileClassifyGrader,
  imageCleanGrader,
  imageAnnotationGrader,
  textSentimentGrader,
  audioTranscriptionGrader,
  datasetQualityGrader,
  compositeTaskGrader,
  gradeByType,
  getRegisteredGraderIds,
} from '../index';

describe('singleChoiceGrader', () => {
  it('correct answer', () => {
    const result = singleChoiceGrader.grade(
      { selectedOption: 'B' },
      { correctOption: 'B' },
    );
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  it('wrong answer', () => {
    const result = singleChoiceGrader.grade(
      { selectedOption: 'A' },
      { correctOption: 'B' },
    );
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.feedback).toContain('B');
  });

  it('case insensitive', () => {
    const result = singleChoiceGrader.grade(
      { selectedOption: 'b' },
      { correctOption: 'B' },
    );
    expect(result.correct).toBe(true);
  });

  it('is deterministic', () => {
    const r1 = singleChoiceGrader.grade({ selectedOption: 'C' }, { correctOption: 'C' });
    const r2 = singleChoiceGrader.grade({ selectedOption: 'C' }, { correctOption: 'C' });
    expect(r1).toEqual(r2);
  });
});

describe('trueFalseGrader', () => {
  it('correct true', () => {
    const result = trueFalseGrader.grade({ answer: true }, { correctAnswer: true });
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  it('wrong answer', () => {
    const result = trueFalseGrader.grade({ answer: true }, { correctAnswer: false });
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
  });
});

describe('excelDeleteRowsGrader', () => {
  it('all correct', () => {
    const result = excelDeleteRowsGrader.grade(
      { retainedRowIndexes: [0, 2, 4] },
      { correctRetainedRowIndexes: [0, 2, 4] },
    );
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  it('partial - extra deletions', () => {
    const result = excelDeleteRowsGrader.grade(
      { retainedRowIndexes: [0, 4] }, // deleted row 2 too
      { correctRetainedRowIndexes: [0, 2, 4] },
    );
    expect(result.correct).toBe(false);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });

  it('empty - all wrong', () => {
    const result = excelDeleteRowsGrader.grade(
      { retainedRowIndexes: [] },
      { correctRetainedRowIndexes: [1, 2, 3] },
    );
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
  });
});

describe('statsTableGrader', () => {
  it('all correct', () => {
    const result = statsTableGrader.grade(
      { cells: { B2: 100, C3: 'hello' } },
      { correctCells: { B2: 100, C3: 'hello' } },
    );
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  it('numeric tolerance', () => {
    const result = statsTableGrader.grade(
      { cells: { B2: 100.005 } },
      { correctCells: { B2: 100, C3: 50 }, numericTolerance: 0.01 },
    );
    expect(result.score).toBe(0.5); // B2 correct, C3 missing
  });

  it('empty answer key', () => {
    const result = statsTableGrader.grade(
      { cells: {} },
      { correctCells: {} },
    );
    expect(result.correct).toBe(true);
  });
});

describe('fileClassifyGrader', () => {
  it('all correct', () => {
    const result = fileClassifyGrader.grade(
      { classifications: { 'a.jpg': 'image', 'b.txt': 'text' } },
      { correctClassifications: { 'a.jpg': 'image', 'b.txt': 'text' } },
    );
    expect(result.correct).toBe(true);
  });

  it('partial', () => {
    const result = fileClassifyGrader.grade(
      { classifications: { 'a.jpg': 'image', 'b.txt': 'data' } },
      { correctClassifications: { 'a.jpg': 'image', 'b.txt': 'text' } },
    );
    expect(result.score).toBe(0.5);
  });
});

describe('imageCleanGrader', () => {
  it('all correct', () => {
    const result = imageCleanGrader.grade(
      { decisions: { 'img1': 'keep', 'img2': 'discard' } },
      { correctDecisions: { 'img1': 'keep', 'img2': 'discard' } },
    );
    expect(result.correct).toBe(true);
  });

  it('wrong decision', () => {
    const result = imageCleanGrader.grade(
      { decisions: { 'img1': 'discard', 'img2': 'discard' } },
      { correctDecisions: { 'img1': 'keep', 'img2': 'discard' } },
    );
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0.5);
  });
});

describe('imageAnnotationGrader', () => {
  it('perfect match', () => {
    const result = imageAnnotationGrader.grade(
      { boxes: [{ x: 10, y: 20, width: 100, height: 50, label: 'cat' }] },
      { boxes: [{ x: 10, y: 20, width: 100, height: 50, label: 'cat' }] },
    );
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  it('slight offset within IoU threshold', () => {
    const result = imageAnnotationGrader.grade(
      { boxes: [{ x: 12, y: 22, width: 100, height: 50, label: 'cat' }] },
      { boxes: [{ x: 10, y: 20, width: 100, height: 50, label: 'cat' }], iouThreshold: 0.5 },
    );
    expect(result.correct).toBe(true);
  });

  it('wrong label', () => {
    const result = imageAnnotationGrader.grade(
      { boxes: [{ x: 10, y: 20, width: 100, height: 50, label: 'dog' }] },
      { boxes: [{ x: 10, y: 20, width: 100, height: 50, label: 'cat' }] },
    );
    expect(result.correct).toBe(false);
  });
});

describe('textSentimentGrader', () => {
  it('all correct', () => {
    const result = textSentimentGrader.grade(
      { sentiments: { t1: 'positive', t2: 'negative' } },
      { correctSentiments: { t1: 'positive', t2: 'negative' } },
    );
    expect(result.correct).toBe(true);
  });

  it('one wrong', () => {
    const result = textSentimentGrader.grade(
      { sentiments: { t1: 'positive', t2: 'neutral' } },
      { correctSentiments: { t1: 'positive', t2: 'negative' } },
    );
    expect(result.score).toBe(0.5);
  });
});

describe('audioTranscriptionGrader', () => {
  it('exact match', () => {
    const result = audioTranscriptionGrader.grade(
      { transcript: '今天天气很好' },
      { correctTranscript: '今天天气很好' },
    );
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  it('close enough', () => {
    const result = audioTranscriptionGrader.grade(
      { transcript: '今天天气好' },
      { correctTranscript: '今天天气很好', similarityThreshold: 0.8 },
    );
    expect(result.score).toBeGreaterThan(0.7);
  });

  it('completely wrong', () => {
    const result = audioTranscriptionGrader.grade(
      { transcript: '完全不同' },
      { correctTranscript: '今天天气很好' },
    );
    expect(result.correct).toBe(false);
  });
});

describe('datasetQualityGrader', () => {
  it('all flagged correctly', () => {
    const result = datasetQualityGrader.grade(
      { flaggedItems: ['d1', 'd3'] },
      { correctFlaggedItems: ['d1', 'd3'] },
    );
    expect(result.correct).toBe(true);
  });

  it('missed one', () => {
    const result = datasetQualityGrader.grade(
      { flaggedItems: ['d1'] },
      { correctFlaggedItems: ['d1', 'd3'] },
    );
    expect(result.correct).toBe(false);
    expect(result.score).toBeGreaterThan(0);
  });

  it('no issues to flag', () => {
    const result = datasetQualityGrader.grade(
      { flaggedItems: [] },
      { correctFlaggedItems: [] },
    );
    expect(result.correct).toBe(true);
  });
});

describe('compositeTaskGrader', () => {
  it('all subtasks correct', () => {
    const result = compositeTaskGrader.grade(
      {
        subtasks: {
          q1: { selectedOption: 'B' },
          q2: { answer: true },
        },
      },
      {
        subtasks: {
          q1: { weight: 0.6, graderId: 'single_choice', answerKey: { correctOption: 'B' } },
          q2: { weight: 0.4, graderId: 'true_false', answerKey: { correctAnswer: true } },
        },
      },
    );
    expect(result.correct).toBe(true);
    expect(result.score).toBe(1);
  });

  it('partial subtask', () => {
    const result = compositeTaskGrader.grade(
      {
        subtasks: {
          q1: { selectedOption: 'A' }, // wrong
          q2: { answer: true }, // correct
        },
      },
      {
        subtasks: {
          q1: { weight: 0.6, graderId: 'single_choice', answerKey: { correctOption: 'B' } },
          q2: { weight: 0.4, graderId: 'true_false', answerKey: { correctAnswer: true } },
        },
      },
    );
    expect(result.correct).toBe(false);
    expect(result.score).toBeCloseTo(0.4);
  });
});

describe('gradeByType router', () => {
  it('routes to correct grader', () => {
    const result = gradeByType('single_choice', { selectedOption: 'C' }, { correctOption: 'C' });
    expect(result.correct).toBe(true);
  });

  it('unknown grader returns error', () => {
    const result = gradeByType('nonexistent', {}, {});
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.feedback).toContain('未知');
  });
});

describe('getRegisteredGraderIds', () => {
  it('returns all 12 graders', () => {
    const ids = getRegisteredGraderIds();
    expect(ids).toHaveLength(12);
    expect(ids).toContain('single_choice');
    expect(ids).toContain('true_false');
    expect(ids).toContain('composite_task');
  });
});
