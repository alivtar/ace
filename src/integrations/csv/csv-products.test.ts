import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvToProductDrafts, parseCsv } from './csv-products';

test('parses quoted fields, escaped quotes, CRLF and BOM', () => {
  const rows = parseCsv('\uFEFFname,description\r\n"شلوار ""جین""","سلام, دنیا"\r\n');
  assert.deepEqual(rows, [
    ['name', 'description'],
    ['شلوار "جین"', 'سلام, دنیا'],
  ]);
});

test('groups rows with the same name into one product with variants', () => {
  const csv = [
    'نام محصول,قیمت,موجودی,رنگ,سایز,کد',
    'شلوار جین,۲۵۰ هزار تومان,3,مشکی,M,JN-1',
    'شلوار جین,۲۵۰ هزار تومان,0,مشکی,L,JN-2',
    'شلوار جین,۲۵۰ هزار تومان,5,آبی,M,JN-3',
    'تی‌شرت,۱۲۰۰۰۰,10,,,TS-1',
  ].join('\n');

  const { drafts, errors } = csvToProductDrafts(csv, { priceUnit: 'toman' });
  assert.deepEqual(errors, []);
  assert.equal(drafts.length, 2);

  const jeans = drafts.find((d) => d.name === 'شلوار جین');
  assert.ok(jeans);
  assert.equal(jeans.variants.length, 3);
  assert.deepEqual(jeans.variants[0].attributes, { 'رنگ': 'مشکی', 'سایز': 'M' });
  assert.equal(jeans.variants[0].priceToman, 250_000);
  assert.equal(jeans.variants[0].stock, 3);
  assert.equal(jeans.variants[0].sku, 'JN-1');
});

test('reports row-level errors without dropping good rows', () => {
  const csv = [
    'name,price,stock',
    'Bag,100000,2',
    ',50000,1',
    'Hat,abc,1',
    'Belt,80000,x',
  ].join('\n');
  const { drafts, errors } = csvToProductDrafts(csv, { priceUnit: 'toman' });
  assert.equal(drafts.length, 1);
  assert.deepEqual(errors.map((e) => e.row), [3, 4, 5]);
});

test('converts rial when the business uses rial prices', () => {
  const csv = 'name,price,stock\nBag,"2,500,000",1';
  const { drafts } = csvToProductDrafts(csv, { priceUnit: 'rial' });
  assert.equal(drafts[0].variants[0].priceToman, 250_000);
});

test('rejects a file without a name column', () => {
  const { drafts, errors } = csvToProductDrafts('price,stock\n1000,1', { priceUnit: 'toman' });
  assert.equal(drafts.length, 0);
  assert.match(errors[0].message, /name/);
});

test('external id is stable across re-imports of the same name', () => {
  const a = csvToProductDrafts('name,price\nBag,1000', { priceUnit: 'toman' }).drafts[0].externalId;
  const b = csvToProductDrafts('name,price\n  bag ,1000', { priceUnit: 'toman' }).drafts[0].externalId;
  assert.equal(a, b);
});
