import { callDeepSeek } from './deepseekClient.js';

const GENERATION_PROMPT = `你是一个代码生成助手。根据 .mind 文件中 # @d 开头的注释（提问/需求），生成 Python 3 的完整实现代码。

返回 JSON（只返回 JSON）:
{
  "code": "完整Python文件代码",
  "links": [{"mindLine": 行号(0始), "fileLine": 函数起始行号, "name": "函数名"}]
}

要求:
- Python 代码可直接运行，包含 import
- 代码中含详细中文注释解释每步逻辑
- links 将 # @d 所在行 → 对应的实现函数首行
- 如无 # @d 注释，返回空 code`;

export function hasQueryComments(content) {
  return content.split('\n').some(line =>
    line.trim().startsWith('#') && line.includes('@d')
  );
}

function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;
  let cleaned = text.trim().replace(/^\uFEFF/, '');
  try { return JSON.parse(cleaned); } catch {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) { try { return JSON.parse(m[1].trim()); } catch {} }
    const b = text.match(/(\{[\s\S]*\})/);
    if (b) { try { return JSON.parse(b[0]); } catch {} }
    return null;
  }
}

function validateResult(result) {
  if (!result || typeof result !== 'object') return null;
  if (typeof result.code !== 'string') result.code = '';
  if (!Array.isArray(result.links)) result.links = [];
  result.links = result.links.filter(l =>
    typeof l.mindLine === 'number' &&
    typeof l.fileLine === 'number' &&
    typeof l.name === 'string'
  );
  return result;
}

export async function generateCode(mindContent) {
  const hasQuery = mindContent.includes('@d');
  if (!hasQuery) {
    return { code: '', links: [] };
  }

  const { content: rawResponse } = await callDeepSeek(GENERATION_PROMPT, mindContent);

  const result = extractJSON(rawResponse);
  if (!result) {
    console.warn('[生成] AI 返回了无法解析的响应');
    return { code: '# 代码生成失败，请检查桥接服务日志\n', links: [] };
  }

  return validateResult(result) || { code: '', links: [] };
}
