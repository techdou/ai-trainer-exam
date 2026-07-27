import { describe, expect, it } from 'vitest';
import { isScheduleStartableStatus } from './exam-status';

describe('考试状态入场守卫', () => {
  it('只允许尚未关闭的已发布考试创建新作答', () => {
    for (const status of ['published', 'waiting', 'practice_locked', 'exam_open']) {
      expect(isScheduleStartableStatus(status)).toBe(true);
    }
    for (const status of ['draft', 'exam_closed', 'grading', 'results_pending', 'results_released', 'archived']) {
      expect(isScheduleStartableStatus(status)).toBe(false);
    }
  });
});
