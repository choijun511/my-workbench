import { Router } from 'express';
import db from '../db.js';
import { runFeishuSync, getLastSync, getMessageStats } from '../sync.js';
import { envReady } from '../env.js';
import { lookupUserByEmail, sendTextToOpenId, getBotInfo } from '../feishu.js';

const router = Router();

router.use((req, _res, next) => {
  console.log(`[feishu] ${req.method} ${req.path} ua=${req.headers['user-agent'] || ''}`);
  next();
});

router.get('/status', (_req, res) => {
  const ready = envReady();
  const last = getLastSync();
  const stats = getMessageStats();
  const key = process.env.GEMINI_API_KEY || '';
  res.json({
    configured: ready.ok,
    missing: ready.missing,
    last_sync_at: last.at,
    last_sync_result: last.value ? JSON.parse(last.value) : null,
    messages: stats,
    gemini_key: key
      ? { length: key.length, suffix: key.slice(-6), model: process.env.GEMINI_MODEL || '' }
      : null,
  });
});

router.get('/whoami', async (req, res) => {
  const email = String(req.query.email || '');
  if (!email) return res.status(400).json({ error: 'email query required' });
  try {
    const data = await lookupUserByEmail(email);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/bot-info', async (_req, res) => {
  try {
    res.json(await getBotInfo());
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/test-send', async (req, res) => {
  const openId = String(req.body?.open_id || req.query.open_id || '');
  const text = String(req.body?.text || '来自 my-workbench 的测试消息');
  if (!openId) return res.status(400).json({ error: 'open_id required' });
  try {
    res.json(await sendTextToOpenId(openId, text));
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/sync', async (req, res) => {
  const windowHours = Number(req.body?.window_hours) || 24;
  const result = await runFeishuSync(windowHours);
  if (!result.ok) return res.status(500).json(result);
  res.json(result);
});

const insertMessage = db.prepare(`
  INSERT OR IGNORE INTO feishu_messages
    (message_id, chat_id, chat_type, sender_id, msg_type, content, create_time)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// Feishu event subscription endpoint.
// Handles URL verification challenge and im.message.receive_v1 events.
router.post('/events', (req, res) => {
  const body = req.body || {};
  const bodyType = body.type || body.header?.event_type || 'unknown';
  console.log(`[feishu/events] body.type=${bodyType} keys=${Object.keys(body).join(',')}`);

  // URL verification challenge (sent once when configuring the webhook URL)
  if (body.type === 'url_verification' && body.challenge) {
    return res.json({ challenge: body.challenge });
  }

  // Event callback (v1 schema or v2 schema)
  const eventType = body.header?.event_type || body.event?.type;
  const event = body.event || {};

  if (eventType === 'im.message.receive_v1' || eventType === 'message') {
    const msg = event.message || {};
    const sender = event.sender || {};
    const messageId = msg.message_id;
    if (messageId) {
      const senderId =
        sender?.sender_id?.open_id ||
        sender?.sender_id?.user_id ||
        sender?.sender_id?.union_id ||
        '';
      const createTime = Math.floor(Number(msg.create_time || Date.now()) / (Number(msg.create_time) > 1e12 ? 1000 : 1));
      try {
        insertMessage.run(
          messageId,
          msg.chat_id || '',
          msg.chat_type || '',
          senderId,
          msg.message_type || msg.msg_type || '',
          msg.content || '',
          createTime
        );
      } catch (e) {
        console.warn('[feishu/events] insert failed:', (e as Error).message);
      }
    }
  }

  res.json({ ok: true });
});

export default router;
