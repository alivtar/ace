import { createHash } from 'node:crypto';

// One normalized product shape shared by every import source (manual, CSV, WooCommerce, Basalam).
// Adapters convert their own formats into this. Nothing else reads source-specific fields.

export const PRODUCT_SOURCES = ['manual', 'csv', 'woocommerce', 'basalam'] as const;
export type ProductSource = (typeof PRODUCT_SOURCES)[number];

export type ProductDraftVariant = {
  externalId: string | null;
  sku: string | null;
  priceToman: number;
  stock: number;
  /** Attribute label -> value, e.g. { "رنگ": "مشکی", "سایز": "M" }. */
  attributes: Record<string, string>;
};

export type ProductDraft = {
  externalId: string;
  name: string;
  description: string | null;
  category: string | null;
  status: 'published' | 'draft' | 'archived';
  imageUrls: string[];
  variants: ProductDraftVariant[];
  warnings: string[];
};

export const validateProductDraft = (draft: ProductDraft): string[] => {
  const errors: string[] = [];
  if (!draft.externalId) errors.push('externalId is required');
  if (!draft.name || !draft.name.trim()) errors.push('name is required');
  if (draft.variants.length === 0) errors.push('at least one variant (price) is required');

  draft.variants.forEach((variant, index) => {
    if (!Number.isInteger(variant.priceToman) || variant.priceToman < 0) {
      errors.push(`variant ${index}: price must be a non-negative integer in toman`);
    }
    if (!Number.isInteger(variant.stock) || variant.stock < 0) {
      errors.push(`variant ${index}: stock must be a non-negative integer`);
    }
  });
  return errors;
};

// Stable JSON: sorted keys, so the same content always hashes the same way.
const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

/** Hash of the customer-visible content. Warnings are excluded so they don't trigger updates. */
export const draftContentHash = (draft: ProductDraft): string => {
  const { warnings: _warnings, ...content } = draft;
  return createHash('sha256').update(stableStringify(content)).digest('hex');
};
