/**
 * Lightweight chrome.* API mock for testing.
 * Only stubs the APIs we actually use.
 */

import { vi } from "vitest";

type StorageData = Record<string, unknown>;
type AlarmMap = Record<string, chrome.alarms.Alarm>;
type Rule = chrome.declarativeNetRequest.Rule;

let store: StorageData = {};
let alarms: AlarmMap = {};
let rules: Rule[] = [];
let alarmListener: ((alarm: chrome.alarms.Alarm) => void) | null = null;

export function resetMocks() {
  store = {};
  alarms = {};
  rules = [];
  alarmListener = null;
}

/** Fire an alarm by name (simulates chrome.alarms triggering). */
export function fireAlarm(name: string) {
  const alarm = alarms[name];
  if (alarm && alarmListener) {
    delete alarms[name];
    alarmListener(alarm);
  }
}

export function getStore() {
  return store;
}

export function getRules() {
  return rules;
}

export const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (defaults?: StorageData) => {
        return { ...defaults, ...store };
      }),
      set: vi.fn(async (items: StorageData) => {
        Object.assign(store, items);
      }),
    },
  },

  alarms: {
    create: vi.fn(async (name: string, info: { when: number }) => {
      alarms[name] = { name, scheduledTime: info.when };
    }),
    clear: vi.fn(async (name: string) => {
      delete alarms[name];
      return true;
    }),
    onAlarm: {
      addListener: vi.fn((cb: (alarm: chrome.alarms.Alarm) => void) => {
        alarmListener = cb;
      }),
    },
  },

  declarativeNetRequest: {
    updateDynamicRules: vi.fn(
      async (options: { removeRuleIds?: number[]; addRules?: Rule[] }) => {
        if (options.removeRuleIds) {
          rules = rules.filter((r) => !options.removeRuleIds!.includes(r.id));
        }
        if (options.addRules) {
          rules.push(...options.addRules);
        }
      }
    ),
    getDynamicRules: vi.fn(async () => [...rules]),
    RuleActionType: { REDIRECT: "redirect" as const },
    ResourceType: { MAIN_FRAME: "main_frame" as const },
  },

  tabs: {
    query: vi.fn(async () => []),
    update: vi.fn(async () => {}),
  },

  action: {
    setBadgeText: vi.fn(async () => {}),
    setBadgeBackgroundColor: vi.fn(async () => {}),
  },

  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
    onMessage: {
      addListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
};

/** Install the mock as the global `chrome` object. */
export function installChromeMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).chrome = chromeMock;
}
