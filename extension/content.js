// Bridge between the page (my-workbench) and the extension service worker.
// The page posts { target: 'mwb-extension', type: ..., requestId } and we reply
// with { source: 'mwb-extension', type: ..., requestId, ... } so the page can
// match request/response.

const VERSION = '1.0.0';

function announce() {
  window.postMessage({ source: 'mwb-extension', type: 'ready', version: VERSION }, '*');
}

// Announce on load and on bfcache restore.
announce();
window.addEventListener('pageshow', announce);

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const msg = e.data;
  if (!msg || msg.target !== 'mwb-extension') return;

  if (msg.type === 'ping') {
    window.postMessage(
      { source: 'mwb-extension', type: 'pong', requestId: msg.requestId, version: VERSION },
      '*'
    );
    return;
  }

  if (msg.type === 'capture') {
    chrome.runtime.sendMessage({ type: 'capture' }, (response) => {
      const err = chrome.runtime.lastError;
      if (err || !response) {
        window.postMessage(
          {
            source: 'mwb-extension',
            type: 'capture-result',
            requestId: msg.requestId,
            ok: false,
            error: (err && err.message) || 'no response',
          },
          '*'
        );
        return;
      }
      window.postMessage(
        { source: 'mwb-extension', type: 'capture-result', requestId: msg.requestId, ...response },
        '*'
      );
    });
  }
});
