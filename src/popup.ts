import type { Message, MessageResponse, StorageData } from "./types.js";
import { TIMER_PRESETS } from "./types.js";
import { formatTimeRemaining } from "./utils.js";

// --- DOM Elements ---

const domainInput = document.getElementById("domain-input") as HTMLInputElement;
const addBtn = document.getElementById("add-btn") as HTMLButtonElement;
const blacklistEl = document.getElementById("blacklist") as HTMLElement;
const timersEl = document.getElementById("timers") as HTMLElement;
const durationSelect = document.getElementById("default-duration") as HTMLSelectElement;

// --- Messaging ---

function sendMessage(msg: Message): Promise<MessageResponse> {
  return chrome.runtime.sendMessage(msg);
}

// --- Render ---

function renderBlacklist(data: StorageData): void {
  blacklistEl.innerHTML = "";

  if (data.blacklist.length === 0) {
    blacklistEl.innerHTML = '<p class="empty">No blocked sites yet.</p>';
    return;
  }

  for (const domain of data.blacklist) {
    const row = document.createElement("div");
    row.className = "list-item";

    const label = document.createElement("span");
    label.className = "domain-label";
    label.textContent = domain;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async () => {
      await sendMessage({ type: "REMOVE_DOMAIN", domain });
      refresh();
    });

    row.append(label, removeBtn);
    blacklistEl.appendChild(row);
  }
}

function renderTimers(data: StorageData): void {
  timersEl.innerHTML = "";
  const entries = Object.entries(data.timers);

  if (entries.length === 0) {
    timersEl.innerHTML = '<p class="empty">No active timers.</p>';
    return;
  }

  const now = Date.now();
  for (const [domain, timer] of entries) {
    const remaining = timer.expiresAt - now;
    if (remaining <= 0) continue;

    const row = document.createElement("div");
    row.className = "list-item";

    const label = document.createElement("span");
    label.className = "domain-label";
    label.textContent = domain;

    const time = document.createElement("span");
    time.className = "timer-remaining";
    time.textContent = formatTimeRemaining(remaining);

    row.append(label, time);
    timersEl.appendChild(row);
  }
}

function renderDurationSelect(data: StorageData): void {
  const currentMinutes = data.settings.defaultDuration / 60;
  durationSelect.innerHTML = "";

  for (const minutes of TIMER_PRESETS) {
    const option = document.createElement("option");
    option.value = String(minutes * 60);
    option.textContent = `${minutes} min`;
    option.selected = minutes === currentMinutes;
    durationSelect.appendChild(option);
  }
}

// --- State ---

async function refresh(): Promise<void> {
  const response = await sendMessage({ type: "GET_STATE" });
  if (!response.success || !("data" in response)) return;

  renderBlacklist(response.data);
  renderTimers(response.data);
  renderDurationSelect(response.data);
}

// --- Event Listeners ---

addBtn.addEventListener("click", async () => {
  const domain = domainInput.value.trim();
  if (!domain) return;

  await sendMessage({ type: "ADD_DOMAIN", domain });
  domainInput.value = "";
  refresh();
});

domainInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBtn.click();
});

durationSelect.addEventListener("change", async () => {
  await sendMessage({
    type: "UPDATE_SETTINGS",
    settings: { defaultDuration: Number(durationSelect.value) },
  });
});

// --- Init ---

refresh();

// Update timer countdowns every second
setInterval(refresh, 1000);
