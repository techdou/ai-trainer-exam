import { describe, expect, it } from 'vitest';
import { reviewTransition, statusAfterContentEdit } from './content-workflow';

describe('内容审核状态机', () => {
  it('未经审核的内容不能直接发布', () => {
    expect(reviewTransition('draft', 'publish')).toBeNull();
    expect(reviewTransition('imported_unreviewed', 'publish')).toBeNull();
  });

  it('审核后才能发布，已发布内容才能退役', () => {
    expect(reviewTransition('draft', 'approve')).toBe('reviewed');
    expect(reviewTransition('reviewed', 'publish')).toBe('published');
    expect(reviewTransition('published', 'retire')).toBe('retired');
  });

  it('编辑已审核或已发布内容会重新进入待审核', () => {
    expect(statusAfterContentEdit('reviewed')).toBe('needs_revision');
    expect(statusAfterContentEdit('published')).toBe('needs_revision');
    expect(statusAfterContentEdit('retired')).toBeNull();
  });
});
