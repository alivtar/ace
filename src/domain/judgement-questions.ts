import type { JudgementQuestion } from '../ai/judgement/types';
import type { IntentDefinition } from './intents';

// Builds the Jev questions for one customer message.
// Every question is sent in one request. Jev answers them all in parallel.

export const INTENT_QUESTION_ID = 'intent';
export const SENTIMENT_QUESTION_ID = 'sentiment';
export const NEEDS_HUMAN_QUESTION_ID = 'needs_human';
export const MULTI_REQUEST_QUESTION_ID = 'multi_request';

export const buildIntentQuestions = (
  intents: readonly IntentDefinition[],
): Record<string, JudgementQuestion> => {
  const criteria = Object.fromEntries(
    intents.map((intent) => [intent.id, intent.description]),
  );

  return {
    [INTENT_QUESTION_ID]: {
      type: 'choice',
      instructions:
        'This is a direct message from a customer to an online shop on Instagram. ' +
        'The message may be Persian, Finglish (Persian written in Latin letters), or English. ' +
        'Choose the single intent that best describes the customer\'s main request in `latest_message`. ' +
        'Use `conversation` only for context, such as follow-up questions. ' +
        'Use "unknown" when nothing fits.',
      criteria,
    },
    [SENTIMENT_QUESTION_ID]: {
      type: 'score',
      instructions: 'How frustrated or angry does the customer sound in `latest_message`?',
      criteria: ['calm', 'annoyed', 'angry'],
    },
    [NEEDS_HUMAN_QUESTION_ID]: {
      type: 'noul',
      instructions:
        'Does `latest_message` explicitly ask for a person, or describe a situation that an ' +
        'automated shop assistant must not handle alone (complaints, refunds, legal or money disputes)?',
      criteria: { true: 'needs a person', false: 'an automated answer is fine' },
    },
    [MULTI_REQUEST_QUESTION_ID]: {
      type: 'noul',
      instructions: 'Does `latest_message` contain two or more separate requests or questions?',
      criteria: { true: 'several requests', false: 'one request' },
    },
  };
};

/** Asks Jev which retrieved product the customer means. "none" is always an option. */
export const buildProductMatchQuestion = (
  candidates: Array<{ key: string; description: string }>,
): JudgementQuestion => ({
  type: 'choice',
  instructions:
    'A customer of an online shop asked about a product in `latest_message`. Which candidate product ' +
    'does the customer mean? Choose "none" if none of them clearly matches.',
  criteria: {
    ...Object.fromEntries(candidates.map((candidate) => [candidate.key, candidate.description])),
    none: 'none of these products clearly matches',
  },
});
