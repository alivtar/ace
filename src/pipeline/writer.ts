import type { TextGenerationProvider } from '../ai/text/types';
import type { MessageStyle } from '../utils/persian';

export const WRITER_MAX_OUTPUT_TOKENS = 400;

export type WriterInput = {
  writer: TextGenerationProvider;
  businessName: string;
  rules: readonly string[];
  customerMessage: string;
  style: MessageStyle;
  facts: Record<string, unknown>;
  /** Validation problems from the previous attempt, so the writer can fix them. */
  previousProblems?: string[];
};

/**
 * Asks the writer model for one reply. The model sees only the rules and the facts,
 * never the database, so it cannot look up anything the facts don't include.
 */
export const writeReply = async (input: WriterInput): Promise<string> => {
  const instructions = [
    `You write the Instagram direct-message replies of the online shop "${input.businessName}".`,
    'Output only the reply text. No preamble, no labels, no markdown.',
    ...input.rules.map((rule) => `- ${rule}`),
  ].join('\n');

  const payload = {
    customer_message: input.customerMessage,
    customer_style: input.style,
    facts: input.facts,
    previous_attempt_problems: input.previousProblems ?? [],
  };

  const result = await input.writer.generate({
    instructions,
    input: JSON.stringify(payload),
    maxOutputTokens: WRITER_MAX_OUTPUT_TOKENS,
  });
  return result.text.trim();
};
