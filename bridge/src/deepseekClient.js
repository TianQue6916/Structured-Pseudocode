// ============================================================
// DeepSeek API 客户端
// ============================================================
// 封装对 DeepSeek API 的调用，使用 OpenAI SDK 兼容接口。
//
// 特性:
//   - 自动重试（网络错误时最多重试 2 次）
//   - 超时控制（默认 30 秒）
//   - 响应校验（确保返回格式正确）
//   - 错误分类（认证/网络/限流等）
// ============================================================

import OpenAI from 'openai';

// ---- 初始化 DeepSeek 客户端 ----
// 使用 OpenAI SDK 连接 DeepSeek 的兼容 API 端点
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  timeout: parseInt(process.env.REQUEST_TIMEOUT || '30000'),
  maxRetries: 2  // 网络错误时自动重试 2 次
});

// ---- 模型选择 ----
// 默认使用 flash 模型（快速+缓存友好）
// 可在 .env 中通过 DEEPSEEK_MODEL 覆盖
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

/**
 * DeepSeek API 调用结果
 * @typedef {Object} DeepSeekResult
 * @property {string} content - AI 返回的文本内容
 * @property {Object} tokenUsage - Token 用量统计
 * @property {number} tokenUsage.prompt - 提示词 token 数
 * @property {number} tokenUsage.completion - 生成 token 数
 * @property {number} tokenUsage.total - 总 token 数
 * @property {number} tokenUsage.cached - 缓存命中的 prompt token 数
 */

/**
 * 调用 DeepSeek API 进行文本分析
 * @param {string} systemPrompt - 系统提示词（描述分析任务和格式）
 * @param {string} userContent - 用户输入（.mind 文件内容）
 * @returns {Promise<DeepSeekResult>} - AI 返回的文本 + token 用量
 * @throws {Error} - 包含分类错误信息
 */
export async function callDeepSeek(systemPrompt, userContent) {
  try {
    const response = await deepseek.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.1,           // 低温 → 输出更稳定、可预测
      max_tokens: 8192,           // 足够返回分析结果
      stream: false                // 非流式，直接获取完整 JSON
    });

    // 提取 AI 回复内容
    const message = response.choices?.[0]?.message;
    const result = message?.content;

    if (!result) {
      const hasReasoning = !!(message?.reasoning_content);
      const finishReason = response.choices?.[0]?.finish_reason;
      const detail = hasReasoning
        ? `模型推理消耗了所有 token 预算（finish_reason: ${finishReason}）`
        : `API 返回了空内容（finish_reason: ${finishReason}）`;
      throw new Error(`AI 返回了空响应: ${detail}`);
    }

    // 提取 token 用量（DeepSeek API 返回此数据）
    const usage = response.usage || {};
    const tokenUsage = {
      prompt: usage.prompt_tokens || 0,
      completion: usage.completion_tokens || 0,
      total: usage.total_tokens || 0,
      cached: usage.prompt_tokens_details?.cached_tokens || 0,
    };

    return { content: result, tokenUsage };

  } catch (error) {
    // ---- 错误分类 ----
    // DeepSeek/OpenAI SDK 错误已经包含了 HTTP 状态码
    if (error.status === 401) {
      const authError = new Error('API 密钥无效或未配置');
      authError.status = 401;
      throw authError;
    }

    if (error.status === 429) {
      const rateError = new Error('API 请求过于频繁，请稍后重试');
      rateError.status = 429;
      throw rateError;
    }

    if (error.status === 402) {
      const balanceError = new Error('DeepSeek 账户余额不足');
      balanceError.status = 402;
      throw balanceError;
    }

    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      const timeoutError = new Error('DeepSeek API 请求超时');
      timeoutError.code = 'ETIMEDOUT';
      throw timeoutError;
    }

    // 其他错误原样抛出
    throw error;
  }
}
