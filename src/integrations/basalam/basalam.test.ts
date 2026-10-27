import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BasalamClient, basalamProductToDraft, type BasalamProduct } from './basalam.client';

test('reads the vendor id and fails clearly when there is no shop', async () => {
  const withShop = new BasalamClient({
    token: 't',
    fetchImpl: (async () => new Response(JSON.stringify({ vendor: { id: 55 } }))) as typeof fetch,
  });
  assert.equal(await withShop.getVendorId(), 55);

  const noShop = new BasalamClient({
    token: 't',
    fetchImpl: (async () => new Response(JSON.stringify({ vendor: null }))) as typeof fetch,
  });
  await assert.rejects(noShop.getVendorId(), /no shop/);
});

test('sends bearer auth and stops paging at total_page', async () => {
  const pages: string[] = [];
  const client = new BasalamClient({
    token: 'tok',
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      pages.push(url.searchParams.get('page') ?? '');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer tok');
      const page = Number(url.searchParams.get('page'));
      const data = page === 1 ? Array.from({ length: 50 }, (_, i) => ({ id: i + 1 })) : [{ id: 99 }];
      return new Response(JSON.stringify({ data, total_page: 2, page, per_page: 50 }));
    }) as typeof fetch,
  });
  const products = await client.listVendorProducts(55);
  assert.equal(products.length, 51);
  assert.deepEqual(pages, ['1', '2']);
});

test('maps a product without variants', () => {
  const product: BasalamProduct = {
    id: 1, title: 'ساعت', price: 480000, inventory: 3,
    photo: { original: 'https://img.basalam/1.jpg' },
    status: { name: 'published', value: 2976 },
  };
  const draft = basalamProductToDraft(product);
  assert.equal(draft.externalId, 'basalam:1');
  assert.equal(draft.status, 'published');
  assert.equal(draft.variants[0].priceToman, 480_000);
  assert.equal(draft.variants[0].stock, 3);
  assert.deepEqual(draft.imageUrls, ['https://img.basalam/1.jpg']);
});

test('maps variants with property titles as attributes', () => {
  const product: BasalamProduct = {
    id: 2, title: 'پیراهن', price: 300000, inventory: 0,
    status: { value: 2976 },
    variant: [
      {
        id: 20, price: 310000, stock: 2,
        properties: [
          { property: { id: 1, title: 'رنگ' }, value: { id: 11, title: 'سفید' } },
          { property: { id: 2, title: 'سایز' }, value: { id: 12, title: 'M' } },
        ],
      },
    ],
  };
  const draft = basalamProductToDraft(product);
  assert.deepEqual(draft.variants[0].attributes, { 'رنگ': 'سفید', 'سایز': 'M' });
  assert.equal(draft.variants[0].priceToman, 310_000);
  assert.equal(draft.variants[0].stock, 2);
});

test('marks unpublished products as drafts with a warning', () => {
  const draft = basalamProductToDraft({
    id: 3, title: 'x', price: 1, inventory: 1, status: { name: 'pending', value: 3568 },
  });
  assert.equal(draft.status, 'draft');
  assert.equal(draft.warnings.length, 1);
});
