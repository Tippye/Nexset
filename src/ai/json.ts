/** Extracts a JSON object from plain JSON, a markdown fence, or surrounding prose. */
export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('模型没有返回 JSON');

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1].trim());

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    if (start < 0) throw new Error('响应中未找到 JSON 对象');
    const candidate = findBalancedObject(trimmed, start);
    if (!candidate) throw new Error('响应中的 JSON 对象不完整');
    return JSON.parse(candidate);
  }
}

function findBalancedObject(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}
