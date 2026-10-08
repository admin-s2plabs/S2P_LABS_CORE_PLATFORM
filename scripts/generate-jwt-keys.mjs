// Prints a fresh RS256 key pair as single-line env values (newlines escaped as \n),
// ready to paste into JWT_PRIVATE_KEY / JWT_PUBLIC_KEY on Render or any host.
// Usage: node scripts/generate-jwt-keys.mjs
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const oneLine = (pem) => pem.trim().replace(/\n/g, "\\n");
console.log(`JWT_PRIVATE_KEY=${oneLine(privateKey)}`);
console.log();
console.log(`JWT_PUBLIC_KEY=${oneLine(publicKey)}`);
