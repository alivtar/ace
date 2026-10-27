import { JudgementUnavailableError, type JudgementAnswer, type JudgementProvider, type ChoiceAnswer, type ScoreAnswer } from '../ai/judgement/types';
import type { SpeechToTextProvider } from '../ai/speech/types';
import type { TextGenerationProvider } from '../ai/text/types';
import { getBusinessTypeModule } from '../business-types';
import type { BusinessTypeModule } from '../business-types/types';
import type { InstagramEvent } from '../integrations/instagram/webhook';
import { decideRoute, type JudgementSummary, type RouteDecision } from '../domain/handoff-policy';
import { PLAN_LIMITS, usagePeriod } from '../domain/plans';
import {
  buildIntentQuestions,
  buildProductMatchQuestion,
  INTENT_QUESTION_ID,
  MULTI_REQUEST_QUESTION_ID,
  NEEDS_HUMAN_QUESTION_ID,
  SENTIMENT_QUESTION_ID,
} from '../domain/judgement-questions';
import type { HandlerName } from '../domain/intents';
import { validateReply } from '../domain/reply-validator';
import { detectMessageStyle } from '../utils/persian';
import type { ConversationLock, LockLease } from './lock';
import type { MessagingChannel } from './channel';
import { LockBusyError, TransientError } from './errors';
import type { ActiveConnection, Conversation, PipelineStore } from './store';
import { writeReply } from './writer';

export const WINDOW_MS = 24 * 60 * 60 * 1000; // standard messaging window (Meta can extend it for some entry points)
const LOCK_TTL_MS = 90_000;
const HISTORY_LIMIT = 6;
const MAX_WRITER_ATTEMPTS = 2;
const ANGRY_LEVEL = '2'; // index of "angry" in the sentiment criteria
export const HANDOFF_NOTICE =
  'ممنون از پیامتون. یکی از همکارهای ما به‌زودی جواب شما را می‌دهد.';

export type ProcessAttempt = { attempt: number; maxAttempts: number };

export type ProcessOutcome =
  | { outcome: 'replied' }
  | { outcome: 'handoff'; reason: string }
  | { outcome: 'gated'; reason: string }
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'duplicate' }
  | { outcome: 'human_takeover' }
  | { outcome: 'no_tenant' };

export type PipelineDeps = {
  store: PipelineStore;
  lock: ConversationLock;
  channel: MessagingChannel;
  judgement: JudgementProvider;
  writer: TextGenerationProvider;
  stt: SpeechToTextProvider;
  decryptToken: (encrypted: string) => string;
  now: () => Date;
  log?: (message: string, details?: Record<string, unknown>) => void;
};

type Run = {
  event: InstagramEvent;
  attempt: ProcessAttempt;
  deps: PipelineDeps;
  connection: ActiveConnection;
  conversation: Conversation;
};

type SendStatus = 'sent' | 'already_sent' | 'window_closed' | 'unknown';

const noop = () => undefined;

/**
 * Handles one Instagram event end to end. Every path ends in exactly one outcome.
 * Errors that may succeed on retry are rethrown until the last attempt; on the last attempt
 * the conversation goes to a person instead of failing silently.
 */
export const processInboundEvent = async (
  event: InstagramEvent,
  attempt: ProcessAttempt,
  deps: PipelineDeps,
): Promise<ProcessOutcome> => {
  if (event.kind === 'ignored' || event.kind === 'deleted') {
    return { outcome: 'ignored', reason: event.kind };
  }

  const connection = await deps.store.findActiveConnection('instagram', event.accountId);
  if (!connection) {
    (deps.log ?? noop)('no active connection for account', { accountId: event.accountId });
    return { outcome: 'no_tenant' };
  }

  const lockKey = `${connection.business.id}:${event.customerId}`;
  const lease: LockLease | null = await deps.lock.acquire(lockKey, LOCK_TTL_MS);
  if (!lease) throw new LockBusyError(lockKey);

  try {
    const conversation = await deps.store.getOrCreateConversation(connection.business.id, 'instagram', event.customerId);
    const run: Run = { event, attempt, deps, connection, conversation };
    return event.kind === 'echo' ? await handleEcho(run) : await handleCustomerMessage(run);
  } catch (error) {
    if (attempt.attempt < attempt.maxAttempts) throw error;
    (deps.log ?? noop)('giving up after last attempt', { messageId: event.messageId, error: String(error) });
    return await giveUp(event, connection, deps);
  } finally {
    await deps.lock.release(lease);
  }
};

