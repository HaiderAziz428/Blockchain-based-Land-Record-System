/**
 * Server-only helper — decrypts the ADMIN_PRIVATE_KEY at runtime.
 *
 * ENCRYPTED_ADMIN_KEY and ENCRYPTION_MASTER_KEY live in .env.local.
 * The raw private key is never stored in plaintext anywhere on disk.
 *
 * Format of ENCRYPTED_ADMIN_KEY: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

import { createDecipheriv } from 'crypto';

export function getAdminKey(): `0x${string}` {
  const masterKeyHex = process.env.ENCRYPTION_MASTER_KEY;
  const encryptedKey = process.env.ENCRYPTED_ADMIN_KEY;

  if (!masterKeyHex || !encryptedKey) {
    throw new Error(
      'Server misconfigured: ENCRYPTION_MASTER_KEY and ENCRYPTED_ADMIN_KEY must both be set in .env.local. ' +
      'Run `node scripts/encrypt-admin-key.mjs` to generate them.'
    );
  }

  const parts = encryptedKey.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'ENCRYPTED_ADMIN_KEY is malformed. Expected format: <iv>:<authTag>:<ciphertext>. ' +
      'Re-run `node scripts/encrypt-admin-key.mjs`.'
    );
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const masterKey  = Buffer.from(masterKeyHex,  'hex');
  const iv         = Buffer.from(ivHex,         'hex');
  const authTag    = Buffer.from(authTagHex,    'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8') as `0x${string}`;
}
