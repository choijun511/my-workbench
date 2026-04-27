import { useCallback, useEffect, useRef, useState } from 'react';

export interface CaptureResult {
  image_base64: string;
  image_mime: string;
}

export interface ExtensionCapture {
  available: boolean;
  version: string | null;
  capture: () => Promise<CaptureResult | null>;
  lastError: string | null;
}

/**
 * Talks to the My Workbench Capture Chrome extension via window.postMessage.
 * Returns `available: true` once the extension's content script has announced itself.
 */
export function useExtensionCapture(): ExtensionCapture {
  const [available, setAvailable] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const pendingRef = useRef(new Map<string, (r: CaptureResult | null, err?: string) => void>());

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window) return;
      const m = e.data;
      if (!m || m.source !== 'mwb-extension') return;

      if (m.type === 'ready' || m.type === 'pong') {
        setAvailable(true);
        if (m.version) setVersion(m.version);
        return;
      }

      if (m.type === 'capture-result' && m.requestId) {
        const cb = pendingRef.current.get(m.requestId);
        if (cb) {
          pendingRef.current.delete(m.requestId);
          if (m.ok) cb({ image_base64: m.image_base64, image_mime: m.image_mime });
          else cb(null, m.error || '截图失败');
        }
      }
    };

    window.addEventListener('message', onMessage);

    // Probe in case the extension was loaded before our hook.
    const probeId = 'probe-' + Math.random().toString(36).slice(2);
    window.postMessage({ target: 'mwb-extension', type: 'ping', requestId: probeId }, '*');

    return () => window.removeEventListener('message', onMessage);
  }, []);

  const capture = useCallback(async () => {
    if (!available) return null;
    setLastError(null);
    return new Promise<CaptureResult | null>((resolve) => {
      const reqId = 'cap-' + Math.random().toString(36).slice(2);
      pendingRef.current.set(reqId, (r, err) => {
        if (err) setLastError(err);
        resolve(r);
      });
      window.postMessage({ target: 'mwb-extension', type: 'capture', requestId: reqId }, '*');
      setTimeout(() => {
        if (pendingRef.current.has(reqId)) {
          pendingRef.current.delete(reqId);
          setLastError('截图超时（扩展未响应）');
          resolve(null);
        }
      }, 10000);
    });
  }, [available]);

  return { available, version, capture, lastError };
}
