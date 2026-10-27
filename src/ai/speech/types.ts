// Provider-agnostic speech-to-text contract for voice notes.
// Jev does not accept audio, so transcription always happens before judgement.

export type TranscriptionInput = {
  audio: Buffer;
  filename: string;
  mimeType: string;
  /** BCP-47-ish language hint, e.g. "fa". */
  languageHint?: string;
};

export type TranscriptionResult = {
  text: string;
  model: string;
};

export interface SpeechToTextProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}
