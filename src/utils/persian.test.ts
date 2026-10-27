import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMessageStyle,
  extractSearchTerms,
  formatToman,
  normalizePersian,
  parsePriceToToman,
  toEnglishDigits,
} from './persian';

test('normalizes Arabic letters, digits and ZWNJ', () => {
  assert.equal(normalizePersian('كفش  ' + 'ي'), 'کفش ی');
  assert.equal(normalizePersian('می\u200cخوام'), 'میخوام');
  assert.equal(normalizePersian('۱۲۳ and ١٢٣'), '123 and 123');
});

test('english digits from both Persian and Arabic-Indic forms', () => {
  assert.equal(toEnglishDigits('۰۹۱۲-۳۴۵'), '0912-345');
  assert.equal(toEnglishDigits('٠٩١٢'), '0912');
});

test('parses Persian toman prices with multipliers', () => {
  assert.equal(parsePriceToToman('۲۵۰ هزار تومان'), 250_000);
  assert.equal(parsePriceToToman('1.5 میلیون تومان'), 1_500_000);
  assert.equal(parsePriceToToman('قیمت: ۱۲۰۰۰۰'), 120_000);
  assert.equal(parsePriceToToman('250,000 تومن'), 250_000);
});

test('converts rial to toman', () => {
  assert.equal(parsePriceToToman('۲,۵۰۰,۰۰۰ ریال'), 250_000);
  assert.equal(parsePriceToToman('2500000', 'rial'), 250_000);
});

test('returns null when there is no price', () => {
  assert.equal(parsePriceToToman('سلام، دارید؟'), null);
});

test('formats toman for customers with Persian digits and separators', () => {
  assert.equal(formatToman(250_000), '۲۵۰٬۰۰۰ تومان');
  assert.equal(formatToman(1_500_000), '۱٬۵۰۰٬۰۰۰ تومان');
});

test('extracts product terms and drops stop words', () => {
  assert.deepEqual(extractSearchTerms('سلام، شلوار جین مشکی دارید؟'), ['شلوار', 'جین', 'مشکی']);
  assert.deepEqual(extractSearchTerms('shalvar jin dare?'), ['shalvar', 'jin']);
});

test('detects Persian, Finglish and English styles', () => {
  assert.equal(detectMessageStyle('سلام، قیمت این شلوار چنده؟'), 'persian');
  assert.equal(detectMessageStyle('salam, shalvar jin chand?'), 'finglish');
  assert.equal(detectMessageStyle('hello, how much is this?'), 'english');
});
