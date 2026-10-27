import { ONLINE_SHOP_INTENTS, type HandlerName } from '../domain/intents';
import { formatToman, extractSearchTerms, toEnglishDigits } from '../utils/persian';
import type { BusinessTypeModule, RetrievalContext, RetrievalResult } from './types';

const MAX_PRODUCT_CANDIDATES = 20;
const PRODUCT_MATCH_MIN_CONFIDENCE = 0.6; // starting point; calibrate on labelled DMs
const ORDER_VERIFICATION_MAX_FAILURES = 3;

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'ثبت شده و در انتظار پرداخت',
  paid: 'پرداخت شده',
  preparing: 'در حال آماده‌سازی',
  shipped: 'ارسال شده',
  delivered: 'تحویل داده شده',
  cancelled: 'لغو شده',
  returned: 'مرجوع شده',
};

export const normalizePhone = (text: string): string | null => {
  const digits = toEnglishDigits(text).replace(/[\s\-()]/g, '');
  const match = digits.match(/(?:\+?98|0098)?(9\d{9})(?!\d)/) ?? digits.match(/(09\d{9})(?!\d)/);
  if (!match) return null;
  return match[1].startsWith('9') ? `0${match[1]}` : match[1];
};

/** Order codes are owner-defined, so accept any short alphanumeric token that is not the phone number. */
export const extractOrderCode = (text: string, phone: string | null): string | null => {
  let cleaned = toEnglishDigits(text);
  if (phone) cleaned = cleaned.replace(phone.slice(1), ' ');
  const tokens = cleaned.match(/[A-Za-z0-9]{4,20}/g) ?? [];
  return tokens.find((token) => /\d/.test(token)) ?? tokens.find((token) => /[A-Za-z]/.test(token)) ?? null;
};

const productSummary = (name: string, variants: Array<{ attributes: Record<string, string> }>): string => {
  const values = new Map<string, Set<string>>();
  for (const variant of variants) {
    for (const [attribute, value] of Object.entries(variant.attributes)) {
      if (!values.has(attribute)) values.set(attribute, new Set());
      values.get(attribute)!.add(value);
    }
  }
  const parts = [...values.entries()].map(([attribute, set]) => `${attribute}: ${[...set].join('، ')}`);
  return parts.length ? `${name} (${parts.join('؛ ')})` : name;
};

const sectionFact = (settings: Record<string, unknown>, key: string, missing: string[]): unknown => {
  const value = settings[key];
  if (value === undefined || value === null || value === '') missing.push(key);
  return value;
};

export const onlineShopModule: BusinessTypeModule = {
  id: 'online_shop',
  intents: ONLINE_SHOP_INTENTS,
  writerRules: [
    'Use only the facts in the JSON. Never invent prices, stock, delivery times, discounts, guarantees, refunds or order statuses.',
    'Quote a price exactly as facts.product.variants[].price_toman, written with Persian digits and "تومان".',
    'If facts.product_candidates is present, ask which product the customer means and name at most three of them.',
    'If facts.product_search.found is 0, say you could not find that product and ask for its exact name.',
    'If facts.order.verification is "needed", ask for the order code and the phone number used for the order.',
    'If facts.order.verification is "failed", say the details do not match and ask the customer to check them.',
    'Only tell the order status and tracking code when facts.order.verification is "verified".',
    'Reply in the same style as the customer: Persian script for Persian, Finglish for Finglish.',
    'Be friendly and brief: at most three short sentences, no markdown, at most one emoji.',
  ],

  async retrieve(handlers: readonly HandlerName[], ctx: RetrievalContext): Promise<RetrievalResult> {
    const facts: Record<string, unknown> = {
      store: { name: ctx.business.name },
    };
    const missing: string[] = [];
    const settings = ctx.business.settings;
    const unique = [...new Set(handlers)].filter((handler) => handler !== 'none');
    let nextConversationState: Record<string, unknown> | undefined;
    let handoffReason: string | undefined;

    for (const handler of unique) {
      switch (handler) {
        case 'product_lookup':
        case 'purchase': {
          Object.assign(facts, await productFacts(ctx));
          if (handler === 'purchase') {
            const ordering = settings.ordering;
            if (ordering) facts.ordering = ordering;
          }
          break;
        }
        case 'store_info': {
          const info = settings.store as Record<string, unknown> | undefined;
          if (!info) missing.push('store');
          else facts.store = { name: ctx.business.name, ...info };
          break;
        }
        case 'shipping':
          facts.shipping = sectionFact(settings, 'shipping', missing);
          break;
        case 'payment':
          facts.payment = sectionFact(settings, 'payment', missing);
          break;
        case 'return_policy':
          facts.returns = sectionFact(settings, 'returns', missing);
          break;
        case 'discount':
          facts.discounts = sectionFact(settings, 'discounts', missing);
          break;
        case 'faq':
          facts.faq = sectionFact(settings, 'faq', missing);
          break;
        case 'order_status': {
          const order = await orderFacts(ctx);
          facts.order = order.facts;
          nextConversationState = order.nextState;
          if (order.handoffReason) handoffReason = order.handoffReason;
          break;
        }
      }
    }

    return {
      facts,
      complete: missing.length === 0,
      missing,
      nextConversationState,
      handoffReason,
    };
  },
};

