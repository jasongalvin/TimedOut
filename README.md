# TimedOut

A Chrome extension that blocks distracting websites and lets you temporarily unlock them with a timer.

Add domains to your blocklist — any visit redirects to a "blocked" page. From there, start a timed unlock (2, 5, 10, or 15 minutes) to browse the site. When time's up, it's blocked again.

## Features

- Block any domain (automatically includes subdomains)
- Timed unlocks with preset durations
- Timers survive browser restarts (uses `chrome.alarms`, not `setTimeout`)
- Popup for managing blocked sites and viewing active timers
- Dark theme UI

## Install

```bash
pnpm install
pnpm approve-builds    # approve esbuild postinstall
pnpm run build
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Development

```bash
pnpm run watch         # rebuild on file changes
```

## Tech

Chrome Extension Manifest V3, TypeScript, esbuild. No frameworks — vanilla TS with direct DOM manipulation.

## License

[MIT](LICENSE)
