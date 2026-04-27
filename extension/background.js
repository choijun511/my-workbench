// Service worker — captures the active tab on demand.
//
// Primary path: chrome.debugger + Page.captureScreenshot with captureBeyondViewport:true
// to grab the FULL document height, not just the visible viewport.
// Fallback: chrome.tabs.captureVisibleTab if debugger attach fails (e.g. DevTools is open
// or the user has already attached a debugger session).

function captureViaDebugger(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      const attachErr = chrome.runtime.lastError;
      if (attachErr) {
        reject(new Error(attachErr.message || 'attach failed'));
        return;
      }
      chrome.debugger.sendCommand(
        { tabId },
        'Page.captureScreenshot',
        { format: 'jpeg', quality: 80, captureBeyondViewport: true },
        (result) => {
          const cmdErr = chrome.runtime.lastError;
          chrome.debugger.detach({ tabId }, () => {
            // ignore detach errors
            void chrome.runtime.lastError;
            if (cmdErr || !result || !result.data) {
              reject(new Error((cmdErr && cmdErr.message) || 'capture failed'));
              return;
            }
            resolve(result.data); // already base64, no data: prefix
          });
        }
      );
    });
  });
}

function captureViaTabs() {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, (dataUrl) => {
      const err = chrome.runtime.lastError;
      if (err || !dataUrl) {
        reject(new Error((err && err.message) || 'no data url'));
        return;
      }
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'capture') {
    const tabId = sender.tab && sender.tab.id;
    (async () => {
      try {
        let b64;
        let mode = 'fullpage';
        if (tabId != null) {
          try {
            b64 = await captureViaDebugger(tabId);
          } catch (e) {
            console.warn('[mwb] debugger capture failed, falling back:', e.message);
            b64 = await captureViaTabs();
            mode = 'viewport';
          }
        } else {
          b64 = await captureViaTabs();
          mode = 'viewport';
        }
        sendResponse({ ok: true, image_base64: b64, image_mime: 'image/jpeg', mode });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || 'capture failed' });
      }
    })();
    return true; // async response
  }
});
