// Monthly limits per plan. Values are placeholders until pricing is decided;
// change them here only, not in the pipeline.
export type PlanId = 'basic' | 'medium' | 'premium';

export const PLAN_LIMITS: Record<PlanId, { aiReplies: number; transcriptions: number }> = {
  basic: { aiReplies: 300, transcriptions: 50 },
  medium: { aiReplies: 1500, transcriptions: 300 },
  premium: { aiReplies: 6000, transcriptions: 1500 },
};

/** Usage periods are calendar months in Iran time, the business's local time. */
export const usagePeriod = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit' })
    .format(date)
    .slice(0, 7);
