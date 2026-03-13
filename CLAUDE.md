# Site Timer Blocker — Chrome Extension (MV3, TypeScript)

## What it does
Maintains a blacklist of domains (e.g. facebook.com, reddit.com). Visiting a blacklisted site shows a blocked page. User can start a timer (default 5 min) to temporarily unlock the site. When the timer expires, the site is blocked again.

## Architecture

### Block mechanism
Use `chrome.declarativeNetRequest` (DNR) to dynamically add/remove redirect rules. Blacklisted domains redirect to the extension's `blocked.html`. When a timer starts, remove the DNR rule for that domain. When the timer expires, re-add it.

### Timer mechanism
Use `chrome.alarms` — one alarm per active unlock, named by domain. Alarms survive service worker termination; `setTimeout` does not. On alarm fire, re-add the DNR block rule for that domain.

### Storage (chrome.storage.local)
- `blacklist: string[]` — blocked domains
- `timers: Record<string, { expiresAt: number }>` — active unlock sessions
- `settings: { defaultDuration: number }` — default timer in seconds

No in-memory state — the MV3 service worker gets terminated after ~30s of inactivity, so all state must be read from storage on each wake-up.

## Components

**background.ts** — Service worker. Manages DNR rules, listens for `chrome.alarms.onAlarm` to re-block expired timers, handles messages from popup and blocked page (start timer, add/remove domain).

**blocked.html + blocked.ts** — Full-page redirect target. Shows which domain is blocked, lets user start a timer with editable duration. Sends message to background, then redirects to the original URL via a query param passed in the redirect rule.

**popup.html + popup.ts** — Extension popup. Add/remove domains from blacklist, view active timers with countdowns, adjust default duration.

**types.ts** — Shared type definitions.

**utils.ts** — Domain matching/normalization helpers.

## File structure
```
src/
  background.ts
  blocked.ts
  popup.ts
  types.ts
  utils.ts
static/
  blocked.html
  popup.html
  manifest.json
  icons/
tsconfig.json
build.ts            # esbuild bundler script
```

## Manifest permissions
`storage`, `alarms`, `declarativeNetRequest`, `declarativeNetRequestFeedback`, `tabs`, host permission `<all_urls>`.

## Build
ESM only throughout. `package.json` with `"type": "module"`, `tsconfig.json` with `"module": "ESNext"`, esbuild with `format: "esm"`. Manifest declares `"type": "module"` in the background service worker config. No CommonJS anywhere.

esbuild with a simple build script. Separate entry points for background, blocked, popup. No framework — vanilla TS + direct DOM manipulation.

## Implementation order
1. Scaffold: manifest.json, tsconfig, esbuild build script, confirm extension loads in chrome://extensions
2. Storage layer: CRUD helpers for blacklist, timers, settings
3. DNR blocking: dynamically add redirect rules for each blacklisted domain → blocked.html (pass original URL as query param)
4. Blocked page: display blocked domain, unlock button, send message to background
5. Timer system: background receives unlock message → remove DNR rule, set chrome.alarm → on alarm fire, re-add DNR rule, clean up timer from storage
6. Popup: blacklist management UI, active timer countdowns, default duration setting
7. Polish: subdomain handling (block *.facebook.com), badge text showing remaining time, edge cases