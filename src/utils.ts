import { STORAGE_DEFAULTS, type StorageData } from "./types.js";

/**
 * Normalize a domain: strip protocol, www prefix, paths, and lowercase.
 * "https://www.Facebook.com/page" → "facebook.com"
 */
export function normalizeDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  // Strip protocol
  domain = domain.replace(/^https?:\/\//, "");
  // Strip path/query/hash
  domain = domain.split("/")[0].split("?")[0].split("#")[0];
  // Strip www prefix — we block at the root domain level
  domain = domain.replace(/^www\./, "");
  return domain;
}

/**
 * Generate a stable numeric rule ID from a domain string.
 * DNR requires positive integers; we hash the domain to one.
 */
export function domainToRuleId(domain: string): number {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) + 1; // ensure positive
}

/**
 * Read all storage data, filling in defaults for missing keys.
 */
export async function getStorageData(): Promise<StorageData> {
  const data = await chrome.storage.local.get(
    STORAGE_DEFAULTS as unknown as Record<string, unknown>,
  );
  return data as unknown as StorageData;
}

/**
 * Format seconds remaining as "M:SS".
 */
export function formatTimeRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
