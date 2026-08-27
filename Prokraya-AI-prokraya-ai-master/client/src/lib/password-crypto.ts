/**
 * Client-side password encryption using the browser's built-in WebCrypto API.
 * Uses RSA-OAEP / SHA-256 with the server's public key.
 *
 * The public key is fetched once and cached for the session lifetime.
 */

import { apiRequest } from "./queryClient";

let _cachedPublicKey: CryptoKey | null = null;

async function fetchAndImportPublicKey(): Promise<CryptoKey> {
  if (_cachedPublicKey) return _cachedPublicKey;

  const res = await apiRequest("GET", "/api/auth/public-key");
  if (!res.ok) throw new Error("Failed to fetch encryption key");

  const { publicKey: base64 } = await res.json();

  const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  _cachedPublicKey = await crypto.subtle.importKey(
    "spki",
    der,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  return _cachedPublicKey;
}

/**
 * Encrypts the given password with the server's RSA public key.
 * Returns a base64-encoded ciphertext string ready for the request body.
 */
export async function encryptPassword(password: string): Promise<string> {
  const publicKey = await fetchAndImportPublicKey();
  const encoded = new TextEncoder().encode(password);
  const ciphertext = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, encoded);
  return btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
}
