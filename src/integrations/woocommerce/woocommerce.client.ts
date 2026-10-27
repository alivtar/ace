import { type ProductDraft, type ProductDraftVariant } from '../../domain/product-draft';

// WooCommerce REST API v3. Auth: consumer key/secret over HTTPS (Basic auth).
// Products: GET /wp-json/wc/v3/products (paged), variations: GET /wp-json/wc/v3/products/{id}/variations.

export type WooProduct = {
  id: number;
  name: string;
  sku?: string;
  status: string;
  type: 'simple' | 'variable' | 'grouped' | 'external';
  description?: string;
  short_description?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  stock_status?: 'instock' | 'outofstock' | 'onbackorder';
  stock_quantity?: number | null;
  manage_stock?: boolean;
  categories?: Array<{ name: string }>;
  images?: Array<{ src: string }>;
  attributes?: Array<{ name: string; options: string[]; variation?: boolean }>;
};

export type WooVariation = {
  id: number;
  sku?: string;
  price?: string;
  stock_status?: 'instock' | 'outofstock' | 'onbackorder';
  stock_quantity?: number | null;
  attributes: Array<{ name: string; option: string }>;
};

export type WooCommerceClientOptions = {
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
  priceUnit: 'toman' | 'rial';
  fetchImpl?: typeof fetch;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 200; // safety valve: 20k products

export class WooCommerceClient {
  private readonly options: WooCommerceClientOptions;

  constructor(options: WooCommerceClientOptions) {
    const url = new URL(options.siteUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new Error('WooCommerce site URL must use HTTPS');
    }
    this.options = options;
  }

  private async getJson<T>(path: string, query: Record<string, string>): Promise<{ data: T; totalPages: number }> {
    const { siteUrl, consumerKey, consumerSecret } = this.options;
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const url = new URL(`/wp-json/wc/v3/${path}`, siteUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`WooCommerce responded with HTTP ${response.status} for ${path}`);
    }
    const totalPages = Number(response.headers.get('X-WP-TotalPages') ?? '0');
    return { data: (await response.json()) as T, totalPages };
  }

  async listProducts(): Promise<WooProduct[]> {
    const all: WooProduct[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, totalPages } = await this.getJson<WooProduct[]>('products', {
        per_page: String(PAGE_SIZE),
        page: String(page),
        status: 'any',
      });
      all.push(...data);
      if (data.length < PAGE_SIZE || (totalPages > 0 && page >= totalPages)) break;
    }
    return all;
  }

  async listVariations(productId: number): Promise<WooVariation[]> {
    const all: WooVariation[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, totalPages } = await this.getJson<WooVariation[]>(`products/${productId}/variations`, {
        per_page: String(PAGE_SIZE),
        page: String(page),
      });
      all.push(...data);
      if (data.length < PAGE_SIZE || (totalPages > 0 && page >= totalPages)) break;
    }
    return all;
  }
}

const stripHtml = (html: string | undefined): string | null => {
  if (!html) return null;
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+\n/g, '\n')
    .trim();
  return text || null;
};

const toNumber = (value: string | undefined): number | null => {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const convertToToman = (amount: number, unit: 'toman' | 'rial'): number =>
  Math.round(unit === 'rial' ? amount / 10 : amount);

const stockFrom = (
  quantity: number | null | undefined,
  status: string | undefined,
  warnings: string[],
  label: string,
): number => {
  if (typeof quantity === 'number') return Math.max(0, quantity);
  // Stock not managed at this level: we only know in/out of stock. Count "in" as 1 and say so.
  if (status === 'instock') {
    warnings.push(`${label}: stock quantity not managed in WooCommerce; imported as 1 (in stock)`);
    return 1;
  }
  return 0;
};

/** Converts a WooCommerce product (plus variations for variable products) into a ProductDraft. */
export const wooProductToDraft = (
  product: WooProduct,
  variations: WooVariation[],
  priceUnit: 'toman' | 'rial',
): ProductDraft => {
  const warnings: string[] = [];
  const externalId = `woo:${product.id}`;
  const variants: ProductDraftVariant[] = [];

  if (product.type === 'variable') {
    if (variations.length === 0) warnings.push('Variable product has no variations; imported without variants.');
    for (const variation of variations) {
      const price = toNumber(variation.price) ?? toNumber(product.price);
      if (price === null) warnings.push(`variation ${variation.id}: no price`);
      const attributes = Object.fromEntries(
        variation.attributes.map((attribute) => [attribute.name, attribute.option]),
      );
      variants.push({
        externalId: `woo:${variation.id}`,
        sku: variation.sku || null,
        priceToman: convertToToman(price ?? 0, priceUnit),
        stock: stockFrom(variation.stock_quantity, variation.stock_status, warnings, `variation ${variation.id}`),
        attributes,
      });
    }
  } else {
    const price = toNumber(product.price) ?? toNumber(product.regular_price);
    if (price === null) warnings.push('Product has no price');
    variants.push({
      externalId: null,
      sku: product.sku || null,
      priceToman: convertToToman(price ?? 0, priceUnit),
      stock: stockFrom(product.stock_quantity, product.stock_status, warnings, 'product'),
      attributes: {},
    });
  }

  return {
    externalId,
    name: product.name,
    description: stripHtml(product.description) ?? stripHtml(product.short_description),
    category: product.categories?.[0]?.name ?? null,
    status: product.status === 'publish' ? 'published' : 'draft',
    imageUrls: (product.images ?? []).map((image) => image.src),
    variants,
    warnings,
  };
};
