import type { Message, MessageResponse } from "./types.js";
import { domainToRuleId, getStorageData, normalizeDomain } from "./utils.js";

// --- DNR Rule Management ---

function makeRedirectRule(
  domain: string
): chrome.declarativeNetRequest.Rule {
  const blockedUrl = chrome.runtime.getURL(
    `blocked.html?domain=${encodeURIComponent(domain)}`
  );
  return {
    id: domainToRuleId(domain),
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      redirect: { url: blockedUrl },
    },
    condition: {
      requestDomains: [domain], // automatically matches all subdomains
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
  message: Message
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

    case "UPDATE_SETTINGS":
      await chrome.storage.local.set({ settings: message.settings });
      return { success: true };

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

// --- Event Listeners ---

chrome.alarms.onAlarm.addListener(onAlarmFired);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // keep message channel open for async response
});

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
