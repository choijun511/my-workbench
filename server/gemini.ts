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

// === Decision capture ===

export interface DecisionExtraction {
  title: string;
  decision: string;
  context: string;
  alternatives: Array<{ name: string; why_not: string }>;
  assumptions: string[];
  verify: { method: string; after_days: number } | null;
  tags: string[];
  confidence: number; // 0-1, model's confidence that the chat actually contains a decision
  reasoning: string;  // why this confidence
}

const DECISION_PROMPT = `你是一个帮助用户从 AI 聊天记录中提取产品/工程决策的助手。用户从他和 AI 的对话中截取了一段，希望你把它结构化成一条"决策记录"。

请严格按以下 schema 输出 JSON：

{
  "title": "≤30 字的决策标题（祈使句或名词短语）",
  "decision": "1-2 句话陈述用户做了什么决定（不是 AI 建议了什么，而是用户最后选择了什么）",
  "context": "做这个决定的背景：是什么问题、为什么现在要决定、约束条件",
  "alternatives": [
    { "name": "另一个考虑过的方案", "why_not": "为什么没选它" }
  ],
  "assumptions": ["这个决定依赖哪些可被推翻的假设（例如'用户更在意 X 而不是 Y'）"],
  "verify": { "method": "如何判断决定对错（数据/反馈/时间窗口等可观察的信号）", "after_days": 验证窗口的天数 } 或 null,
  // ⚠️ verify 字段重要！只要原文出现"试一周/一个月看看"、"如果 X 就 Y"、"过几天再看"等带时间窗的措辞，必须填，不要轻易给 null
  // 时间换算：一周=7、两周=14、一个月=30、一个季度=90，没明确说就估一个合理值（默认 7）
  "tags": ["项目/领域标签，例如 'OKR', '配色', '飞书集成'"],
  "confidence": 0-1 之间的数字，表示这段对话**确实**包含了一个明确决策的概率,
  "reasoning": "用 1 句话解释你为什么给这个 confidence"
}

判断 confidence 的关键：
- 0.85+：用户明确说了"我决定/我选了/就这样定/这么干"等词，或者结尾给出了清楚的选择
- 0.5-0.85：讨论了选项但用户没明确拍板
- 0.5 以下：只是在咨询或 brainstorming，没有实际决定

要求：
- 不要编造 alternatives——只列出对话里**真的提到过**的方案
- assumptions 抽不出来就给空数组，不要硬凑
- verify 抽不出来就返回 null
- title 必须能让用户一眼想起这条记录，避免笼统词如"做出决定"
- 全部用中文（除非原文是英文术语，可保留）`;

export async function extractDecision(rawText: string, sourceTool?: string, sourceUrl?: string): Promise<DecisionExtraction> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 未配置');
  const sourceHint = sourceTool || sourceUrl ? `\n\n来源：${sourceTool || ''} ${sourceUrl || ''}`.trim() : '';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: `${DECISION_PROMPT}${sourceHint}\n\n聊天原文：\n${rawText}` }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          decision: { type: 'STRING' },
          context: { type: 'STRING' },
          alternatives: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { name: { type: 'STRING' }, why_not: { type: 'STRING' } },
              required: ['name', 'why_not'],
            },
          },
          assumptions: { type: 'ARRAY', items: { type: 'STRING' } },
          verify: {
            type: 'OBJECT',
            properties: { method: { type: 'STRING' }, after_days: { type: 'NUMBER' } },
            nullable: true,
          },
          tags: { type: 'ARRAY', items: { type: 'STRING' } },
          confidence: { type: 'NUMBER' },
          reasoning: { type: 'STRING' },
        },
        required: ['title', 'decision', 'context', 'alternatives', 'assumptions', 'tags', 'confidence', 'reasoning'],
      },
      temperature: 0.2,
    },
  };
  const data = await callWithRetry(url, body);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = JSON.parse(text);
  return {
    title: parsed.title || '未命名决策',
    decision: parsed.decision || '',
    context: parsed.context || '',
    alternatives: parsed.alternatives || [],
    assumptions: parsed.assumptions || [],
    verify: parsed.verify || null,
    tags: parsed.tags || [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    reasoning: parsed.reasoning || '',
  };
}

export interface RelationshipClassification {
  kind: 'related' | 'extends' | 'contradicts' | 'supersedes' | 'unrelated';
  reasoning: string;
}

export async function classifyRelationship(
  target: { title: string; decision: string; context: string; created_at: string },
  candidate: { title: string; decision: string; context: string; created_at: string }
): Promise<RelationshipClassification> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 未配置');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const prompt = `判断两条决策之间的关系。

决策 A（新，时间 ${target.created_at}）：
标题：${target.title}
决策：${target.decision}
背景：${target.context}

决策 B（旧，时间 ${candidate.created_at}）：
标题：${candidate.title}
决策：${candidate.decision}
背景：${candidate.context}

返回 kind + reasoning：
- "supersedes": A 替换/否定了 B（明确推翻 B 的核心结论或方案）
- "contradicts": A 与 B 在某些点上冲突，但没有完全替代关系（同一系统内做了相反的取舍）
- "extends": A 是在 B 的基础上做的进一步细化/扩展（同方向，更深一步）
- "related": 主题相关但没有直接的因果/替代/扩展关系
- "unrelated": 主题不同，embedding 相似只是巧合

reasoning：1 句中文解释你为什么这么判断（≤40 字）`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING' },
          reasoning: { type: 'STRING' },
        },
        required: ['kind', 'reasoning'],
      },
      temperature: 0.1,
    },
  };
  const data = await callWithRetry(url, body);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = JSON.parse(text);
  const validKinds = ['related', 'extends', 'contradicts', 'supersedes', 'unrelated'];
  return {
    kind: validKinds.includes(parsed.kind) ? parsed.kind : 'related',
    reasoning: parsed.reasoning || '',
  };
}

export async function embedText(text: string): Promise<number[]> {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 未配置');
  const model = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${env.GEMINI_API_KEY}`;
  const body = { content: { parts: [{ text }] } };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini embed error: ${data?.error?.message || res.statusText}`);
  return data?.embedding?.values || [];
}
