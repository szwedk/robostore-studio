#!/usr/bin/env node
/**
 * Mint RoboStore Studio license keys (offline scheme).
 * Must stay in sync with app/src/lib/license.ts (same CHARSET + checksum).
 *
 *   node scripts/mint-license.mjs           # one key
 *   node scripts/mint-license.mjs 10         # ten keys
 *
 * Replace with signature-based minting (private key) when hardening.
 */
import crypto from "node:crypto";

const CHARSET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function checksumFor(serial) {
  let v = fnv1a(serial) & 0xfffff;
  let out = "";
  for (let i = 0; i < 4; i++) { out = CHARSET[v & 0x1f] + out; v >>= 5; }
  return out;
}
function group() {
  let s = "";
  for (let i = 0; i < 4; i++) s += CHARSET[crypto.randomInt(CHARSET.length)];
  return s;
}
function mint() {
  const a = group();
  const b = group();
  return `ROBO-${a}-${b}-${checksumFor(a + b)}`;
}

const n = Math.max(1, Number(process.argv[2] || 1));
for (let i = 0; i < n; i++) console.log(mint());
