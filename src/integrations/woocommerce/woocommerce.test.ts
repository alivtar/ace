import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WooCommerceClient, wooProductToDraft, type WooProduct } from './woocommerce.client';

const jsonResponse = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', ...headers } });

test('sends basic auth and pages through all products', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}?${url.searchParams.toString()}`);
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from('ck_1:cs_1').toString('base64')}`,
    );
    const page = Number(url.searchParams.get('page'));
    const items = page === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })) : [{ id: 101 }];
    return jsonResponse(items, { 'X-WP-TotalPages': '2' });
  }) as typeof fetch;

  const client = new WooCommerceClient({
    siteUrl: 'https://shop.example.ir',
    consumerKey: 'ck_1',
    consumerSecret: 'cs_1',
    priceUnit: 'toman',
    fetchImpl,
  });
  const products = await client.listProducts();
  assert.equal(products.length, 101);
  assert.equal(calls.length, 2);
});

test('refuses non-HTTPS site URLs', () => {
  assert.throws(() => new WooCommerceClient({
    siteUrl: 'http://shop.example.ir',
    consumerKey: 'a',
    consumerSecret: 'b',
    priceUnit: 'toman',
  }));
});

test('maps a simple product with sale price and managed stock', () => {
  const product: WooProduct = {
    id: 7,
    name: 'کیف چرم',
    sku: 'BAG-7',
    status: 'publish',
    type: 'simple',
    price: '350000',
    regular_price: '400000',
    sale_price: '350000',
    stock_status: 'instock',
    stock_quantity: 4,
    description: '<p>چرم طبیعی</p><br>ساخت ایران',
    categories: [{ name: 'کیف' }],
    images: [{ src: 'https://img.example/1.jpg' }],
  };
  const draft = wooProductToDraft(product, [], 'toman');
  assert.equal(draft.externalId, 'woo:7');
  assert.equal(draft.status, 'published');
  assert.equal(draft.variants[0].priceToman, 350_000);
  assert.equal(draft.variants[0].stock, 4);
  assert.equal(draft.description, 'چرم طبیعی\nساخت ایران');
  assert.deepEqual(draft.imageUrls, ['https://img.example/1.jpg']);
  assert.deepEqual(draft.warnings, []);
});

test('maps variable product variations with attributes', () => {
  const product: WooProduct = {
    id: 9, name: 'تی‌شرت', status: 'publish', type: 'variable', price: '100000',
    stock_status: 'instock',
  };
  const draft = wooProductToDraft(
    product,
    [
      { id: 91, price: '100000', stock_quantity: 2, attributes: [{ name: 'Size', option: 'M' }] },
      { id: 92, price: '120000', stock_quantity: null, stock_status: 'outofstock', attributes: [{ name: 'Size', option: 'L' }] },
    ],
    'toman',
  );
  assert.equal(draft.variants.length, 2);
  assert.deepEqual(draft.variants[0].attributes, { Size: 'M' });
  assert.equal(draft.variants[1].stock, 0);
});

test('warns when stock is not managed and marks drafts as drafts', () => {
  const draft = wooProductToDraft(
    { id: 3, name: 'Mug', status: 'draft', type: 'simple', price: '50000', stock_status: 'instock' },
    [],
    'toman',
  );
  assert.equal(draft.status, 'draft');
  assert.equal(draft.variants[0].stock, 1);
  assert.equal(draft.warnings.length, 1);
});

test('converts rial prices to toman', () => {
  const draft = wooProductToDraft(
    { id: 4, name: 'Pen', status: 'publish', type: 'simple', price: '5000000', stock_status: 'instock', stock_quantity: 1 },
    [],
    'rial',
  );
  assert.equal(draft.variants[0].priceToman, 500_000);
});
