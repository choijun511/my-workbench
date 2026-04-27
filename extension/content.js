// Bridge between the page (my-workbench) and the extension service worker.
// The page posts { target: 'mwb-extension', type: ..., requestId } and we reply
// with { source: 'mwb-extension', type: ..., requestId, ... } so the page can
// match request/response.

const VERSION = '1.0.0';

function isContextValid() {
  // chrome.runtime.id is undefined after the extension is reloaded/uninstalled
  // while an old content script is still in the page.
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

function postToPage(payload) {
  try {
    window.postMessage(payload, '*');
  } catch (_) {}
}

function announce() {
  if (!isContextValid()) return;
  postToPage({ source: 'mwb-extension', type: 'ready', version: VERSION });
}

announce();
window.addEventListener('pageshow', announce);

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const msg = e.data;
  if (!msg || msg.target !== 'mwb-extension') return;

  if (msg.type === 'ping') {
    postToPage({ source: 'mwb-extension', type: 'pong', requestId: msg.requestId, version: VERSION });
    return;
  }

  if (msg.type === 'capture') {
    if (!isContextValid()) {
      postToPage({
        source: 'mwb-extension',
        type: 'capture-result',
        requestId: msg.requestId,
        ok: false,
        error: '扩展已更新，请刷新页面',
      });
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: 'capture' }, (response) => {
        const err = chrome.runtime.lastError;
        if (err || !response) {
          postToPage({
            source: 'mwb-extension',
            type: 'capture-result',
            requestId: msg.requestId,
            ok: false,
            error: (err && err.message) || 'no response',
          });
          return;
        }
        postToPage({ source: 'mwb-extension', type: 'capture-result', requestId: msg.requestId, ...response });
      });
    } catch (e) {
      postToPage({
        source: 'mwb-extension',
        type: 'capture-result',
        requestId: msg.requestId,
        ok: false,
        error: e && e.message ? e.message : '扩展上下文已失效，请刷新页面',
      });
    }
  }
});
