/** Where the feedback came from. OTHER takes a free-text description (`sourceDetail`). */
export const FEEDBACK_SOURCES = [
  'EMAIL',
  'PHONE',
  'WHATSAPP',
  'MEETING',
  'SOCIAL_MEDIA',
  'WEBSITE',
  'SURVEY',
  'OTHER',
] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const FEEDBACK_CATEGORIES = [
  'COMPLIMENT',
  'COMPLAINT',
  'SUGGESTION',
  'QUESTION',
  'OTHER',
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** NEW → IN_PROGRESS → RESOLVED; a resolved item can be reopened. */
export const FEEDBACK_STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

const TRANSITIONS: Record<FeedbackStatus, FeedbackStatus[]> = {
  NEW: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['IN_PROGRESS'],
};

export function nextFeedbackStatuses(status: string): FeedbackStatus[] {
  return TRANSITIONS[status as FeedbackStatus] ?? [];
}

export function canChangeFeedbackStatus(from: string, to: string): boolean {
  return nextFeedbackStatuses(from).includes(to as FeedbackStatus);
}
