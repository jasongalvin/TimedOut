export interface TimerInfo {
  expiresAt: number;
}

export interface Settings {
  defaultDuration: number; // seconds
}

export interface StorageData {
  blacklist: string[];
  timers: Record<string, TimerInfo>;
  settings: Settings;
}

// Messages between popup/blocked page and background
export type Message =
  | { type: "ADD_DOMAIN"; domain: string }
  | { type: "REMOVE_DOMAIN"; domain: string }
  | { type: "START_TIMER"; domain: string; duration: number }
  | { type: "GET_STATE" }
  | { type: "GET_ORIGINAL_URL" }
  | { type: "UPDATE_SETTINGS"; settings: Settings };

export type MessageResponse =
  | { success: true }
  | { success: true; data: StorageData }
  | { success: true; originalUrl: string | null }
  | { success: false; error: string };

export const TIMER_PRESETS = [2, 5, 10, 15] as const; // minutes

export const DEFAULT_SETTINGS: Settings = {
  defaultDuration: 5 * 60, // 5 minutes in seconds
};

export const STORAGE_DEFAULTS: StorageData = {
  blacklist: [],
  timers: {},
  settings: DEFAULT_SETTINGS,
};
