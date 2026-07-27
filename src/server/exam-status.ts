const STARTABLE_EXAM_STATUSES = new Set([
  'published',
  'waiting',
  'practice_locked',
  'exam_open',
]);

export function isScheduleStartableStatus(status: string): boolean {
  return STARTABLE_EXAM_STATUSES.has(status);
}
