#!/usr/bin/env node
// One-time: generate the ECDSA P-256 keypair used to sign OpenCairn PWA releases.
//
// Run once ever (or when rotating keys):
//   node scripts/keygen.mjs
//
// Writes:
//   pwa/release-pubkey.json         — committed. sw.js fetches this to verify
//                                      signed releases (TOFU: trusted on first visit).
//   pwa/scripts/.release-private-key.json — gitignored. Required by sign_release.mjs
//                                      for every future release. BACK THIS UP —
//                                      losing it means no client that already trusts
//                                      the committed public key can ever verify a
//                                      future update again.
//
// Refuses to overwrite an existing keypair (use --force to rotate on purpose).
import { webcrypto } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB_PATH = path.join(HERE, '..', 'release-pubkey.json');
const PRIV_PATH = path.join(HERE, '.release-private-key.json');

const force = process.argv.includes('--force');

if (!force && (existsSync(PUB_PATH) || existsSync(PRIV_PATH))) {
  console.error('A keypair already exists (%s). Pass --force to overwrite/rotate.', PUB_PATH);
  process.exit(1);
}

const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);

const pubJwk = await webcrypto.subtle.exportKey('jwk', publicKey);
const privJwk = await webcrypto.subtle.exportKey('jwk', privateKey);

writeFileSync(PUB_PATH, JSON.stringify(pubJwk, null, 2) + '\n');
writeFileSync(PRIV_PATH, JSON.stringify(privJwk, null, 2) + '\n');

console.log('Wrote public key  -> %s (commit this)', PUB_PATH);
console.log('Wrote private key -> %s (DO NOT commit — gitignored; back it up somewhere safe)', PRIV_PATH);
