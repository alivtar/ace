import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptSecret, encryptSecret } from './crypto';

const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

test('round-trips a secret and never stores plaintext', () => {
  const encrypted = encryptSecret('EAAG-super-secret-token', KEY);
  assert.ok(!encrypted.includes('EAAG'));
  assert.equal(decryptSecret(encrypted, KEY), 'EAAG-super-secret-token');
});

test('uses a fresh IV for each encryption', () => {
  assert.notEqual(encryptSecret('same', KEY), encryptSecret('same', KEY));
});

test('detects tampering', () => {
  const [iv, tag, ciphertext] = encryptSecret('token', KEY).split('.');
  const flipped = Buffer.from(ciphertext, 'base64');
  flipped[0] ^= 0xff;
  assert.throws(() => decryptSecret([iv, tag, flipped.toString('base64')].join('.'), KEY));
});

test('rejects keys that are not 32 bytes of hex', () => {
  assert.throws(() => encryptSecret('x', 'short'), /64 hex characters/);
});
