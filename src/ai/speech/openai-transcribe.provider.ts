import OpenAI, { toFile } from 'openai';
import type {
  SpeechToTextProvider,
  TranscriptionInput,
  TranscriptionResult,
} from './types';

// Without a prompt, gpt-4o-transcribe can return romanised or invented Latin text
// for Persian audio. A verbatim-transcription prompt is the mitigation. Tune this
// against the real voice-note benchmark before launch.
export const PERSIAN_TRANSCRIPTION_PROMPT =
  'این یک پیام صوتی فارسی است. دقیقاً همان چیزی که گفته شده را با خط فارسی بنویس. ' +
  'اگر کلمه‌ای انگلیسی گفته شد، با حروف لاتین بنویس. اسم محصول، رنگ و سایز را دقیق بنویس.';

export type OpenAITranscribeProviderOptions = {
  apiKey?: string;
  model: string;
};

export class OpenAITranscribeProvider implements SpeechToTextProvider {
  private client: OpenAI | null = null;
  private readonly options: OpenAITranscribeProviderOptions;

  constructor(options: OpenAITranscribeProviderOptions) {
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

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    const file = await toFile(input.audio, input.filename, { type: input.mimeType });

    const result = await this.getClient().audio.transcriptions.create({
      file,
      model: this.options.model,
      language: input.languageHint,
      prompt: PERSIAN_TRANSCRIPTION_PROMPT,
    });

    return { text: result.text, model: this.options.model };
  }
}
