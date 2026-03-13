import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  installChromeMock,
  resetMocks,
  chromeMock,
  fireAlarm,
  getStore,
  getRules,
} from "./chrome.mock.js";

// Helper: import background fresh (re-registers listeners on mock)
async function loadBackground() {
  vi.resetModules();
  await import("../src/background.js");
}

// Helper: invoke the last-registered message handler
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendMessage(msg: unknown): Promise<any> {
  const handler =
    chromeMock.runtime.onMessage.addListener.mock.calls.at(-1)?.[0];
  if (!handler) throw new Error("No message handler registered");
  return new Promise((resolve) => handler(msg, {}, resolve));
}

beforeEach(async () => {
  resetMocks();
  installChromeMock();
  await loadBackground();
});

describe("domain management", () => {
  it("adds a domain to blacklist and creates a DNR rule", async () => {
    await sendMessage({ type: "ADD_DOMAIN", domain: "reddit.com" });

    expect(getStore().blacklist).toContain("reddit.com");
    expect(getRules().length).toBe(1);
    expect(getRules()[0].condition.urlFilter).toEqual("||reddit.com");
  });

  it("normalizes domains when adding", async () => {
    await sendMessage({
      type: "ADD_DOMAIN",
      domain: "https://www.Reddit.com/r/all",
    });

    expect(getStore().blacklist).toContain("reddit.com");
  });

  it("does not add duplicates", async () => {
    await sendMessage({ type: "ADD_DOMAIN", domain: "reddit.com" });
    await sendMessage({ type: "ADD_DOMAIN", domain: "reddit.com" });

    expect((getStore().blacklist as string[]).length).toBe(1);
  });

  it("removes a domain and its DNR rule", async () => {
    await sendMessage({ type: "ADD_DOMAIN", domain: "reddit.com" });
    await sendMessage({ type: "REMOVE_DOMAIN", domain: "reddit.com" });

    expect(getStore().blacklist).not.toContain("reddit.com");
    expect(getRules().length).toBe(0);
  });
});

describe("timer management", () => {
  it("starts a timer: removes block rule and sets alarm", async () => {
    await sendMessage({ type: "ADD_DOMAIN", domain: "reddit.com" });
    expect(getRules().length).toBe(1);

    await sendMessage({
      type: "START_TIMER",
      domain: "reddit.com",
      duration: 300,
    });

    // Block rule removed during unlock
    expect(getRules().length).toBe(0);
    // Timer stored
    expect(getStore().timers).toHaveProperty("reddit.com");
    // Alarm created
    expect(chromeMock.alarms.create).toHaveBeenCalledWith(
      "reddit.com",
      expect.objectContaining({ when: expect.any(Number) })
    );
  });

  it("re-blocks when alarm fires", async () => {
    await sendMessage({ type: "ADD_DOMAIN", domain: "reddit.com" });
    await sendMessage({
      type: "START_TIMER",
      domain: "reddit.com",
      duration: 300,
    });
    expect(getRules().length).toBe(0);

    fireAlarm("reddit.com");
    // Give async handlers time to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(getRules().length).toBe(1);
    expect(getStore().timers).not.toHaveProperty("reddit.com");
  });
});

describe("GET_STATE", () => {
  it("returns current storage data", async () => {
    await sendMessage({ type: "ADD_DOMAIN", domain: "facebook.com" });
    const response = await sendMessage({ type: "GET_STATE" });

    expect(response.success).toBe(true);
    expect(response.data.blacklist).toContain("facebook.com");
  });
});

describe("UPDATE_SETTINGS", () => {
  it("persists new settings", async () => {
    await sendMessage({
      type: "UPDATE_SETTINGS",
      settings: { defaultDuration: 600 },
    });

    expect(getStore().settings).toEqual({ defaultDuration: 600 });
  });
});
