// Service worker — captures the active tab on demand.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'capture') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, (dataUrl) => {
      const err = chrome.runtime.lastError;
      if (err || !dataUrl) {
        sendResponse({ ok: false, error: (err && err.message) || 'no data url' });
        return;
      }
      const comma = dataUrl.indexOf(',');
      const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      sendResponse({ ok: true, image_base64: b64, image_mime: 'image/jpeg' });
    });
    return true; // signal async response
  }
});
