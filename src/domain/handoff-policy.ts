import type { IntentDefinition } from './intents';

// Turns judgement output into a route. Pure function: easy to test and to tune.
// Thresholds are starting points. Tune them against the labelled DM set, not by feel.

export const HANDOFF_THRESHOLDS = {
  /** Top intent probability below this means the bot doesn't understand well enough. */
  minIntentProbability: 0.6,
  /** P(needs a person) at or above this hands off. */
  needsHumanNoul: 0.7,
  /** P(angry) at or above this hands off, even on an answerable intent. */
  angryProbability: 0.5,
  /** Secondary intents must reach this probability to be answered too. */
  secondaryIntentProbability: 0.2,
} as const;

export type RouteDecision =
  | { action: 'answer'; intents: IntentDefinition[] }
  | { action: 'handoff'; reason: string }
  | { action: 'ignore'; reason: string };

export type JudgementSummary = {
  intentProbabilities: Record<string, number>;
  topIntent: string;
  needsHumanProbability: number;
  angryProbability: number;
  multiRequestProbability: number;
};

export const decideRoute = (
  summary: JudgementSummary,
  intents: readonly IntentDefinition[],
): RouteDecision => {
  const top = intents.find((intent) => intent.id === summary.topIntent);
  if (!top) return { action: 'handoff', reason: 'unknown_intent_id' };

  if (top.route === 'ignore') return { action: 'ignore', reason: top.id };
  if (top.route === 'handoff') return { action: 'handoff', reason: top.id };

  if (summary.needsHumanProbability >= HANDOFF_THRESHOLDS.needsHumanNoul) {
    return { action: 'handoff', reason: 'customer_needs_human' };
  }
  if (summary.angryProbability >= HANDOFF_THRESHOLDS.angryProbability) {
    return { action: 'handoff', reason: 'customer_angry' };
  }

  const topProbability = summary.intentProbabilities[top.id] ?? 0;
  if (topProbability < HANDOFF_THRESHOLDS.minIntentProbability) {
    return { action: 'handoff', reason: 'low_intent_confidence' };
  }

  // Answer the top intent. If the message holds several requests, answer up to two intents
  // that clear the secondary threshold.
  const answered: IntentDefinition[] = [top];
  if (summary.multiRequestProbability >= 0.5) {
    const secondary = intents
      .filter((intent) => intent.route === 'answer' && intent.id !== top.id)
      .map((intent) => ({ intent, p: summary.intentProbabilities[intent.id] ?? 0 }))
      .filter(({ p }) => p >= HANDOFF_THRESHOLDS.secondaryIntentProbability)
      .sort((a, b) => b.p - a.p)[0];
    if (secondary) answered.push(secondary.intent);
  }

  return { action: 'answer', intents: answered };
};
