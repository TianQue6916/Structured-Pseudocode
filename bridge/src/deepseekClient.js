/**
 * AI 客户端 — 通过 reasonix run 调用
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function callDeepSeek(systemPrompt, userContent) {
  const ts = Date.now();
  const transcriptFile = path.join(os.tmpdir(), `reasonix-${ts}.jsonl`);

  try {
    // 构建任务文本（限制长度防止超命令行上限）
    const taskText = `${systemPrompt}\n\n文件内容:\n${userContent}`.substring(0, 5000);

    // 调用 reasonix run
    const cmd = `reasonix run --preset flash --transcript "${transcriptFile}" "${taskText.replace(/"/g, '\"')}"`;
    
    execSync(cmd, {
      timeout: 180000,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      shell: true,
    });

    // 从转录文件提取 AI 回复
    let response = '';
    if (fs.existsSync(transcriptFile)) {
      const raw = fs.readFileSync(transcriptFile, 'utf-8').trim();
      for (const line of raw.split('\n')) {
        try { const e = JSON.parse(line); if (e.role === 'assistant' && e.content) response += e.content; } catch {}
      }
    }
    try { fs.unlinkSync(transcriptFile); } catch {}

    if (!response.trim()) throw new Error('AI 返回了空响应');

    return {
      content: response,
      tokenUsage: {
        prompt: Math.ceil((systemPrompt.length + userContent.length) / 3),
        completion: Math.ceil(response.length / 3),
        total: Math.ceil((systemPrompt.length + userContent.length + response.length) / 3),
        cached: 0,
      },
    };

  } catch (error) {
    try { fs.unlinkSync(transcriptFile); } catch {}
    throw error;
  }
}
