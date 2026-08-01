#!/usr/bin/env node
// Sign a release of the OpenCairn PWA: hash every file in sw.js's SHELL precache
// list, bundle the hashes + sw.js's VERSION into a manifest, sign the manifest
// with the project's private key, and write pwa/release.json.
//
// Run this before every deploy, after bumping VERSION in sw.js:
//   node scripts/sign_release.mjs
//
// Requires pwa/scripts/.release-private-key.json (see keygen.mjs — run that once
// first). The signature is verified client-side by sw.js before it will accept
// a new version — see the "signed update" comment block there.
import { webcrypto } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PWA_DIR = path.join(HERE, '..');
const SW_PATH = path.join(PWA_DIR, 'sw.js');
const PRIV_PATH = path.join(HERE, '.release-private-key.json');
const OUT_PATH = path.join(PWA_DIR, 'release.json');

if (!existsSync(PRIV_PATH)) {
  console.error('No private key at %s — run `node scripts/keygen.mjs` first.', PRIV_PATH);
  process.exit(1);
}

// Deterministic JSON: object keys sorted at every level, so the browser (sw.js)
// reproduces byte-identical bytes from the same manifest object and the
// signature verifies. Keep this function IN SYNC with the copy in sw.js.
function canonicalize(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function extractVersion(swSrc) {
  const m = swSrc.match(/const VERSION = '([^']+)'/);
  if (!m) throw new Error('Could not find `const VERSION = \'...\'` in sw.js');
  return m[1];
}

function extractShell(swSrc) {
  const start = swSrc.indexOf('const SHELL = [');
  if (start === -1) throw new Error('Could not find `const SHELL = [` in sw.js');
  const end = swSrc.indexOf('];', start);
  const body = swSrc.slice(start, end);
  const paths = [];
  for (const m of body.matchAll(/'([^']+)'/g)) paths.push(m[1]);
  return paths;
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function main() {
  const swSrc = readFileSync(SW_PATH, 'utf-8');
  const version = extractVersion(swSrc);
  const shellPaths = extractShell(swSrc);

  const files = {};
  for (const rel of shellPaths) {
    if (rel === './' || rel === './index.html') {
      // Both resolve to the same served document; hash the actual file once
      // under its real name and mirror it for './' so the SW's per-file
      // integrity check (which fetches each SHELL entry literally) still
      // has something to compare against for the '/' entry.
      const filePath = path.join(PWA_DIR, 'index.html');
      files[rel] = sha256Hex(readFileSync(filePath));
      continue;
    }
    const filePath = path.join(PWA_DIR, rel.replace(/^\.\//, ''));
    if (!existsSync(filePath)) {
      console.error('SHELL lists %s but the file does not exist at %s', rel, filePath);
      process.exit(1);
    }
    files[rel] = sha256Hex(readFileSync(filePath));
  }

  const manifest = { version, builtAt: new Date().toISOString(), files };
  const canonical = canonicalize(manifest);
  const bytes = Buffer.from(canonical, 'utf-8');

  const privJwk = JSON.parse(readFileSync(PRIV_PATH, 'utf-8'));
  const privateKey = await webcrypto.subtle.importKey(
    'jwk', privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
  const sigBuf = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes);
  const signature = Buffer.from(sigBuf).toString('base64');

  writeFileSync(OUT_PATH, JSON.stringify({ manifest, signature }, null, 2) + '\n');
  console.log('Signed release v%s — %d files -> %s', version, Object.keys(files).length, OUT_PATH);
}

main();
