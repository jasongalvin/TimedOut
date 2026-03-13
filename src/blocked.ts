import type { Message, MessageResponse } from "./types.js";
import { TIMER_PRESETS } from "./types.js";
import { formatTimeRemaining } from "./utils.js";

const params = new URLSearchParams(window.location.search);
const domain = params.get("domain") ?? "unknown";

// --- DOM Elements ---

const domainEl = document.getElementById("domain") as HTMLElement;
const presetsEl = document.getElementById("presets") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

domainEl.textContent = domain;

// --- Build Preset Buttons ---

function sendMessage(msg: Message): Promise<MessageResponse> {
  return chrome.runtime.sendMessage(msg);
}

function createPresetButton(minutes: number): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = `${minutes} min`;
  btn.className = "preset-btn";
  btn.addEventListener("click", () => startUnlock(minutes * 60));
  return btn;
}

TIMER_PRESETS.forEach((m) => presetsEl.appendChild(createPresetButton(m)));

// --- Unlock ---

async function startUnlock(durationSeconds: number): Promise<void> {
  statusEl.textContent = "Unlocking...";

  const response = await sendMessage({
    type: "START_TIMER",
    domain,
    duration: durationSeconds,
  });

  if (response.success) {
    // Redirect to the originally requested site
    window.location.href = `https://${domain}`;
  } else {
    statusEl.textContent = "Something went wrong. Try again.";
  }
}

// --- Countdown if Already Unlocked (edge case: navigated back to blocked.html) ---

async function checkExistingTimer(): Promise<void> {
  const response = await sendMessage({ type: "GET_STATE" });
  if (!response.success || !("data" in response)) return;

  const timer = response.data.timers[domain];
  if (!timer) return;

  const remaining = timer.expiresAt - Date.now();
  if (remaining <= 0) return;

  statusEl.textContent = `Already unlocked — ${formatTimeRemaining(remaining)} remaining`;
  presetsEl.style.display = "none";
}

checkExistingTimer();
