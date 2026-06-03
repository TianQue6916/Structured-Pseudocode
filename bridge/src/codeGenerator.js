// ============================================================
// Code Generator — .mind 注释驱动的 Python/C 代码生成器
// ============================================================
// 检测 .mind 文件中的 # @d 提问注释，
// 调用 DeepSeek 生成对应的 Python 和 C 实现代码，
// 返回结构化结果供插件写入文件并建立超链接。
//
// 工作流:
//   1. 解析 .mind 内容，提取所有 # @d 行
//   2. 构建生成提示词（极简，复用缓存优势）
//   3. 调用 DeepSeek API
//   4. 解析 JSON 响应，校验结构
//   5. 返回 { py: {code, links}, c: {code, links} }
// ============================================================

import { callDeepSeek } from './deepseekClient.js';

/**
 * 代码生成系统提示词
 * 极简设计：只描述输出格式，不包含示例
 */
const GENERATION_PROMPT = `你是一个代码生成助手。根据 .mind 文件中 # @d 开头的注释（提问/需求），生成 Python 3 和 C11 的完整实现代码。

返回 JSON（只返回 JSON）:
{
  "py": { "code": "完整Python文件", "links": [{"mindLine": 行号(0始), "fileLine": 函数起始行号, "name": "函数名"}] },
  "c": { "code": "完整C文件", "links": [{"mindLine": 行号, "fileLine": 函数起始行号, "name": "函数名"}] }
}

要求:
- Python 代码可直接运行，包含 import
- C 代码可编译，包含 #include 和头文件
- 代码中含详细中文注释解释每步逻辑
- links 将 # @d 所在行 → 对应的实现函数首行
- 如无 # @d 注释，返回空 code`;

/**
 * 检查 .mind 内容中是否包含 # @d 注释
 */
export function hasQueryComments(content) {
  return content.split('\n').some(line =>
    line.trim().startsWith('#') && line.includes('@d')
  );
}

/**
 * 提取所有 # @d 行及其行号
 */
function extractQueryLines(content) {
  const lines = content.split('\n');
  const queries = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('#') && trimmed.includes('@d')) {
      queries.push({ line: i, text: trimmed });
    }
  }
  return queries;
}

/**
 * 从 AI 回复中提取并校验 JSON
 */
function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;
  let cleaned = text.trim().replace(/^\uFEFF/, '');

  try { return JSON.parse(cleaned); } catch {
    // Fallback: 代码块
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) { try { return JSON.parse(m[1].trim()); } catch {} }
    // Fallback: 最外层大括号
    const b = text.match(/(\{[\s\S]*\})/);
    if (b) { try { return JSON.parse(b[0]); } catch {} }
    return null;
  }
}

/**
 * 校验生成结果的结构
 */
function validateResult(result) {
  if (!result || typeof result !== 'object') return null;

  // 确保 py 和 c 字段存在
  for (const lang of ['py', 'c']) {
    if (!result[lang] || typeof result[lang] !== 'object') {
      result[lang] = { code: '', links: [] };
    }
    if (typeof result[lang].code !== 'string') result[lang].code = '';
    if (!Array.isArray(result[lang].links)) result[lang].links = [];

    // 校验 links 中的每个条目
    result[lang].links = result[lang].links.filter(l =>
      typeof l.mindLine === 'number' &&
      typeof l.fileLine === 'number' &&
      typeof l.name === 'string'
    );
  }

  return result;
}

/**
 * 主入口：生成 Python + C 实现代码
 *
 * @param {string} mindContent - 完整 .mind 文件内容
 * @returns {Promise<{py: {code: string, links: Array}, c: {code: string, links: Array}}>}
 */
export async function generateCode(mindContent) {
  const queries = extractQueryLines(mindContent);

  if (queries.length === 0) {
    return {
      py: { code: '', links: [] },
      c: { code: '', links: [] }
    };
  }

  // ---- 调用 DeepSeek ----
  const { content: rawResponse } = await callDeepSeek(GENERATION_PROMPT, mindContent);

  const result = extractJSON(rawResponse);
  if (!result) {
    console.warn('[生成] AI 返回了无法解析的响应');
    return {
      py: { code: '# 代码生成失败，请检查桥接服务日志\n', links: [] },
      c: { code: '// 代码生成失败，请检查桥接服务日志\n', links: [] }
    };
  }

  return validateResult(result) || {
    py: { code: '', links: [] },
    c: { code: '', links: [] }
  };
}
