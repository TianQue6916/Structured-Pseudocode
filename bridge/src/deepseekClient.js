import OpenAI from 'openai';

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  timeout: parseInt(process.env.REQUEST_TIMEOUT || '180000'),
  maxRetries: 0,
});

const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';

export async function callDeepSeek(systemPrompt, userContent) {
  try {
    const response = await deepseek.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.1,
      max_tokens: 16384,
      stream: false,
    });

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

    const usage = response.usage || {};
    const tokenUsage = {
      prompt: usage.prompt_tokens || 0,
      completion: usage.completion_tokens || 0,
      total: usage.total_tokens || 0,
      cached: usage.prompt_tokens_details?.cached_tokens || 0,
    };

    return { content: result, tokenUsage };

  } catch (error) {
    if (error.status === 401) {
      const e = new Error('API 密钥无效或未配置'); e.status = 401; throw e;
    }
    if (error.status === 429) {
      const e = new Error('API 请求过于频繁'); e.status = 429; throw e;
    }
    if (error.status === 402) {
      const e = new Error('DeepSeek 余额不足'); e.status = 402; throw e;
    }
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      const e = new Error('请求超时'); e.code = 'ETIMEDOUT'; throw e;
    }
    throw error;
  }
}
