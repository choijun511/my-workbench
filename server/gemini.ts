import { env } from './env.js';

interface ExtractedTodo {
  title: string;
  source_message_id: string;
  context?: string;
}

const SYSTEM_PROMPT = `你是一个帮助提取待办事项的助手。下面是一段飞书聊天记录（按时间顺序），请从中识别出"我"或对话参与者明确需要做的待办事项（todo / 任务 / 提醒 / 后续要跟进的事），忽略闲聊、表情、纯信息分享。

要求：
- 只提取明确的、可行动的事项
- 每个事项的 title 用简洁的祈使句概括（10-30 字内）
- source_message_id 对应原消息的 id
- 如果一条消息提到多个 todo，可拆成多条
- 没有明确 todo 时返回空数组

返回 JSON: {"todos":[{"title":"...","source_message_id":"...","context":"原文摘要(可选)"}]}`;

export async function extractTodosFromMessages(
  messages: Array<{ message_id: string; sender: string; text: string; time: string }>
): Promise<ExtractedTodo[]> {
  if (!messages.length) return [];
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 未配置');

  const formatted = messages
    .map(m => `[${m.time}] [${m.sender}] (id=${m.message_id})\n${m.text}`)
    .join('\n\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n聊天记录：\n${formatted}` }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          todos: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                source_message_id: { type: 'STRING' },
                context: { type: 'STRING' },
              },
              required: ['title', 'source_message_id'],
            },
          },
        },
        required: ['todos'],
      },
      temperature: 0.2,
    },
  };

  const data = await callWithRetry(url, body);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.todos) ? parsed.todos : [];
  } catch {
    return [];
  }
}

interface PanelAnalysisInput {
  panelName: string;
  panelDescription: string;
  text: string;
  imageBase64: string;
  imageMime: string;
}

export interface PanelAnalysisResult {
  summary: string;
  anomalies: Array<{ metric: string; observation: string; severity: 'high' | 'medium' | 'low' }>;
  insights: string[];
  generated_at: string;
}

const PANEL_PROMPT = `你是一名数据分析师，正在帮用户分析一份内部业务看板的当日快照。

请基于看板的图片或文字描述，输出三类内容：
1. summary：一句话概括今日整体表现（中文，30-80 字）
2. anomalies：异常数据提醒（环比/同比/历史均值偏离、突增突降、断崖、归零等）。每条包含 metric（指标名）、observation（中文描述偏离方向和幅度）、severity（high/medium/low）。如果没有明显异常，返回空数组。
3. insights：关键数据洞察（不只是描述数字，要给出业务含义或行动建议），3-5 条，每条 1-2 句话，中文。

要求：
- 只基于图片/文字中真实存在的数据，不要编造
- 数值精度尊重原图，不要四舍五入丢失信息
- 严禁泛泛而谈（"建议关注趋势"这种废话不要）

返回 JSON: { "summary": "...", "anomalies": [...], "insights": [...] }`;

export async function analyzePanelData(input: PanelAnalysisInput): Promise<PanelAnalysisResult> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 未配置');

  const parts: any[] = [
    {
      text:
        `${PANEL_PROMPT}\n\n看板名称：${input.panelName}` +
        (input.panelDescription ? `\n看板描述：${input.panelDescription}` : '') +
        (input.text ? `\n\n用户提供的数据/文字摘要：\n${input.text}` : ''),
    },
  ];
  if (input.imageBase64) {
    parts.push({ inline_data: { mime_type: input.imageMime, data: input.imageBase64 } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          summary: { type: 'STRING' },
          anomalies: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                metric: { type: 'STRING' },
                observation: { type: 'STRING' },
                severity: { type: 'STRING' },
              },
              required: ['metric', 'observation', 'severity'],
            },
          },
          insights: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['summary', 'anomalies', 'insights'],
      },
      temperature: 0.3,
    },
  };

  const data = await callWithRetry(url, body);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = JSON.parse(text);
  return {
    summary: parsed.summary || '',
    anomalies: parsed.anomalies || [],
    insights: parsed.insights || [],
    generated_at: new Date().toISOString(),
  };
}

function parseRetryDelaySec(data: any, msg: string): number | null {
  const details = data?.error?.details || [];
  for (const d of details) {
    const v = d?.retryDelay;
    if (typeof v === 'string') {
      const m = v.match(/^(\d+(?:\.\d+)?)s$/);
      if (m) return Number(m[1]);
    }
  }
  const m = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  return m ? Number(m[1]) : null;
}

async function callWithRetry(url: string, body: any): Promise<any> {
  const MAX_ATTEMPTS = 5;
  const MAX_TOTAL_WAIT_MS = 60_000;
  const baseDelays = [0, 1500, 4000, 9000, 18000];
  let lastErr: Error | null = null;
  let totalWaited = 0;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const wait = baseDelays[i] ?? 0;
    if (wait > 0) {
      await new Promise(r => setTimeout(r, wait));
      totalWaited += wait;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;

    const msg: string = data?.error?.message || res.statusText || '';
    const transient =
      res.status === 429 ||
      res.status === 503 ||
      res.status === 500 ||
      /high demand|overloaded|temporar|UNAVAILABLE|RESOURCE_EXHAUSTED|quota/i.test(msg);
    lastErr = new Error(`Gemini error: ${msg}`);
    if (!transient) throw lastErr;

    // Honor server's retryDelay hint when present.
    const hintSec = parseRetryDelaySec(data, msg);
    if (hintSec != null && i < MAX_ATTEMPTS - 1) {
      const hintMs = Math.ceil(hintSec * 1000) + 500; // small buffer
      baseDelays[i + 1] = Math.max(baseDelays[i + 1] ?? 0, Math.min(hintMs, MAX_TOTAL_WAIT_MS - totalWaited));
    }
  }
  throw lastErr || new Error('Gemini error: unknown');
}
