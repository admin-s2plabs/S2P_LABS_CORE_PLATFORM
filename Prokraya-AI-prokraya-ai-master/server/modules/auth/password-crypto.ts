/**
 * RSA-OAEP key pair used exclusively for encrypting passwords in transit.
 * This is separate from the JWT signing keys (RS256).
 *
 * Flow:
 *   Frontend fetches GET /api/auth/public-key  → receives SPKI public key (base64)
 *   Frontend encrypts password with RSA-OAEP / SHA-256 via WebCrypto
 *   Backend decrypts with private key before passing to Argon2 verify
 */

import crypto from "crypto";

interface KeyPair {
  privateKey: crypto.KeyObject;
  publicKeySpkiBase64: string; // SPKI-DER, base64-encoded
}

let _keyPair: KeyPair | null = null;

function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  return {
    privateKey: crypto.createPrivateKey(privateKey as unknown as string),
    publicKeySpkiBase64: (publicKey as unknown as Buffer).toString("base64"),
  };
}

function getKeyPair(): KeyPair {
  if (!_keyPair) {
    _keyPair = generateKeyPair();
  }
  return _keyPair;
}

/** Returns the RSA public key as a base64-encoded SPKI-DER blob. */
export function getPublicKeySpkiBase64(): string {
  return getKeyPair().publicKeySpkiBase64;
}

/**
 * Decrypts a password that was encrypted by the browser using RSA-OAEP / SHA-256.
 * @param encryptedBase64 - base64-encoded ciphertext from the frontend
 * @returns the plaintext password string
 */
export function decryptPassword(encryptedBase64: string): string {
  const { privateKey } = getKeyPair();
  const ciphertext = Buffer.from(encryptedBase64, "base64");
  const plaintext = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    ciphertext
  );
  return plaintext.toString("utf8");
}