async function productFacts(ctx: RetrievalContext): Promise<Record<string, unknown>> {
  const terms = extractSearchTerms(ctx.latestMessage);
  if (terms.length === 0) {
    return { product_search: { found: 0, reason: 'no_product_name' } };
  }

  const rows = await ctx.store.searchProducts(ctx.business.id, terms, MAX_PRODUCT_CANDIDATES);
  if (rows.length === 0) {
    return { product_search: { found: 0, terms } };
  }

  const variantRows = await ctx.store.getVariants(rows.map((row) => row.id));
  const variantsOf = (productId: string) => variantRows.filter((variant) => variant.productId === productId);

  let chosen: (typeof rows)[number] | undefined;
  if (rows.length === 1) {
    chosen = rows[0];
  } else {
    const candidates = rows.map((row, index) => ({
      key: `p${index + 1}`,
      id: row.id,
      description: productSummary(row.name, variantsOf(row.id)),
    }));
    const answer = await ctx.judgeProduct(candidates.map(({ key, description }) => ({ key, description })));
    const match = candidates.find((candidate) => candidate.key === answer.choice);
    if (match && answer.choice !== 'none' && answer.confidence >= PRODUCT_MATCH_MIN_CONFIDENCE) {
      chosen = rows.find((row) => row.id === match.id);
    }
  }

  if (!chosen) {
    return {
      product_search: { found: rows.length, terms },
      product_candidates: rows.slice(0, 5).map((row) => row.name),
    };
  }

  return {
    product_search: { found: rows.length, terms },
    product: {
      name: chosen.name,
      variants: variantsOf(chosen.id).map((variant) => ({
        attributes: variant.attributes,
        price_toman: variant.priceToman,
        price_text: formatToman(variant.priceToman),
        in_stock: variant.stockQuantity > 0,
      })),
    },
  };
}

async function orderFacts(ctx: RetrievalContext): Promise<{
  facts: Record<string, unknown>;
  nextState: Record<string, unknown>;
  handoffReason?: string;
}> {
  const previous = (ctx.conversationState.orderVerification ?? {}) as { code?: string; phone?: string; failures?: number };
  const phone = normalizePhone(ctx.latestMessage) ?? previous.phone ?? null;
  const code = extractOrderCode(ctx.latestMessage, normalizePhone(ctx.latestMessage)) ?? previous.code ?? null;

  if (!code || !phone) {
    const missing = [...(code ? [] : ['order_code']), ...(phone ? [] : ['phone'])];
    return {
      facts: { verification: 'needed', missing },
      nextState: { orderVerification: { code, phone, failures: previous.failures ?? 0 } },
    };
  }

  const order = await ctx.store.findOrder(ctx.business.id, code, phone);
  if (!order) {
    const failures = (previous.failures ?? 0) + 1;
    return {
      facts: { verification: 'failed' },
      nextState: { orderVerification: { failures } },
      handoffReason: failures >= ORDER_VERIFICATION_MAX_FAILURES ? 'order_verification_failed' : undefined,
    };
  }

  return {
    facts: {
      verification: 'verified',
      order_code: order.orderCode,
      status: ORDER_STATUS_LABELS[order.status] ?? order.status,
      tracking_code: order.trackingCode,
      carrier: order.carrier,
      total_text: formatToman(order.totalToman),
    },
    nextState: {},
  };
}
