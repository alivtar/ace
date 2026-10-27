import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReply } from './reply-validator';

const facts = {
  kind: 'product',
  product: { name: 'شلوار جین', variants: [{ price_toman: 250000, in_stock: true }] },
  shipping: { days: 3 },
};

test('accepts a reply that quotes only facts', () => {
  const result = validateReply('قیمت شلوار جین ۲۵۰٬۰۰۰ تومان است و ۳ روز کاری ارسال می‌شود.', facts);
  assert.deepEqual(result, { ok: true });
});

test('rejects a price the facts do not contain', () => {
  const result = validateReply('قیمتش ۱۹۰٬۰۰۰ تومان است.', facts);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.problems[0], /190000/);
});

test('rejects an unsupported discount promise', () => {
  const result = validateReply('الان ۲۰٪ تخفیف دارد.', facts);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.problems.some((p) => p.includes('discount')));
});

test('allows a discount promise when a discount fact exists', () => {
  const result = validateReply('بله، کد تخفیف فعال است.', { ...facts, discount: { code: 'X' } });
  assert.deepEqual(result, { ok: true });
});

test('rejects replies over the Instagram limit', () => {
  const result = validateReply('الف'.repeat(600), facts); // 2 bytes per char -> 1200 bytes
  assert.equal(result.ok, false);
});

test('rejects empty replies', () => {
  const result = validateReply('   ', facts);
  assert.equal(result.ok, false);
});
