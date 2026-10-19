/**
 * 大模型输出的 JSON 常带"外包装"：markdown 围栏、前后寒暄、甚至两个对象。
 * 这里做两件事：剥壳 + 括号配平扫描，取第一个完整的 JSON 对象。
 */

/** 从任意文本中截出第一个括号配平的 {...}（跳过字符串内的花括号） */
export function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;

  const start = body.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = start; i < body.length; i += 1) {
    const ch = body[i];
    if (inString) {
      if (escaping) escaping = false;
      else if (ch === '\\') escaping = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

/** 宽松解析：先直接 parse，失败再去壳扫描 */
export function parseJsonLoose(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  const text = input.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const extracted = extractJsonObject(text);
    if (!extracted) return null;
    try {
      return JSON.parse(extracted);
    } catch {
      return null;
    }
  }
}
