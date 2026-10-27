import { randomUUID } from 'node:crypto';
import type {
  ChoiceAnswer,
  JudgementAnswer,
  JudgementProvider,
  JudgementQuestion,
  JudgementResult,
  JudgementState,
  NoulAnswer,
  ScoreAnswer,
} from '../ai/judgement/types';
import type { SpeechToTextProvider, TranscriptionInput } from '../ai/speech/types';
import type { TextGenerationInput, TextGenerationProvider } from '../ai/text/types';
import type { MediaFile, MessagingChannel, SendTarget } from '../pipeline/channel';

export type JudgementScript = {
  intent?: string;
  angry?: boolean;
  needsHuman?: number;
  multiRequest?: number;
  /** Product key to pick in product-match questions, chosen by the test from the offered criteria. */
  pickProduct?: (criteria: Record<string, string>) => string;
};

/** Returns answers in the exact shapes Jev sends (see docs.typesafe.ai/api/system-one). */
export class FakeJudgement implements JudgementProvider {
  readonly calls: Array<{ state: JudgementState; questions: Record<string, JudgementQuestion> }> = [];
  failWith: Error | null = null;

  constructor(private script: JudgementScript = {}) {}

  set(script: JudgementScript) {
    this.script = { ...this.script, ...script };
  }

  async judge(input: { state: JudgementState; questions: Record<string, JudgementQuestion> }): Promise<JudgementResult> {
    this.calls.push(input);
    if (this.failWith) throw this.failWith;

    const answers: Record<string, JudgementAnswer> = {};
    for (const [id, question] of Object.entries(input.questions)) {
      answers[id] = this.answer(id, question);
    }
    return { model: 'jev-test', answers, usage: { inputTokens: 1, outputTokens: 1 } };
  }

  private answer(id: string, question: JudgementQuestion): JudgementAnswer {
    if (question.type === 'choice') {
      const keys = Object.keys(question.criteria);
      const picked = id === 'product'
        ? (this.script.pickProduct ?? (() => 'none'))(question.criteria)
        : (this.script.intent ?? 'faq_other');
      const probability = 0.9;
      const others = keys.length > 1 ? (1 - probability) / (keys.length - 1) : 0;
      const probabilities = Object.fromEntries(keys.map((key) => [key, key === picked ? probability : others]));
      const choice: ChoiceAnswer = { type: 'choice', choice: picked, probabilities, confidence: 0.9 };
      return choice;
    }
    if (question.type === 'score') {
      const levels = question.criteria.map((_, index) => String(index));
      const hot = this.script.angry ? levels[levels.length - 1] : '0';
      const probabilities = Object.fromEntries(levels.map((level) => [level, level === hot ? 1 : 0]));
      const score: ScoreAnswer = {
        type: 'score',
        score: Number(hot),
        probabilities,
        legend: Object.fromEntries(question.criteria.map((text, index) => [String(index), text])),
        confidence: 0.9,
      };
      return score;
    }
    const noul: NoulAnswer = {
      type: 'noul',
      noul: id === 'needs_human' ? (this.script.needsHuman ?? 0.05) : (this.script.multiRequest ?? 0.05),
    };
    return noul;
  }
}

export class FakeWriter implements TextGenerationProvider {
  readonly calls: TextGenerationInput[] = [];
  private queue: string[] = [];
  fallback = 'بله، موجود است.';

  queueReplies(...replies: string[]) {
    this.queue.push(...replies);
  }

  async generate(input: TextGenerationInput) {
    this.calls.push(input);
    const text = this.queue.shift() ?? this.fallback;
    return { text, model: 'writer-test' };
  }

  /** The facts JSON the writer received on its last call. */
  lastFacts(): Record<string, unknown> {
    const last = this.calls[this.calls.length - 1];
    return (JSON.parse(last.input) as { facts: Record<string, unknown> }).facts;
  }
}

export class FakeSpeech implements SpeechToTextProvider {
  readonly calls: TranscriptionInput[] = [];
  constructor(private text: string) {}
  async transcribe(input: TranscriptionInput) {
    this.calls.push(input);
    return { text: this.text, model: 'gpt-4o-transcribe-test' };
  }
}

export class WindowClosedError extends Error {
  readonly windowClosed = true;
}

export class RejectedError extends Error {
  readonly rejected = true;
}

export class FakeChannel implements MessagingChannel {
  readonly platform = 'instagram';
  readonly sent: Array<{ target: SendTarget; text: string; messageId: string }> = [];
  readonly downloads: string[] = [];
  sendAttempts = 0;
  windowClosedOnSend = false;
  /** Set to make the next send fail. A timeout (not a rejection) means the outcome is unknown. */
  failNextSendWith: Error | null = null;
  media: MediaFile = { buffer: Buffer.from('fake-audio'), mimeType: 'audio/mp4' };

  async sendText(target: SendTarget, text: string) {
    this.sendAttempts += 1;
    if (this.failNextSendWith) {
      const error = this.failNextSendWith;
      this.failNextSendWith = null;
      throw error;
    }
    if (this.windowClosedOnSend) throw new WindowClosedError('This message is sent outside of allowed window.');
    // Platform message ids are unique, so the fake uses random ones like Meta does.
    const messageId = `mid.out.${randomUUID()}`;
    this.sent.push({ target, text, messageId });
    return { messageId };
  }

  async downloadMedia(url: string): Promise<MediaFile> {
    this.downloads.push(url);
    return this.media;
  }

  isWindowClosedError(error: unknown): boolean {
    return error instanceof WindowClosedError;
  }

  isRejectedBeforeSend(error: unknown): boolean {
    return error instanceof RejectedError;
  }
}
