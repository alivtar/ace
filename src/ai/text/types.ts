// Provider-agnostic text generation contract.
// Used for writing Persian/Finglish replies and extracting product drafts.
// Jev cannot do this: it returns typed decisions, not prose.

export type TextGenerationInput = {
  instructions: string;
  input: string;
  maxOutputTokens?: number;
};

export type TextGenerationResult = {
  text: string;
  model: string;
};

export interface TextGenerationProvider {
  generate(input: TextGenerationInput): Promise<TextGenerationResult>;
}
