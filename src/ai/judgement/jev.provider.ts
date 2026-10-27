import type {
  ChoiceAnswer,
  JudgementAnswer,
  JudgementProvider,
  JudgementQuestion,
  JudgementResult,
  JudgementState,
  NoulAnswer,
  ScoreAnswer,
} from './types';
import { JudgementUnavailableError } from './types';

export type JevProviderOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

const PROBABILITY_SUM_TOLERANCE = 0.02; // API values are rounded

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isProbability = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const invalid = (questionId: string, reason: string): never => {
  throw new JudgementUnavailableError(
    `Malformed Jev answer for question "${questionId}": ${reason}`,
  );
};

const parseProbabilities = (
  questionId: string,
  raw: unknown,
  keys: string[],
): Record<string, number> => {
  if (!isRecord(raw)) invalid(questionId, 'probabilities missing');
  const probabilities = raw as Record<string, unknown>;

  let total = 0;
  for (const key of keys) {
    const value = probabilities[key];
    if (!isProbability(value)) invalid(questionId, `probability for "${key}" invalid`);
    total += value as number;
  }
  if (Math.abs(total - 1) > PROBABILITY_SUM_TOLERANCE) {
    invalid(questionId, `probabilities sum to ${total.toFixed(3)}`);
  }
  return Object.fromEntries(keys.map((key) => [key, probabilities[key] as number]));
};

/**
 * Validates one answer against the question that produced it.
 * Exported for unit tests. The network value is untrusted until it passes here.
 */
export const parseAnswer = (
  questionId: string,
  question: JudgementQuestion,
  raw: unknown,
): JudgementAnswer => {
  if (!isRecord(raw)) invalid(questionId, 'answer is not an object');
  const answer = raw as Record<string, unknown>;

  if (answer.type !== question.type) {
    invalid(questionId, `expected type "${question.type}", got "${String(answer.type)}"`);
  }

  switch (question.type) {
    case 'choice': {
      const options = Object.keys(question.criteria);
      if (typeof answer.choice !== 'string' || !options.includes(answer.choice)) {
        invalid(questionId, 'choice is not one of the offered options');
      }
      if (!isProbability(answer.confidence)) invalid(questionId, 'confidence invalid');
      const parsed: ChoiceAnswer = {
        type: 'choice',
        choice: answer.choice as string,
        probabilities: parseProbabilities(questionId, answer.probabilities, options),
        confidence: answer.confidence as number,
      };
      return parsed;
    }

    case 'score': {
      const levels = question.criteria.map((_, index) => String(index));
      if (typeof answer.score !== 'number' || !Number.isFinite(answer.score)) {
        invalid(questionId, 'score invalid');
      }
      if (!isProbability(answer.confidence)) invalid(questionId, 'confidence invalid');
      if (!isRecord(answer.legend)) invalid(questionId, 'legend missing');
      const parsed: ScoreAnswer = {
        type: 'score',
        score: answer.score as number,
        probabilities: parseProbabilities(questionId, answer.probabilities, levels),
        legend: answer.legend as Record<string, string>,
        confidence: answer.confidence as number,
      };
      return parsed;
    }

    case 'noul': {
      if (!isProbability(answer.noul)) invalid(questionId, 'noul must be a probability');
      const parsed: NoulAnswer = { type: 'noul', noul: answer.noul as number };
      return parsed;
    }
  }
};

/** Validates a full Jev response against the questions that were sent. */
export const parseJevResponse = (
  raw: unknown,
  questions: Record<string, JudgementQuestion>,
): JudgementResult => {
  if (!isRecord(raw) || !isRecord(raw.answers)) {
    throw new JudgementUnavailableError('Jev response has no answers object');
  }
  const rawAnswers = raw.answers as Record<string, unknown>;

  const answers: Record<string, JudgementAnswer> = {};
  for (const [questionId, question] of Object.entries(questions)) {
    if (!(questionId in rawAnswers)) {
      throw new JudgementUnavailableError(`Jev response missing answer "${questionId}"`);
    }
    answers[questionId] = parseAnswer(questionId, question, rawAnswers[questionId]);
  }

  const usage = isRecord(raw.usage)
    ? {
        inputTokens: Number(raw.usage.input_tokens) || 0,
        outputTokens: Number(raw.usage.output_tokens) || 0,
      }
    : undefined;

  return {
    model: typeof raw.model === 'string' ? raw.model : 'unknown',
    answers,
    usage,
  };
};

export class JevProvider implements JudgementProvider {
  private readonly options: JevProviderOptions;

  constructor(options: JevProviderOptions) {
    this.options = options;
  }

  async judge(input: {
    state: JudgementState;
    questions: Record<string, JudgementQuestion>;
  }): Promise<JudgementResult> {
    const { apiKey, baseUrl, model, timeoutMs } = this.options;
    const fetchImpl = this.options.fetchImpl ?? fetch;

    if (!apiKey) {
      throw new JudgementUnavailableError('JEV_API_KEY is not configured');
    }

    let response: Response;
    try {
      response = await fetchImpl(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, state: input.state, questions: input.questions }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new JudgementUnavailableError('Jev request failed or timed out', { cause: error });
    }

    if (!response.ok) {
      throw new JudgementUnavailableError(`Jev responded with HTTP ${response.status}`);
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch (error) {
      throw new JudgementUnavailableError('Jev returned non-JSON body', { cause: error });
    }

    return parseJevResponse(raw, input.questions);
  }
}
