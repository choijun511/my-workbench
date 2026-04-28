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

// === R1.1 Decision capture from any AI chat / web page ===

const PROD_API_BASE = 'https://my-workbench.onrender.com';
const DEV_API_BASE = 'http://localhost:5173';

function detectTool(host) {
  if (!host) return 'web';
  if (host.includes('claude.ai')) return 'claude';
  if (host.includes('openai.com') || host.includes('chatgpt.com')) return 'chatgpt';
  if (host.includes('gemini.google.com')) return 'gemini';
  if (host.includes('cursor.sh') || host.includes('cursor.com')) return 'cursor';
  if (host.includes('poe.com')) return 'poe';
  if (host.includes('feishu.cn') || host.includes('larksuite.com')) return 'feishu';
  return host;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function readSelectionFromTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      selection: (window.getSelection() ? window.getSelection().toString() : '').trim(),
      url: location.href,
      title: document.title,
      host: location.host,
    }),
  });
  return results[0]?.result || { selection: '', url: '', title: '', host: '' };
}

async function showToastInTab(tabId, kind, title, msg, link) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [kind, title, msg, link || null],
      func: (kind, title, msg, link) => {
        const old = document.getElementById('__mwb_toast');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = '__mwb_toast';
        const bg = kind === 'error' ? '#dc2626' : kind === 'warn' ? '#d97706' : '#4f46e5';
        el.style.cssText =
          'position:fixed;top:20px;right:20px;z-index:2147483647;background:' + bg + ';color:#fff;padding:12px 16px;border-radius:10px;font:14px/1.4 -apple-system,BlinkMacSystemFont,system-ui,Helvetica,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:360px;cursor:' + (link ? 'pointer' : 'default') + ';';
        const safeTitle = String(title).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        const safeMsg = String(msg).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        el.innerHTML =
          '<div style="font-weight:600;margin-bottom:3px">' + safeTitle + '</div>' +
          '<div style="opacity:.92;font-size:12px;line-height:1.5">' + safeMsg + '</div>' +
          (link ? '<div style="margin-top:6px;font-size:11px;opacity:.85;text-decoration:underline">点击查看 →</div>' : '');
        if (link) {
          el.addEventListener('click', () => window.open(link, '_blank', 'noopener'));
        }
        document.body.appendChild(el);
        setTimeout(() => {
          el.style.transition = 'opacity .3s';
          el.style.opacity = '0';
          setTimeout(() => { try { el.remove(); } catch (_) {} }, 350);
        }, 4500);
      },
    });
  } catch (_) {
    // restricted page (chrome://, extensions store, etc.) — silently swallow
  }
}

async function postDecisionCapture(rawText, tool, sourceUrl) {
  const isLocal = sourceUrl.startsWith('http://localhost:5173') ||
    sourceUrl.startsWith('http://127.0.0.1');
  // Default to prod unless source itself is localhost (rare, but allow dev testing)
  const apiBase = isLocal ? DEV_API_BASE : PROD_API_BASE;
  const res = await fetch(apiBase + '/api/decisions/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_text: rawText, source_tool: tool, source_url: sourceUrl }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return { decision: data, apiBase };
}

async function captureDecisionFlow() {
  const tab = await getActiveTab();
  if (!tab || tab.id == null) return;

  // Restricted pages — no scripting allowed
  if (!tab.url || /^(chrome|edge|about|chrome-extension|file):/.test(tab.url)) {
    console.warn('[mwb] cannot capture from restricted page:', tab.url);
    return;
  }

  let payload;
  try {
    payload = await readSelectionFromTab(tab.id);
  } catch (e) {
    await showToastInTab(tab.id, 'error', '无法读取页面', e.message || '');
    return;
  }

  const text = (payload.selection || '').trim();
  if (!text) {
    await showToastInTab(
      tab.id,
      'warn',
      '请先选中要捕获的文字',
      '高亮一段对话或决策段落，再按 Alt+Shift+D 或点击扩展图标'
    );
    return;
  }
  if (text.length < 30) {
    await showToastInTab(tab.id, 'warn', '内容太短了', '至少选 30 字以上的对话片段');
    return;
  }

  await showToastInTab(
    tab.id,
    'info',
    '正在抽取决策...',
    text.length + ' 字 · ' + detectTool(payload.host)
  );

  try {
    const tool = detectTool(payload.host || '');
    const { decision, apiBase } = await postDecisionCapture(text, tool, payload.url);
    const link = apiBase + '/decisions';
    const statusLabel = decision.status === 'draft' ? '已存为草稿' : '已捕获决策';
    const conf = decision.confidence != null ? Math.round(decision.confidence * 100) : null;
    const subtitle =
      (decision.title || '未命名') + (conf != null ? '（置信度 ' + conf + '%）' : '');
    await showToastInTab(tab.id, 'info', statusLabel, subtitle, link);
  } catch (e) {
    await showToastInTab(tab.id, 'error', '捕获失败', e.message || '未知错误');
  }
}

chrome.action.onClicked.addListener(() => {
  void captureDecisionFlow();
});

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === 'capture-decision') void captureDecisionFlow();
});
