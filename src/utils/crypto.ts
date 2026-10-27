import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM for platform access tokens at rest.
// Format: base64(iv).base64(authTag).base64(ciphertext)

const ALGORITHM = 'aes-256-gcm';

const parseKey = (keyHex: string): Buffer => {
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(keyHex, 'hex');
};

export const encryptSecret = (plaintext: string, keyHex: string): string => {
  const key = parseKey(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64')).join('.');
};

export const decryptSecret = (encoded: string, keyHex: string): string => {
  const key = parseKey(keyHex);
  const parts = encoded.split('.');
  if (parts.length !== 3) throw new Error('Malformed encrypted value');
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};
