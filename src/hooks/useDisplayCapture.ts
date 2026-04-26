import { useCallback, useEffect, useRef, useState } from 'react';

export interface DisplayCapture {
  active: boolean;
  starting: boolean;
  error: string | null;
  start: () => Promise<boolean>;
  stop: () => void;
  captureFrameJpeg: (quality?: number, maxWidth?: number) => Promise<string | null>;
}

/**
 * Manages a single MediaStream from getDisplayMedia for the lifetime of the page.
 * One user grant ("share this tab") covers many silent screenshots within the session.
 */
export function useDisplayCapture(): DisplayCapture {
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    if (active) return true;
    setStarting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // @ts-expect-error displaySurface hint is widely supported in Chrome
        video: { displaySurface: 'browser', logicalSurface: true, frameRate: 1 },
        audio: false,
      });
      streamRef.current = stream;
      // If user stops sharing via browser UI
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stop());

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      videoRef.current = video;
      setActive(true);
      return true;
    } catch (e) {
      const msg = (e as Error).message || '获取屏幕共享失败';
      setError(msg.includes('Permission') ? '已取消共享' : msg);
      return false;
    } finally {
      setStarting(false);
    }
  }, [active, stop]);

  const captureFrameJpeg = useCallback(
    async (quality = 0.7, maxWidth = 1600): Promise<string | null> => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return null;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      // strip data:image/jpeg;base64, prefix
      const comma = dataUrl.indexOf(',');
      return comma >= 0 ? dataUrl.slice(comma + 1) : null;
    },
    []
  );

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return { active, starting, error, start, stop, captureFrameJpeg };
}