/** Last-resort path: stop automating this conversation and tell a person. */
const giveUp = async (event: InstagramEvent, connection: ActiveConnection, deps: PipelineDeps): Promise<ProcessOutcome> => {
  const conversation = await deps.store.getOrCreateConversation(connection.business.id, 'instagram', event.customerId);
  if (event.kind === 'echo') {
    await deps.store.setMode(conversation.id, 'human');
    return { outcome: 'human_takeover' };
  }
  await deps.store.openHandoffTask(connection.business.id, conversation.id, 'system_error');
  await deps.store.setMode(conversation.id, 'human');
  return { outcome: 'handoff', reason: 'system_error' };
};

/**
 * An echo is a message our page sent. Ours are already recorded (the platform id is saved
 * right after the send). An echo we cannot place means a person replied from the Instagram app.
 */
const handleEcho = async (run: Run): Promise<ProcessOutcome> => {
  const { event, deps, connection, conversation, attempt } = run;
  const existing = await deps.store.findMessageByPlatformId(connection.business.id, event.messageId);
  if (existing) return { outcome: 'duplicate' };

  if (attempt.attempt < attempt.maxAttempts) {
    throw new TransientError('echo arrived before our send was recorded');
  }

  await deps.store.insertMessage({
    businessId: connection.business.id,
    conversationId: conversation.id,
    direction: 'out',
    platformMessageId: event.messageId,
    text: event.text,
    handledBy: 'owner_app',
    meta: { source: 'instagram_app' },
  });
  await deps.store.setMode(conversation.id, 'human');
  return { outcome: 'human_takeover' };
};

