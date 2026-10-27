import type { ChoiceAnswer } from '../ai/judgement/types';
import type { IntentDefinition, HandlerName } from '../domain/intents';
import type { PipelineStore, Business } from '../pipeline/store';

// Each business type plugs in here: its intents, how it fetches facts for each handler,
// and the rules the writer must follow. The pipeline itself knows none of this.

export type RetrievalContext = {
  business: Business;
  conversationState: Record<string, unknown>;
  latestMessage: string;
  store: PipelineStore;
  now: Date;
  /** Asks Jev which candidate the customer means. Keys are short ids chosen by the caller. */
  judgeProduct: (candidates: Array<{ key: string; description: string }>) => Promise<ChoiceAnswer>;
};

export type RetrievalResult = {
  /** Only facts from the database. The writer may quote these and nothing else. */
  facts: Record<string, unknown>;
  /** False when a needed fact is missing. The pipeline then hands off instead of guessing. */
  complete: boolean;
  missing: string[];
  /** Replaces the conversation's working state when present (e.g. order verification progress). */
  nextConversationState?: Record<string, unknown>;
  /** Set when retrieval itself decides a handoff is needed (e.g. verification attempts used up). */
  handoffReason?: string;
};

export interface BusinessTypeModule {
  readonly id: BusinessType;
  readonly intents: readonly IntentDefinition[];
  readonly writerRules: readonly string[];
  retrieve(handlers: readonly HandlerName[], ctx: RetrievalContext): Promise<RetrievalResult>;
}

export type BusinessType = 'online_shop';
