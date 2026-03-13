import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMocks } from "./chrome.mock.js";
import {
  normalizeDomain,
  domainToRuleId,
  getStorageData,
  formatTimeRemaining,
} from "../src/utils.js";

beforeEach(() => {
  resetMocks();
  installChromeMock();
});

describe("normalizeDomain", () => {
  it("strips protocol", () => {
    expect(normalizeDomain("https://reddit.com")).toBe("reddit.com");
    expect(normalizeDomain("http://reddit.com")).toBe("reddit.com");
  });

  it("strips www prefix", () => {
    expect(normalizeDomain("www.facebook.com")).toBe("facebook.com");
  });

  it("strips paths, query strings, and hashes", () => {
    expect(normalizeDomain("reddit.com/r/all?sort=new#top")).toBe("reddit.com");
  });

  it("lowercases", () => {
    expect(normalizeDomain("Reddit.COM")).toBe("reddit.com");
  });

  it("handles full URLs", () => {
    expect(normalizeDomain("https://www.Facebook.com/page")).toBe(
      "facebook.com"
    );
  });

  it("trims whitespace", () => {
    expect(normalizeDomain("  reddit.com  ")).toBe("reddit.com");
  });
});

describe("domainToRuleId", () => {
  it("returns a positive integer", () => {
    const id = domainToRuleId("facebook.com");
    expect(id).toBeGreaterThan(0);
    expect(Number.isInteger(id)).toBe(true);
  });

  it("returns the same ID for the same domain", () => {
    expect(domainToRuleId("reddit.com")).toBe(domainToRuleId("reddit.com"));
  });

  it("returns different IDs for different domains", () => {
    expect(domainToRuleId("reddit.com")).not.toBe(
      domainToRuleId("facebook.com")
    );
  });
});

describe("getStorageData", () => {
  it("returns defaults when storage is empty", async () => {
    const data = await getStorageData();
    expect(data.blacklist).toEqual([]);
    expect(data.timers).toEqual({});
    expect(data.settings.defaultDuration).toBe(300);
  });
});

describe("formatTimeRemaining", () => {
  it("formats full minutes", () => {
    expect(formatTimeRemaining(5 * 60 * 1000)).toBe("5:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatTimeRemaining(90_000)).toBe("1:30");
  });

  it("pads seconds", () => {
    expect(formatTimeRemaining(65_000)).toBe("1:05");
  });

  it("shows 0:00 for zero or negative", () => {
    expect(formatTimeRemaining(0)).toBe("0:00");
    expect(formatTimeRemaining(-1000)).toBe("0:00");
  });
});
