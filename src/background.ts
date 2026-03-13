import type { Message, MessageResponse } from "./types.js";
import { domainToRuleId, getStorageData, normalizeDomain } from "./utils.js";

// --- DNR Rule Management ---

function makeRedirectRule(
  domain: string
): chrome.declarativeNetRequest.Rule {
  return {
    id: domainToRuleId(domain),
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      redirect: {
        extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}`,
      },
    },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: [
        chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
      ],
    },
  };
}

async function addBlockRule(domain: string): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [makeRedirectRule(domain)],
    removeRuleIds: [domainToRuleId(domain)],
  });
  await redirectOpenTabs(domain);
}

/** Redirect any open tabs matching the domain to the blocked page. */
async function redirectOpenTabs(domain: string): Promise<void> {
  const blockedUrl = chrome.runtime.getURL(
    `blocked.html?domain=${encodeURIComponent(domain)}`
  );
  const tabs = await chrome.tabs.query({ url: `*://*.${domain}/*` });
  // Also match the bare domain (no subdomain)
  const bareTabs = await chrome.tabs.query({ url: `*://${domain}/*` });
  const allTabs = new Map<number, chrome.tabs.Tab>();
  for (const t of [...tabs, ...bareTabs]) {
    if (t.id != null) allTabs.set(t.id, t);
  }
  for (const [tabId, tab] of allTabs) {
    // Store the original URL so blocked.html can redirect back to it
    if (tab.url) {
      await chrome.storage.session.set({ [`originalUrl:${tabId}`]: tab.url });
    }
    chrome.tabs.update(tabId, { url: blockedUrl });
  }
}

async function removeBlockRule(domain: string): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [domainToRuleId(domain)],
  });
}

// --- Domain Management ---

async function addDomain(domain: string): Promise<void> {
  const data = await getStorageData();
  const normalized = normalizeDomain(domain);
  if (data.blacklist.includes(normalized)) return;

  data.blacklist.push(normalized);
  await chrome.storage.local.set({ blacklist: data.blacklist });
  await addBlockRule(normalized);
}

async function removeDomain(domain: string): Promise<void> {
  const data = await getStorageData();
  const normalized = normalizeDomain(domain);

  data.blacklist = data.blacklist.filter((d) => d !== normalized);
  await chrome.storage.local.set({ blacklist: data.blacklist });
  await removeBlockRule(normalized);

  // Clean up any active timer for this domain
  if (data.timers[normalized]) {
    await chrome.alarms.clear(normalized);
    delete data.timers[normalized];
    await chrome.storage.local.set({ timers: data.timers });
  }
}

// --- Timer Management ---

async function startTimer(
  domain: string,
  durationSeconds: number
): Promise<void> {
  const data = await getStorageData();
  const normalized = normalizeDomain(domain);
  const expiresAt = Date.now() + durationSeconds * 1000;

  // Store timer and remove block
  data.timers[normalized] = { expiresAt };
  await chrome.storage.local.set({ timers: data.timers });
  await removeBlockRule(normalized);

  // Set alarm (chrome.alarms uses minutes)
  await chrome.alarms.create(normalized, {
    when: expiresAt,
  });

  // Update badge
  updateBadge();
}

async function onAlarmFired(alarm: chrome.alarms.Alarm): Promise<void> {
  const domain = alarm.name;
  const data = await getStorageData();

  // Clean up timer
  delete data.timers[domain];
  await chrome.storage.local.set({ timers: data.timers });

  // Re-block if still on blacklist
  if (data.blacklist.includes(domain)) {
    await addBlockRule(domain);
  }

  updateBadge();
}

// --- Badge ---

async function updateBadge(): Promise<void> {
  const data = await getStorageData();
  const activeCount = Object.keys(data.timers).length;
  await chrome.action.setBadgeText({
    text: activeCount > 0 ? String(activeCount) : "",
  });
  await chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });
}

// --- Message Handler ---

