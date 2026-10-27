import config from '../configs/env';
import { JevProvider } from './judgement/jev.provider';
import type { JudgementProvider } from './judgement/types';
import { OpenAITextProvider } from './text/openai-text.provider';
import type { TextGenerationProvider } from './text/types';
import { OpenAITranscribeProvider } from './speech/openai-transcribe.provider';
import type { SpeechToTextProvider } from './speech/types';

// Single place that decides which vendor backs each capability.
// Swap a vendor here (and in env) without touching business logic.

export const judgement: JudgementProvider = new JevProvider({
  apiKey: config.JEV_API_KEY ?? '',
  baseUrl: config.JEV_BASE_URL,
  model: config.JEV_MODEL,
  timeoutMs: config.JEV_TIMEOUT_MS,
});

export const textGeneration: TextGenerationProvider = new OpenAITextProvider({
  apiKey: config.OPENAI_API_KEY,
  model: config.OPENAI_TEXT_MODEL,
});

export const speechToText: SpeechToTextProvider = new OpenAITranscribeProvider({
  apiKey: config.OPENAI_API_KEY,
  model: config.OPENAI_STT_MODEL,
});
