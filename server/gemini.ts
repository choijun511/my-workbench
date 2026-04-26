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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Gemini error: ${data?.error?.message || res.statusText}`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed.todos) ? parsed.todos : [];
  } catch {
    return [];
  }
}
