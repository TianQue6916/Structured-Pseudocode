// ============================================================
// Mind 语言分析引擎
// ============================================================
// 核心分析逻辑：构建系统提示词 → 调用 DeepSeek → 解析 JSON 响应。
//
// 关键设计:
//   1. 系统提示词极简（<80 tokens），只描述输出格式，无示例
//   2. 每次都发送完整文件内容 → 利用 DeepSeek 缓存
//   3. 要求 AI 只返回 JSON（无多余文字）→ 减少 token 消耗
//   4. 解析失败时返回空数据 + 诊断提示（不崩溃）
// ============================================================

import { callDeepSeek } from './deepseekClient.js';

// ============================================================
// 系统提示词
// ============================================================
// 设计原则:
//   - 固定不变 → 每次请求都命中 DeepSeek 缓存（零成本）
//   - 无示例 → 减少 token 数，让模型自己理解
//   - 明确指定 JSON 结构 → 确保解析成功
//   - 中文指令 → 与模型训练数据一致
//
// ⚠️ 警告：此提示词是性能关键路径。
//    修改后首次请求会 miss 缓存，后续命中。
// ============================================================
const SYSTEM_PROMPT = `分析 .mind 文件语义。

返回 JSON（只返回 JSON，不要其他文字）:
{
  "tokens": [{ line: 行号(0始), character: 列号, length: 长度, type: 类型 }],
  "entities": [{ id: "e1", name: "实体名", type: "variable|function|concept", occurrences: [{line,character,length}], description: "描述" }],
  "nesting": [{ line: 行号, level: 缩进层级 }],
  "diagnostics": [{ line, character, length, message, severity: "error|warning" }]
}

token 类型: keyword(控制流) c-call(C函数调用) py-def(Python函数定义) c-def(C函数定义) decl(变量声明) ref(变量引用) type(类型关键字) user-type(自定义类型) nl-verb(自然语言动词) nl-noun(自然语言名词) operator(运算符) ptr-op(指针/箭头) number(数字) const(特殊常量) string(字符串) char(字符) comment(注释) punct(标点)

entity 类型: variable(变量) function(函数) concept(抽象概念)
- 逻辑上指向同一对象的 token 归为同一个 entity
- 在 occurrences 中列出所有出现位置

nesting: 基于缩进空格数推断层级（0 = 最顶层）
diagnostics: error = 确定逻辑错误, warning = 不确定或歧义`;

/**
 * 从 AI 回复中提取 JSON
 * AI 有时会在 JSON 前后加 markdown 代码标记或其他文字
 */
function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;

  // 清除 BOM 和首尾空白
  let cleaned = text.trim().replace(/^\uFEFF/, '');

  // 尝试直接解析
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // ---- 如果末尾字符不是 }，尝试补全截断的 JSON ----
    // 这是 DeepSeek 推理模型可能的问题：输出被 token 上限截断
    if (!cleaned.endsWith('}') && !cleaned.endsWith(']')) {
      // 尝试补全最外层大括号
      const openBraces = (cleaned.match(/\{/g) || []).length;
      const closeBraces = (cleaned.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        cleaned += '}'.repeat(openBraces - closeBraces);
        try { return JSON.parse(cleaned); } catch { /* 继续尝试下一个策略 */ }
      }
    }
    
    // ---- 直接解析失败，使用 fallback 策略 ----
    // 常见的失败原因：AI 在 JSON 前后加了 markdown 代码块或额外文字

    // Fallback 1: 提取 ```json ... ``` 代码块
    const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeMatch) {
      try { return JSON.parse(codeMatch[1].trim()); } catch { /* 继续 */ }
    }

    // Fallback 2: 用贪婪匹配提取最外层 {...} 或 [...]
    // 注意：必须用贪婪匹配，非贪婪会只匹配到第一个 } 导致截断
    // 例如 {"tokens":[{"line":0}]}extra → 贪婪正确匹配完整 JSON
    const outerMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (outerMatch) {
      try { return JSON.parse(outerMatch[0]); } catch { /* 继续 */ }
    }

    return null;
  }
}

/**
 * 验证分析结果的结构完整性
 */
function validateResult(result) {
  if (!result || typeof result !== 'object') return false;

  // tokens 应该是数组
  if (!Array.isArray(result.tokens)) result.tokens = [];

  // entities 应该是数组
  if (!Array.isArray(result.entities)) result.entities = [];

  // nesting 应该是数组
  if (!Array.isArray(result.nesting)) result.nesting = [];

  // diagnostics 应该是数组
  if (!Array.isArray(result.diagnostics)) result.diagnostics = [];

  // 确保每个 token 有必需字段
  result.tokens = result.tokens.filter(t =>
    typeof t.line === 'number' &&
    typeof t.character === 'number' &&
    typeof t.length === 'number' &&
    typeof t.type === 'string'
  );

  // 确保每个 entity 有必需字段
  result.entities = result.entities.filter(e =>
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    Array.isArray(e.occurrences)
  );

  // 确保每个 nesting 有必需字段
  result.nesting = result.nesting.filter(n =>
    typeof n.line === 'number' &&
    typeof n.level === 'number'
  );

  // 确保每个 diagnostic 有必需字段
  result.diagnostics = result.diagnostics.filter(d =>
    typeof d.line === 'number' &&
    typeof d.character === 'number' &&
    typeof d.message === 'string' &&
    (d.severity === 'error' || d.severity === 'warning')
  );

  return true;
}

/**
 * 分析 .mind 文件内容
 * @param {string} content - 完整的 .mind 文件内容
 * @returns {Promise<{tokens: Array, entities: Array, nesting: Array, diagnostics: Array, tokenUsage?: Object}>}
 */
export async function analyzeMindContent(content) {
  // ---- 调用 DeepSeek API ----
  const { content: rawResponse, tokenUsage } = await callDeepSeek(SYSTEM_PROMPT, content);

  // ---- 解析 JSON ----
  const result = extractJSON(rawResponse);

  // ---- 附加 token 用量 ----
  if (result && tokenUsage) {
    result.tokenUsage = tokenUsage;
  }

  if (!result) {
    // 解析失败 → 返回空数据 + 诊断提示
    console.warn('[解析警告] AI 返回了无法解析的响应，已降级为纯高亮模式');
    console.warn('  原始响应(前300):', rawResponse.slice(0, 300));
    return {
      tokens: [],
      entities: [],
      nesting: computeFallbackNesting(content),
      diagnostics: [{
        line: 0,
        character: 0,
        length: 1,
        message: '语义分析暂时不可用，仅显示基本语法高亮',
        severity: 'warning'
      }]
    };
  }

  // ---- 验证结构 ----
  validateResult(result);

  // ---- 如果 diagnostics 为空但文件有内容，添加默认 nesting ----
  if (result.nesting.length === 0 && content.trim()) {
    result.nesting = computeFallbackNesting(content);
  }

  return result;
}

/**
 * 降级方案：当 AI 分析失败时，本地计算缩进层级
 * 基于每行开头的空格数推断缩进级别
 */
function computeFallbackNesting(content) {
  const lines = content.split('\n');
  const nesting = [];

  for (let line = 0; line < lines.length; line++) {
    const text = lines[line];
    // 计算开头的空格/制表符数
    const indentMatch = text.match(/^([ \t]*)/);
    const indentLength = indentMatch ? indentMatch[1].length : 0;

    // 忽略空行和纯注释行
    if (text.trim() === '' || text.trim().startsWith('#')) continue;

    // 估算层级（每 2 个空格 = 1 级）
    const level = Math.floor(indentLength / 2);

    nesting.push({ line, level });
  }

  return nesting;
}
