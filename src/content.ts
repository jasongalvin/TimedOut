// Content script: floating countdown overlay on unblocked pages.
// Injected on all pages; exits immediately if no active timer for this domain.

async function main() {
  const hostname = window.location.hostname.replace(/^www\./, '').toLowerCase();

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  } catch {
    return; // extension context invalidated
  }
  if (!response?.success || !('data' in response)) return;

  // Find matching timer (exact or parent domain)
  const timers = response.data.timers as Record<string, { expiresAt: number }>;
  let matchedDomain: string | null = null;
  for (const d of Object.keys(timers)) {
    if (hostname === d || hostname.endsWith(`.${d}`)) {
      matchedDomain = d;
      break;
    }
  }
  if (!matchedDomain) return;

  let expiresAt = timers[matchedDomain].expiresAt;
  if (expiresAt - Date.now() <= 0) return;

  // --- Build widget in Shadow DOM ---

  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }
      .widget {
        background: rgba(15, 15, 19, 0.92);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 12px;
        padding: 10px 14px;
        color: #e4e4e7;
        display: flex;
        align-items: center;
        gap: 10px;
        user-select: none;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
      }
      .drag-handle {
        cursor: grab;
        display: flex;
        align-items: center;
        gap: 6px;
        color: #a1a1aa;
        padding: 4px 2px;
      }
      .drag-handle.dragging { cursor: grabbing; }
      .timer {
        font-size: 18px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: #a5b4fc;
        min-width: 40px;
        transition: color 0.3s;
      }
      .timer.urgent {
        color: #ef4444;
        animation: flash 1s ease-in-out infinite;
      }
      @keyframes flash {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      .add-btn {
        background: #1e1e2a;
        color: #e4e4e7;
        border: 1px solid #2e2e3a;
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.15s, border-color 0.15s;
      }
      .add-btn:hover {
        background: #6366f1;
        border-color: #6366f1;
        color: #fff;
      }
    </style>
    <div class="widget">
      <div class="drag-handle">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/>
        </svg>
      </div>
      <span class="timer"></span>
      <button class="add-btn">+30s</button>
    </div>
  `;

  document.body.appendChild(host);

  const widget = shadow.querySelector('.widget') as HTMLElement;
  const timerEl = shadow.querySelector('.timer') as HTMLElement;
  const addBtn = shadow.querySelector('.add-btn') as HTMLButtonElement;
  const dragHandle = shadow.querySelector('.drag-handle') as HTMLElement;

  // --- Countdown ---

  function formatTime(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function cleanup() {
    clearInterval(tickInterval);
    host.remove();
  }

  function tick() {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      cleanup();
      return;
    }
    timerEl.textContent = formatTime(remaining);
    timerEl.classList.toggle('urgent', remaining <= 30_000);
  }

  tick();
  const tickInterval = setInterval(tick, 1000);

  // --- Add 30s ---

  addBtn.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'EXTEND_TIMER',
        domain: matchedDomain,
        additionalSeconds: 30,
      });
      expiresAt += 30_000;
      tick();
    } catch {
      cleanup(); // extension context invalidated
    }
  });

  // --- Sync with storage changes ---

  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.timers) return;
    const newTimers = changes.timers.newValue as
      | Record<string, { expiresAt: number }>
      | undefined;
    if (!newTimers || !newTimers[matchedDomain!]) {
      cleanup();
      return;
    }
    expiresAt = newTimers[matchedDomain!].expiresAt;
    tick();
  });

  // --- Drag ---

  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  dragHandle.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    isDragging = true;
    dragHandle.classList.add('dragging');

    const rect = host.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    // Switch from bottom/right to top/left positioning
    host.style.top = `${rect.top}px`;
    host.style.left = `${rect.left}px`;
    host.style.bottom = 'auto';
    host.style.right = 'auto';
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();

    const x = Math.max(
      0,
      Math.min(e.clientX - offsetX, window.innerWidth - widget.offsetWidth),
    );
    const y = Math.max(
      0,
      Math.min(e.clientY - offsetY, window.innerHeight - widget.offsetHeight),
    );

    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    dragHandle.classList.remove('dragging');
  });
}

main();
