import { runFeishuSync } from './sync.js';

function msUntilNextMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export function scheduleDailySync() {
  const schedule = () => {
    const ms = msUntilNextMidnight();
    setTimeout(async () => {
      try {
        const result = await runFeishuSync(24);
        console.log('[cron] feishu sync done:', JSON.stringify(result));
      } catch (e) {
        console.error('[cron] feishu sync failed:', e);
      }
      schedule();
    }, ms);
    const hours = Math.round(ms / 36e5 * 10) / 10;
    console.log(`[cron] next feishu sync in ~${hours}h`);
  };
  schedule();
}
