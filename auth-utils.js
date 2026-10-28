const crypto = require('node:crypto');

/**
 * Hash a password or PIN using scrypt with a unique 16-byte random salt.
 * Output format: scrypt:<salt_hex>:<hash_hex>
 */
function hashSecret(secret) {
  if (secret === undefined || secret === null || secret === '') return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(secret), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

/**
 * Verify a plaintext secret against a stored hash (or legacy plaintext for transparent migration).
 * Uses constant-time comparison to protect against timing attacks.
 */
function verifySecret(secret, stored) {
  if (stored === undefined || stored === null || secret === undefined || secret === null) return false;
  const strSecret = String(secret);
  const strStored = String(stored);

  // Backward compatibility: If stored value is legacy plaintext, check directly
  if (!strStored.startsWith('scrypt:')) {
    return strSecret === strStored;
  }

  const parts = strStored.split(':');
  if (parts.length !== 3) return false;

  const [, salt, originalHash] = parts;
  try {
    const hash = crypto.scryptSync(strSecret, salt, 64).toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const origBuf = Buffer.from(originalHash, 'hex');
    if (hashBuf.length !== origBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, origBuf);
  } catch (e) {
    return false;
  }
}

module.exports = {
  hashSecret,
  verifySecret
};
