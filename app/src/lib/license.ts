/**
 * Offline license-key validation + activation state.
 *
 * Keys look like  ROBO-XXXX-XXXX-CCCC  where the last group is a checksum of
 * the serial. This validates fully offline (our requirement: works in the box,
 * no internet) and gives the real activation UX.
 *
 * SECURITY NOTE — the checksum proves a key is well-formed, not that RoboStore
 * issued it (a determined user could forge one). For production, keep this
 * function as the single seam and swap the checksum for an Ed25519/ECDSA
 * signature check against an embedded public key — ideally verified in the Rust
 * (Tauri) layer where it's harder to patch. Key minting lives in
 * scripts/mint-license.mjs and uses the identical algorithm.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

const CHARSET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32, no I/L/O/U
const GROUP = /^[0-9A-HJKMNP-TV-Z]{4}$/;

/** FNV-1a 32-bit hash of the serial. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 20-bit checksum → 4 base32 chars. Shared by validation + minting. */
export function checksumFor(serial: string): string {
  let v = fnv1a(serial) & 0xfffff; // 20 bits
  let out = "";
  for (let i = 0; i < 4; i++) {
    out = CHARSET[v & 0x1f] + out;
    v >>= 5;
  }
  return out;
}

export function normalizeKey(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export interface LicenseResult {
  ok: boolean;
  reason?: string;
}

export function validateLicenseKey(input: string): LicenseResult {
  const key = normalizeKey(input);
  const parts = key.split("-");
  if (parts.length !== 4 || parts[0] !== "ROBO") {
    return { ok: false, reason: "Keys look like ROBO-XXXX-XXXX-XXXX." };
  }
  const [, a, b, c] = parts;
  if (!GROUP.test(a) || !GROUP.test(b) || !GROUP.test(c)) {
    return { ok: false, reason: "That doesn’t look like a valid key." };
  }
  if (checksumFor(a + b) !== c) {
    return { ok: false, reason: "This key isn’t recognized. Check for typos." };
  }
  return { ok: true };
}

interface LicenseState {
  licensed: boolean;
  key: string;
  activatedAt: number | null;
  activate: (key: string) => LicenseResult;
  deactivate: () => void;
}

export const useLicense = create<LicenseState>()(
  persist(
    (set) => ({
      licensed: false,
      key: "",
      activatedAt: null,
      activate: (key) => {
        const res = validateLicenseKey(key);
        if (res.ok) set({ licensed: true, key: normalizeKey(key), activatedAt: Date.now() });
        return res;
      },
      deactivate: () => set({ licensed: false, key: "", activatedAt: null }),
    }),
    { name: "studio.license" },
  ),
);