async function handleMessage(
  message: Message,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  switch (message.type) {
    case "ADD_DOMAIN":
      await addDomain(message.domain);
      return { success: true };

    case "REMOVE_DOMAIN":
      await removeDomain(message.domain);
      return { success: true };

    case "START_TIMER":
      await startTimer(message.domain, message.duration);
      return { success: true };

    case "GET_STATE": {
      const data = await getStorageData();
      return { success: true, data };
    }

    case "GET_ORIGINAL_URL": {
      const tabId = sender.tab?.id;
      if (tabId == null) return { success: true, originalUrl: null };
      const key = `originalUrl:${tabId}`;
      const result = await chrome.storage.session.get(key);
      const url = (result[key] as string) ?? null;
      // Clean up after reading
      if (url) await chrome.storage.session.remove(key);
      return { success: true, originalUrl: url };
    }

    case "UPDATE_SETTINGS":
      await chrome.storage.local.set({ settings: message.settings });
      return { success: true };

    case "EXTEND_TIMER": {
      const data = await getStorageData();
      const normalized = normalizeDomain(message.domain);
      const timer = data.timers[normalized];
      if (!timer) return { success: false, error: "No active timer" };

      timer.expiresAt += message.additionalSeconds * 1000;
      data.timers[normalized] = timer;
      await chrome.storage.local.set({ timers: data.timers });

      // Recreate alarm with new expiration
      await chrome.alarms.clear(normalized);
      await chrome.alarms.create(normalized, { when: timer.expiresAt });

      return { success: true };
    }

    default:
      return { success: false, error: "Unknown message type" };
  }
}

// --- Init: Restore DNR Rules on Service Worker Start ---

async function init(): Promise<void> {
  const data = await getStorageData();
  const now = Date.now();

  // Clean up expired timers
  for (const [domain, timer] of Object.entries(data.timers)) {
    if (timer.expiresAt <= now) {
      delete data.timers[domain];
    }
  }
  await chrome.storage.local.set({ timers: data.timers });

  // Rebuild DNR rules: block all blacklisted domains except those with active timers
  const activeTimerDomains = new Set(Object.keys(data.timers));
  const rulesToAdd = data.blacklist
    .filter((d) => !activeTimerDomains.has(d))
    .map(makeRedirectRule);

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map((r) => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: rulesToAdd,
  });

  updateBadge();
}

// --- Original URL Tracking ---
// DNR redirects lose the original URL. We use webNavigation to capture it
// before the redirect, storing it in session storage keyed by tab ID.
// For redirect services (e.g. Gmail's google.com/url?q=...), we extract
// the destination URL from the query string since onBeforeNavigate won't
// fire for the final URL — DNR intercepts it at the network level first.

function extractRedirectDestination(navUrl: URL): string | null {
  // Google redirect: google.com/url?q=<destination>
  if (
    (navUrl.hostname === "www.google.com" ||
      navUrl.hostname === "google.com") &&
    navUrl.pathname === "/url"
  ) {
    return navUrl.searchParams.get("q") || navUrl.searchParams.get("url");
  }
  return null;
}

function isBlockedDomain(
  hostname: string,
  blacklist: string[]
): boolean {
  return findBlockedDomain(hostname, blacklist) !== null;
}

function findBlockedDomain(
  hostname: string,
  blacklist: string[]
): string | null {
  const bare = hostname.replace(/^www\./, "");
  return blacklist.find(
    (d) => bare === d || bare.endsWith(`.${d}`)
  ) ?? null;
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only track top-level navigations
  if (details.frameId !== 0) return;

  const data = await getStorageData();
  const navUrl = new URL(details.url);

  // Direct navigation to a blocked domain
  if (isBlockedDomain(navUrl.hostname, data.blacklist)) {
    await chrome.storage.session.set({
      [`originalUrl:${details.tabId}`]: details.url,
    });
    return;
  }

  // Redirect service (e.g. Gmail link) — extract final destination
  const destination = extractRedirectDestination(navUrl);
  if (destination) {
    try {
      const destUrl = new URL(destination);
      if (isBlockedDomain(destUrl.hostname, data.blacklist)) {
        await chrome.storage.session.set({
          [`originalUrl:${details.tabId}`]: destination,
        });
      }
    } catch {
      // malformed destination URL, ignore
    }
  }
});

// --- Fallback: catch blocked domains that DNR missed ---
// If DNR redirected, onCommitted fires with the chrome-extension:// URL (skipped).
// If DNR missed it (e.g. short domains like x.com), onCommitted fires with the
// original https:// URL and we redirect via tabs.update.

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;

  try {
    const navUrl = new URL(details.url);
    if (!navUrl.protocol.startsWith("http")) return;

    const data = await getStorageData();
    const matchedDomain = findBlockedDomain(navUrl.hostname, data.blacklist);
    if (!matchedDomain) return;

    // Don't redirect if there's an active timer
    if (data.timers[matchedDomain]) return;

    await chrome.storage.session.set({
      [`originalUrl:${details.tabId}`]: details.url,
    });

    const blockedUrl = chrome.runtime.getURL(
      `blocked.html?domain=${encodeURIComponent(matchedDomain)}`
    );
    chrome.tabs.update(details.tabId, { url: blockedUrl });
  } catch {
    // ignore invalid URLs
  }
});

// --- Event Listeners ---

chrome.alarms.onAlarm.addListener(onAlarmFired);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message, _sender).then(sendResponse);
  return true; // keep message channel open for async response
});

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
