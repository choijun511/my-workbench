# My Workbench Capture (Chrome Extension)

A tiny browser extension that lets [my-workbench](https://my-workbench.onrender.com) capture the active tab so its AI Insight feature can auto-analyze the dashboard you're viewing — no manual screenshots, no permission popups, no tab-share prompts.

## How it works

1. The extension listens for `postMessage` requests from `my-workbench.onrender.com` (or `localhost:5173` in dev).
2. When my-workbench asks for a capture, the extension's service worker calls `chrome.tabs.captureVisibleTab()` and returns a base64 JPEG.
3. my-workbench posts the image to its backend, which runs Gemini and stores the insight.

The extension never sends data anywhere itself — it only hands the screenshot back to the my-workbench tab that asked for it.

## Install (developer mode)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. Open my-workbench. The "AI Insight" card on the 风神看板 page should show "扩展已连接".

When the extension is updated (e.g. after `git pull`), click the reload icon on the extension card in `chrome://extensions`.

## Permissions explained

- `tabs` + `host_permissions` for `my-workbench.onrender.com` and `localhost:5173`: needed to call `captureVisibleTab` for those origins.
- No `<all_urls>`, no analytics, no storage. The extension can only act when you're on my-workbench.

## Files

- `manifest.json` — MV3 manifest
- `background.js` — service worker, owns `captureVisibleTab`
- `content.js` — runs on my-workbench pages, bridges page `postMessage` ↔ background `chrome.runtime.sendMessage`
