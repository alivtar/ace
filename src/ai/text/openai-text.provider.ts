import OpenAI from 'openai';
import type {
  TextGenerationInput,
  TextGenerationProvider,
  TextGenerationResult,
} from './types';

export type OpenAITextProviderOptions = {
  apiKey?: string;
  model?: string;
};

export class OpenAITextProvider implements TextGenerationProvider {
  private client: OpenAI | null = null;
  private readonly options: OpenAITextProviderOptions;

  constructor(options: OpenAITextProviderOptions) {
    this.options = options;
  }

  private getClient(): OpenAI {
    if (!this.options.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    if (!this.client) {
      this.client = new OpenAI({ apiKey: this.options.apiKey });
    }
    return this.client;
  }

  async generate(input: TextGenerationInput): Promise<TextGenerationResult> {
    if (!this.options.model) {
      throw new Error('OPENAI_TEXT_MODEL is not configured');
    }

    const response = await this.getClient().responses.create({
      model: this.options.model,
      instructions: input.instructions,
      input: input.input,
      max_output_tokens: input.maxOutputTokens,
    });

    return { text: response.output_text, model: response.model };
  }
}
