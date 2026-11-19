import { describe, expect, it } from 'vitest';
import { canChangeFeedbackStatus, nextFeedbackStatuses } from './feedback-rules';

describe('feedback status rules', () => {
  it('moves new → in progress → resolved, and lets resolved feedback be reopened', () => {
    expect(nextFeedbackStatuses('NEW')).toEqual(['IN_PROGRESS', 'RESOLVED']);
    expect(nextFeedbackStatuses('IN_PROGRESS')).toEqual(['RESOLVED']);
    expect(nextFeedbackStatuses('RESOLVED')).toEqual(['IN_PROGRESS']);
    expect(canChangeFeedbackStatus('RESOLVED', 'NEW')).toBe(false);
    expect(canChangeFeedbackStatus('IN_PROGRESS', 'IN_PROGRESS')).toBe(false);
    expect(nextFeedbackStatuses('CLOSED')).toEqual([]);
  });
});
