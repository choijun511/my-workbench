import { env } from './env.js';

const BASE = 'https://open.feishu.cn/open-apis';

interface TokenCache {
  token: string;
  expiresAt: number;
}
let tokenCache: TokenCache | null = null;

async function getTenantAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const res = await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET,
    }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu token error: ${data.msg || JSON.stringify(data)}`);
  }
  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire - 60) * 1000,
  };
  return tokenCache.token;
}

async function feishuFetch(pathAndQuery: string): Promise<any> {
  const token = await getTenantAccessToken();
  const res = await fetch(`${BASE}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu API ${pathAndQuery}: ${data.msg || JSON.stringify(data)}`);
  }
  return data.data;
}

export interface FeishuChat {
  chat_id: string;
  name: string;
  chat_mode: string; // 'group' | 'p2p'
}

export async function listChats(): Promise<FeishuChat[]> {
  const all: FeishuChat[] = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ page_size: '100' });
    if (pageToken) q.set('page_token', pageToken);
    const data = await feishuFetch(`/im/v1/chats?${q}`);
    for (const c of data.items || []) all.push(c);
    pageToken = data.has_more ? data.page_token : '';
  } while (pageToken);
  return all;
}

export interface FeishuMessage {
  message_id: string;
  chat_id: string;
  msg_type: string;
  create_time: string; // unix ms as string
  sender: { id: string; id_type: string; sender_type: string };
  body: { content: string };
}

export async function listMessages(
  chatId: string,
  startTimeSec: number,
  endTimeSec: number
): Promise<FeishuMessage[]> {
  const all: FeishuMessage[] = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({
      container_id_type: 'chat',
      container_id: chatId,
      start_time: String(startTimeSec),
      end_time: String(endTimeSec),
      page_size: '50',
      sort_type: 'ByCreateTimeAsc',
    });
    if (pageToken) q.set('page_token', pageToken);
    const data = await feishuFetch(`/im/v1/messages?${q}`);
    for (const m of data.items || []) all.push(m);
    pageToken = data.has_more ? data.page_token : '';
  } while (pageToken);
  return all;
}

export function extractText(msg: FeishuMessage): string {
  if (msg.msg_type !== 'text' && msg.msg_type !== 'post') return '';
  try {
    const body = JSON.parse(msg.body.content);
    if (msg.msg_type === 'text') return String(body.text || '').trim();
    if (msg.msg_type === 'post') {
      const out: string[] = [];
      const title = body.title || '';
      if (title) out.push(title);
      const content = body.content || [];
      for (const para of content) {
        for (const seg of para || []) {
          if (seg.tag === 'text' && seg.text) out.push(seg.text);
        }
      }
      return out.join('\n').trim();
    }
  } catch {
    return '';
  }
  return '';
}

export function feishuMessageUrl(msgId: string): string {
  return `https://www.feishu.cn/messenger/links/messageId/${msgId}`;
}

export async function lookupUserByEmail(email: string): Promise<any> {
  const token = await getTenantAccessToken();
  const res = await fetch(`${BASE}/contact/v3/users/batch_get_id?user_id_type=open_id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails: [email] }),
  });
  return res.json();
}

export async function sendTextToOpenId(openId: string, text: string): Promise<any> {
  const token = await getTenantAccessToken();
  const res = await fetch(`${BASE}/im/v1/messages?receive_id_type=open_id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      receive_id: openId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
  });
  return res.json();
}

export async function getBotInfo(): Promise<any> {
  const token = await getTenantAccessToken();
  const res = await fetch(`${BASE}/bot/v3/info`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