const handleCustomerMessage = async (run: Run): Promise<ProcessOutcome> => {
  const { event, deps, connection, conversation } = run;
  const business = connection.business;
  const module = getBusinessTypeModule(business.businessType);
  const now = deps.now();
  const period = usagePeriod(now);

  const audio = event.attachments.find((attachment) => attachment.type === 'audio');
  const hasOtherMedia = event.attachments.some((attachment) => attachment.type !== 'audio');
  const contentType: 'text' | 'audio' | 'other' = event.text
    ? 'text'
    : audio
      ? 'audio'
      : event.attachments.length > 0
        ? 'other'
        : 'text';

  const inbound = await deps.store.insertInbound({
    businessId: business.id,
    conversationId: conversation.id,
    platformMessageId: event.messageId,
    contentType,
    text: event.text,
    createdAt: new Date(event.timestampMs),
  });
  if (inbound.alreadyProcessed) return { outcome: 'duplicate' };
  const messageId = inbound.id;

  await deps.store.touchInbound(conversation.id, new Date(event.timestampMs));

  const settle = async (outcome: ProcessOutcome): Promise<ProcessOutcome> => {
    const reason = 'reason' in outcome ? outcome.reason : undefined;
    await deps.store.markProcessed(messageId, outcome.outcome, reason);
    return outcome;
  };

  const handoff = async (reason: string, notify: boolean): Promise<ProcessOutcome> => {
    await deps.store.openHandoffTask(business.id, conversation.id, reason);
    await deps.store.setMode(conversation.id, 'human');
    if (notify) {
      await sendOnce(run, HANDOFF_NOTICE, 'handoff_notice', null).catch((error) =>
        (deps.log ?? noop)('handoff notice not sent', { error: String(error) }),
      );
    }
    return settle({ outcome: 'handoff', reason });
  };

  // Gates: nothing is sent when the bot is off, a person owns the chat, or the window is closed.
  if (!business.aiEnabled) return settle({ outcome: 'gated', reason: 'ai_disabled' });
  if (conversation.mode === 'human') return settle({ outcome: 'gated', reason: 'human_mode' });
  if (now.getTime() - event.timestampMs > WINDOW_MS) return handoff('window_expired', false);

  const plan = PLAN_LIMITS[business.plan];
  if ((await deps.store.getUsage(business.id, period, 'ai_reply')) >= plan.aiReplies) {
    await deps.store.openHandoffTask(business.id, conversation.id, 'quota_exceeded');
    return settle({ outcome: 'gated', reason: 'quota_exceeded' });
  }

  // Media: non-audio media always goes to a person. Voice notes are transcribed first (Jev has no audio input).
  if (hasOtherMedia) return handoff('media_message', true);

  let text = (event.text ?? '').trim();
  if (!text && audio) {
    if ((await deps.store.getUsage(business.id, period, 'transcription')) >= plan.transcriptions) {
      return handoff('transcription_quota', true);
    }
    if (!audio.url) return handoff('transcription_failed', true);
    const media = await deps.channel.downloadMedia(audio.url);
    const transcript = await deps.stt.transcribe({
      audio: media.buffer,
      filename: 'voice-note.mp4',
      mimeType: media.mimeType,
      languageHint: 'fa',
    });
    await deps.store.incrementUsage(business.id, period, 'transcription');
    text = transcript.text.trim();
    await deps.store.updateMessage(messageId, { transcript: text, contentType: 'audio' });
    if (!text) return handoff('transcription_failed', true);
  }
  if (!text) return handoff('unsupported_message', true);

  // Judgement: intent, sentiment, handoff signals, multi-request. One request, answered in parallel.
  const history = await deps.store.getRecentMessages(conversation.id, HISTORY_LIMIT, messageId);
  const judged = await deps.judgement.judge({
    state: {
      conversation: history.map((item) => ({
        from: item.direction === 'in' ? 'customer' : 'shop',
        text: item.transcript ?? item.text ?? '',
      })),
      latest_message: text,
    },
    questions: buildIntentQuestions(module.intents),
  });

  const summary = toSummary(judged.answers);
  const route: RouteDecision = decideRoute(summary, module.intents);
  await deps.store.updateMessage(messageId, {
    intent: summary.topIntent,
    meta: { judgement: { topIntent: summary.topIntent, route: route.action, reason: 'reason' in route ? route.reason : null } },
  });

  if (route.action === 'ignore') return settle({ outcome: 'ignored', reason: route.reason });
  if (route.action === 'handoff') return handoff(route.reason, true);

  return answer(run, {
    messageId,
    module,
    handlers: route.intents.map((intent) => intent.handler),
    intent: summary.topIntent,
    text,
    settle,
    handoff,
  });
};

/** Retrieval, writing, validation, and the send for a customer question the bot may answer. */
type AnswerInput = {
  messageId: string;
  module: BusinessTypeModule;
  handlers: HandlerName[];
  intent: string;
  text: string;
  settle: (outcome: ProcessOutcome) => Promise<ProcessOutcome>;
  handoff: (reason: string, notify: boolean) => Promise<ProcessOutcome>;
};

const answer = async (run: Run, input: AnswerInput): Promise<ProcessOutcome> => {
  const { deps, connection, conversation } = run;
  const business = connection.business;
  const { messageId, module, handlers, intent, text, settle, handoff } = input;

  const retrieval = await module.retrieve(handlers, {
    business,
    conversationState: conversation.state,
    latestMessage: text,
    store: deps.store,
    now: deps.now(),
    judgeProduct: async (candidates) => {
      const history = await deps.store.getRecentMessages(conversation.id, HISTORY_LIMIT, messageId);
      const result = await deps.judgement.judge({
        state: {
          conversation: history.map((item) => ({ from: item.direction === 'in' ? 'customer' : 'shop', text: item.text ?? '' })),
          latest_message: text,
        },
        questions: { product: buildProductMatchQuestion(candidates) },
      });
      const picked = result.answers.product;
      if (!picked || picked.type !== 'choice') {
        throw new JudgementUnavailableError('product match answer missing');
      }
      return picked;
    },
  });

  if (retrieval.nextConversationState !== undefined) {
    await deps.store.setConversationState(conversation.id, retrieval.nextConversationState);
    conversation.state = retrieval.nextConversationState;
  }
  if (retrieval.handoffReason) return input.handoff(retrieval.handoffReason, true);
  if (!retrieval.complete) return handoff('no_facts', true);

  // Writer, then validation against the same facts. Two attempts, then a person.
  let reply: string | null = null;
  let problems: string[] = [];
  for (let attempt = 0; attempt < MAX_WRITER_ATTEMPTS && reply === null; attempt++) {
    const candidate = await writeReply({
      writer: deps.writer,
      businessName: business.name,
      rules: module.writerRules,
      customerMessage: text,
      style: detectMessageStyle(text),
      facts: retrieval.facts,
      previousProblems: problems,
    });
    const validation = validateReply(candidate, retrieval.facts);
    if (validation.ok) reply = candidate;
    else problems = validation.problems;
  }
  if (reply === null) {
    (deps.log ?? noop)('reply failed validation', { messageId, problems });
    return handoff('validation_failed', true);
  }

  const sent = await sendOnce(run, reply, 'reply', intent);
  if (sent === 'window_closed') return handoff('window_expired', false);
  if (sent === 'unknown') return handoff('send_outcome_unknown', false);
  if (sent === 'sent') {
    await deps.store.incrementUsage(business.id, usagePeriod(deps.now()), 'ai_reply');
  }
  return settle({ outcome: 'replied' });
};

