import { normalizePersian } from '../utils/persian';

// Last check before a reply is sent. The writer model can drift, so the bot verifies:
//   1. Every price-sized number in the reply exists in the facts it was given.
//   2. No promise is made that the facts don't back up (discounts, guarantees, refunds).
//   3. The reply fits Instagram's limit.

export const INSTAGRAM_TEXT_MAX_BYTES = 1000;

// Words that commit the shop to something. Each is allowed only when its facts exist.
const PROMISE_RULES: Array<{ pattern: RegExp; requiredFact: string }> = [
  { pattern: /تخفیف|کد تخفیف|off\b/, requiredFact: 'discount' },
  { pattern: /رایگان|ارسال رایگان/, requiredFact: 'free_shipping' },
  { pattern: /ضمانت|گارانتی|تضمین/, requiredFact: 'guarantee' },
  { pattern: /استرداد|بازگشت وجه|پس می‌دهیم|پس میدیم/, requiredFact: 'refund' },
];

export type ReplyValidation = { ok: true } | { ok: false; problems: string[] };

const collectAllowedNumbers = (facts: unknown): Set<number> => {
  const allowed = new Set<number>();
  const visit = (value: unknown) => {
    if (typeof value === 'number') allowed.add(Math.round(value));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(facts);
  return allowed;
};

const MULTIPLIER_FACTORS: Record<string, number> = { 'هزار': 1_000, 'میلیون': 1_000_000 };

/**
 * Numbers a reply states, with Persian multipliers applied: "250 هزار" -> 250000.
 * Without this, a wrong price written with a multiplier would pass as a small number.
 */
export const extractNumbers = (text: string): number[] => {
  const cleaned = normalizePersian(text).replace(/(\d)[,٬](?=\d{3}\b)/g, '$1');
  const pattern = /(\d+(?:\.\d+)?)\s*(هزار|میلیون)?/g;
  const numbers: number[] = [];
  for (const match of cleaned.matchAll(pattern)) {
    const base = Number(match[1]);
    const factor = match[2] ? MULTIPLIER_FACTORS[match[2]] : 1;
    numbers.push(Math.round(base * factor));
  }
  return numbers;
};

const collectFactKeys = (facts: unknown): Set<string> => {
  const keys = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        keys.add(key);
        visit(nested);
      }
    }
  };
  visit(facts);
  return keys;
};

export const validateReply = (text: string, facts: unknown): ReplyValidation => {
  const problems: string[] = [];
  const trimmed = text.trim();

  if (!trimmed) problems.push('empty reply');
  if (Buffer.byteLength(trimmed, 'utf8') > INSTAGRAM_TEXT_MAX_BYTES) {
    problems.push('reply exceeds Instagram text limit');
  }

  // Price-sized numbers (>= 1000) must come from the facts. Small numbers (sizes, days) are fine.
  const allowedNumbers = collectAllowedNumbers(facts);
  for (const number of extractNumbers(trimmed)) {
    if (number >= 1000 && !allowedNumbers.has(number)) {
      problems.push(`number ${number} is not in the facts`);
    }
  }

  const normalized = normalizePersian(trimmed);
  const factKeys = collectFactKeys(facts);
  for (const rule of PROMISE_RULES) {
    if (rule.pattern.test(normalized) && !factKeys.has(rule.requiredFact)) {
      problems.push(`promise without facts: ${rule.requiredFact}`);
    }
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
};
