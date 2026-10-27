import { type ProductDraft, type ProductDraftVariant } from '../../domain/product-draft';

// Basalam Open API (openapi.basalam.com). Auth: Authorization: Bearer <token>.
// Endpoints from the official OpenAPI spec (core service):
//   GET /v1/users/me                       -> user.vendor.id (null when the user has no shop)
//   GET /v1/vendors/{vendor_id}/products   -> { data: [...], total_page, page, per_page, ... }

export const BASALAM_PUBLISHED_STATUS = 2976; // from the official create-product status enum

export type BasalamProduct = {
  id: number;
  title: string;
  price: number;
  primary_price?: number | null;
  photo?: { original?: string } | null;
  status?: { name?: string; value?: number | string } | null;
  inventory: number;
  sku?: string | null;
  variant?: BasalamVariant[] | null;
};

export type BasalamVariant = {
  id?: number | null;
  price?: number | null;
  primary_price?: number | null;
  stock: number;
  sku?: string | null;
  properties: Array<{
    property: { id: number; title: string };
    value: { id: number; title: string; value?: string | null };
  }>;
};

export type BasalamClientOptions = {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE_URL = 'https://openapi.basalam.com';
const PAGE_SIZE = 50;
const MAX_PAGES = 400;

export class BasalamClient {
  private readonly options: BasalamClientOptions;

  constructor(options: BasalamClientOptions) {
    if (!options.token) throw new Error('Basalam token is required');
    this.options = options;
  }

  private async getJson<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const url = new URL(path, this.options.baseUrl ?? DEFAULT_BASE_URL);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${this.options.token}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Basalam responded with HTTP ${response.status} for ${path}`);
    }
    return (await response.json()) as T;
  }

  async getVendorId(): Promise<number> {
    const me = await this.getJson<{ vendor?: { id?: number } | null }>('/v1/users/me');
    const vendorId = me.vendor?.id;
    if (!vendorId) throw new Error('This Basalam account has no shop (vendor) yet');
    return vendorId;
  }

  async listVendorProducts(vendorId: number): Promise<BasalamProduct[]> {
    const all: BasalamProduct[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const body = await this.getJson<{ data: BasalamProduct[] | null; total_page?: number | null }>(
        `/v1/vendors/${vendorId}/products`,
        { page: String(page), per_page: String(PAGE_SIZE) },
      );
      const data = body.data ?? [];
      all.push(...data);
      const totalPages = body.total_page ?? 0;
      if (data.length < PAGE_SIZE || (totalPages > 0 && page >= totalPages)) break;
    }
    return all;
  }
}

/**
 * Converts a Basalam product into a ProductDraft.
 * Prices are read as integer toman (Basalam prices are stated in toman; verify on the first real import).
 */
export const basalamProductToDraft = (product: BasalamProduct): ProductDraft => {
  const warnings: string[] = [];
  const variants: ProductDraftVariant[] = [];

  if (product.variant && product.variant.length > 0) {
    for (const variant of product.variant) {
      const attributes = Object.fromEntries(
        variant.properties.map((entry) => [entry.property.title, entry.value.title]),
      );
      variants.push({
        externalId: variant.id ? `basalam-variant:${variant.id}` : null,
        sku: variant.sku ?? null,
        priceToman: Math.round(variant.price ?? product.price),
        stock: Math.max(0, variant.stock),
        attributes,
      });
    }
  } else {
    variants.push({
      externalId: null,
      sku: product.sku ?? null,
      priceToman: Math.round(product.price),
      stock: Math.max(0, product.inventory),
      attributes: {},
    });
  }

  const statusValue = product.status?.value;
  const published = Number(statusValue) === BASALAM_PUBLISHED_STATUS;
  if (!published) warnings.push(`Basalam status "${product.status?.name ?? statusValue}" is not published`);

  return {
    externalId: `basalam:${product.id}`,
    name: product.title,
    description: null, // not part of the vendor product list response
    category: null,
    status: published ? 'published' : 'draft',
    imageUrls: product.photo?.original ? [product.photo.original] : [],
    variants,
    warnings,
  };
};
