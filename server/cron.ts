import { runFeishuSync } from './sync.js';
import { runDecisionReviewCheck } from './decisionReview.js';

function msUntilNextMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}

async function runDailyJobs() {
  try {
    const sync = await runFeishuSync(24);
    console.log('[cron] feishu sync done:', JSON.stringify(sync));
  } catch (e) {
    console.error('[cron] feishu sync failed:', e);
  }
  try {
    const review = await runDecisionReviewCheck();
    console.log('[cron] decision review done:', JSON.stringify(review));
  } catch (e) {
    console.error('[cron] decision review failed:', e);
  }
}

export function scheduleDailySync() {
  const schedule = () => {
    const ms = msUntilNextMidnight();
    setTimeout(async () => {
      await runDailyJobs();
      schedule();
    }, ms);
    const hours = Math.round(ms / 36e5 * 10) / 10;
    console.log(`[cron] next daily run in ~${hours}h (feishu sync + decision review)`);
  };
  schedule();
}
