import type { QuestionStatus } from '@/lib/constants';

export type ReviewAction = 'approve' | 'reject' | 'publish' | 'retire';

const ALLOWED_TRANSITIONS: Record<ReviewAction, readonly QuestionStatus[]> = {
  approve: ['draft', 'imported_unreviewed', 'needs_revision'],
  reject: ['draft', 'imported_unreviewed', 'reviewed'],
  publish: ['reviewed'],
  retire: ['published'],
};

const ACTION_STATUS: Record<ReviewAction, QuestionStatus> = {
  approve: 'reviewed',
  reject: 'needs_revision',
  publish: 'published',
  retire: 'retired',
};

export function reviewTransition(
  current: string,
  action: ReviewAction,
): QuestionStatus | null {
  return ALLOWED_TRANSITIONS[action].includes(current as QuestionStatus)
    ? ACTION_STATUS[action]
    : null;
}

export function statusAfterContentEdit(current: string): QuestionStatus | null {
  if (current === 'retired') return null;
  if (current === 'reviewed' || current === 'published') return 'needs_revision';
  return current as QuestionStatus;
}

export function allowedStatusesFor(action: ReviewAction): readonly QuestionStatus[] {
  return ALLOWED_TRANSITIONS[action];
}

export function reviewTargetStatus(action: ReviewAction): QuestionStatus {
  return ACTION_STATUS[action];
}
