/**
 * Server-only encryption utilities (Node.js crypto — never runs in the browser).
 *
 * Algorithm: AES-256-GCM
 *   - 256-bit random key per land record
 *   - 96-bit random IV per encryption
 *   - 128-bit authentication tag appended to ciphertext (tamper-evident)
 *
 * Why content encryption, not CID encryption:
 *   The CID stored on-chain must stay as-is so tokenURI() resolves correctly
 *   and the ERC-721 standard is not broken. What we encrypt is the JSON content
 *   before it is pinned, so the CID points to encrypted bytes — unreadable
 *   without the key stored server-side in Supabase.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedPayload {
  encrypted: true;
  algorithm: 'aes-256-gcm';
  iv: string;   // 12-byte IV as hex
  data: string; // ciphertext + 16-byte auth tag as hex
}

/**
 * Encrypt a JSON object.
 * Returns the encrypted payload (uploaded to IPFS) and the key (stored in Supabase).
 */
export function encryptJSON(obj: object): { payload: EncryptedPayload; keyHex: string } {
  const key = randomBytes(32); // 256-bit
  const iv  = randomBytes(12); // 96-bit GCM IV

  const cipher    = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(obj);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag(); // 16 bytes

  return {
    payload: {
      encrypted: true,
      algorithm: 'aes-256-gcm',
      iv:   iv.toString('hex'),
      data: Buffer.concat([encrypted, authTag]).toString('hex'),
    },
    keyHex: key.toString('hex'),
  };
}

/**
 * Decrypt an EncryptedPayload back to the original object.
 * Called server-side in /api/metadata route only — key never reaches the browser.
 */
export function decryptJSON(payload: EncryptedPayload, keyHex: string): object {
  const key      = Buffer.from(keyHex, 'hex');
  const iv       = Buffer.from(payload.iv, 'hex');
  const combined = Buffer.from(payload.data, 'hex');

  const authTag    = combined.subarray(-16);
  const ciphertext = combined.subarray(0, -16);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

/** Type-guard: check if an object fetched from IPFS is an EncryptedPayload. */
export function isEncryptedPayload(obj: unknown): obj is EncryptedPayload {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as Record<string, unknown>).encrypted === true &&
    (obj as Record<string, unknown>).algorithm === 'aes-256-gcm'
  );
}
