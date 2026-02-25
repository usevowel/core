/**
 * Encryption utilities for securing provider API keys.
 * Uses AES-GCM with 256-bit keys derived from environment secret.
 */

const ALGORITHM = { name: "AES-GCM", length: 256 };
const IV_LENGTH = 12;

async function deriveEncryptionKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", keyMaterial);
  return await crypto.subtle.importKey(
    "raw",
    hash,
    ALGORITHM,
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a plaintext API key.
 * @returns Object with encryptedKey and iv as Uint8Arrays (for BLOB storage)
 */
export async function encryptApiKey(
  plaintext: string,
  secret: string
): Promise<{ encryptedKey: Uint8Array; iv: Uint8Array }> {
  const key = await deriveEncryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const data = new TextEncoder().encode(plaintext);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );

  return {
    encryptedKey: new Uint8Array(encryptedBuffer),
    iv,
  };
}

/**
 * Decrypt an encrypted API key.
 * @param encryptedKey - BLOB from database (Buffer or Uint8Array)
 * @param iv - IV from database (Buffer or Uint8Array)
 */
export async function decryptApiKey(
  encryptedKey: Uint8Array | Buffer,
  iv: Uint8Array | Buffer,
  secret: string
): Promise<string> {
  const key = await deriveEncryptionKey(secret);
  const ciphertext =
    encryptedKey instanceof Buffer ? new Uint8Array(encryptedKey) : encryptedKey;
  const ivArray = iv instanceof Buffer ? new Uint8Array(iv) : iv;

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivArray },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plainBuffer);
}

/**
 * Get encryption secret from environment.
 * Uses ENCRYPTION_KEY (or API_KEY_ENCRYPTION_SECRET for parity with platform).
 */
export function getEncryptionSecret(): string {
  const secret =
    process.env.ENCRYPTION_KEY ?? process.env.API_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_KEY or API_KEY_ENCRYPTION_SECRET must be set (min 32 chars)"
    );
  }
  if (secret.length < 32) {
    throw new Error("Encryption secret must be at least 32 characters");
  }
  return secret;
}
