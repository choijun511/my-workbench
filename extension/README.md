# My Workbench Capture (Chrome Extension)

A tiny browser extension that adds two capabilities to [my-workbench](https://my-workbench.onrender.com):

1. **Auto AI Insight on dashboards** — when you view a 风神 panel inside my-workbench, the extension takes a full-page screenshot (via `chrome.debugger`) and feeds it to Gemini for an automatic insight, no permission popups.
2. **One-click decision capture from any AI chat** — highlight a stretch of conversation on claude.ai / chatgpt.com / gemini.google.com / anywhere, press **Alt+Shift+D** (or click the extension icon), and it gets POSTed to my-workbench, structured by Gemini, and saved as a decision record.

## How it works

**Insight path**: my-workbench `postMessage` → content script → service worker `chrome.debugger` → returns base64 JPEG → my-workbench → Gemini.

**Decision path**: hotkey/icon → service worker → `chrome.scripting.executeScript` reads `window.getSelection()` from the active tab → POST to `https://my-workbench.onrender.com/api/decisions/capture` → toast renders in the source page with title + confidence + a link to your decisions list.

The extension never stores or transmits data on its own — it's just a transport between the active tab and your my-workbench backend.

## Install (developer mode)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. Open my-workbench. The "AI Insight" card on the 风神看板 page should show "扩展已连接".

When the extension is updated (e.g. after `git pull`), click the reload icon on the extension card in `chrome://extensions`.

## Permissions explained

- `tabs` + `host_permissions: ["<all_urls>"]`: Chrome's `captureVisibleTab` requires either `<all_urls>` or `activeTab`, and decision capture needs to read `window.getSelection()` on whichever tab you're on.
- `scripting`: lets the service worker inject a one-off snippet to read the selection and render the toast.
- `debugger`: only used for full-page screenshots of dashboards. Triggers the yellow "扩展正在调试此浏览器" banner for a few hundred ms; the extension detaches as soon as the screenshot returns.

In practice the extension only acts on a tab when **you** click its icon, press the shortcut, or are interacting with my-workbench. No analytics, no storage, no remote calls of its own.

## Files

- `manifest.json` — MV3 manifest
- `background.js` — service worker, owns `captureVisibleTab`
- `content.js` — runs on my-workbench pages, bridges page `postMessage` ↔ background `chrome.runtime.sendMessage`
