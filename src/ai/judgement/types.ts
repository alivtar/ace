// Provider-agnostic judgement contract.
// Jev (TypeSafe) is the first implementation. It returns typed decisions with
// probabilities, never prose. Keep this file free of any vendor specifics.

export type ChoiceQuestion = {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
};

export type ScoreQuestion = {
  type: 'score';
  instructions: string;
  criteria: string[]; // ordered low -> high
};

export type NoulQuestion = {
  type: 'noul';
  instructions: string;
  criteria?: { true: string; false: string };
};

export type JudgementQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export type JudgementState = string | string[] | Record<string, unknown>;

export type ChoiceAnswer = {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type ScoreAnswer = {
  type: 'score';
  score: number;
  probabilities: Record<string, number>;
  legend: Record<string, string>;
  confidence: number;
};

export type NoulAnswer = {
  type: 'noul';
  /** Probability that the answer is "yes". This is not a confidence value. */
  noul: number;
};

export type JudgementAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export type JudgementResult = {
  model: string;
  answers: Record<string, JudgementAnswer>;
  usage?: { inputTokens: number; outputTokens: number };
};

export interface JudgementProvider {
  judge(input: {
    state: JudgementState;
    questions: Record<string, JudgementQuestion>;
  }): Promise<JudgementResult>;
}

/**
 * Thrown when the judgement engine could not give an answer (timeout, HTTP
 * error, malformed response). Callers must treat this as "unavailable" and
 * route to review, never as a negative judgement.
 */
export class JudgementUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'JudgementUnavailableError';
  }
}