/**
 * Sends one bot message for one inbound message and purpose. Idempotent: if an earlier attempt
 * already sent it, nothing is sent again. If an earlier attempt was interrupted mid-send, the
 * outcome is unknown and the conversation goes to a person.
 */
const sendOnce = async (
  run: Run,
  text: string,
  kind: 'reply' | 'handoff_notice',
  intent: string | null,
): Promise<SendStatus> => {
  const { deps, connection, conversation, event } = run;
  const inboundMid = event.messageId;

  const previous = await deps.store.findOutboundForInbound(conversation.id, inboundMid, kind);
  if (previous?.status === 'sent') return 'already_sent';
  // 'sending' means an attempt was cut off mid-send; 'unknown' means it failed without a definitive answer.
  if (previous?.status === 'sending' || previous?.status === 'unknown') return 'unknown';

  const outboundId = await deps.store.insertMessage({
    businessId: connection.business.id,
    conversationId: conversation.id,
    direction: 'out',
    text,
    handledBy: 'bot',
    meta: { status: 'sending', inMid: inboundMid, kind, intent },
  });

  try {
    const result = await deps.channel.sendText(
      {
        externalAccountId: connection.externalAccountId,
        accessToken: deps.decryptToken(connection.accessTokenEncrypted),
        recipientId: conversation.platformUserId,
      },
      text,
    );
    await deps.store.updateMessage(outboundId, { platformMessageId: result.messageId, meta: { status: 'sent' } });
    return 'sent';
  } catch (error) {
    const detail = { error: error instanceof Error ? error.message : String(error) };
    if (deps.channel.isWindowClosedError(error)) {
      await deps.store.updateMessage(outboundId, { meta: { status: 'failed', ...detail } });
      return 'window_closed';
    }
    // Only a definitive rejection means "not sent" and is safe to retry. Anything else may have
    // been delivered, so the row stays unknown and a retry hands off instead of sending again.
    const status = deps.channel.isRejectedBeforeSend(error) ? 'failed' : 'unknown';
    await deps.store.updateMessage(outboundId, { meta: { status, ...detail } });
    throw error;
  }
};

/** Builds the judgement summary the handoff policy reads from Jev's answers. */
export const toSummary = (answers: Record<string, JudgementAnswer>): JudgementSummary => {
  const intent = answers[INTENT_QUESTION_ID];
  const sentiment = answers[SENTIMENT_QUESTION_ID];
  const needsHuman = answers[NEEDS_HUMAN_QUESTION_ID];
  const multi = answers[MULTI_REQUEST_QUESTION_ID];
  if (intent?.type !== 'choice' || sentiment?.type !== 'score' || needsHuman?.type !== 'noul' || multi?.type !== 'noul') {
    throw new JudgementUnavailableError('judgement answers are incomplete');
  }
  const choice: ChoiceAnswer = intent;
  const score: ScoreAnswer = sentiment;
  return {
    intentProbabilities: choice.probabilities,
    topIntent: choice.choice,
    needsHumanProbability: needsHuman.noul,
    angryProbability: score.probabilities[ANGRY_LEVEL] ?? 0,
    multiRequestProbability: multi.noul,
  };
};
