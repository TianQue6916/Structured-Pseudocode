// ============================================================
// Transcript Saver — 保存分析对话为 reasonix 兼容的转录文件
// ============================================================
// 每次 /analyze 和 /generate 调用时，将请求和响应保存为
// JSONL 转录文件，存放在 ~/.reasonix/mind-transcripts/ 下，
// 供 reasonix replay 查看和继续对话。
//
// 文件格式: 每行一个 JSON，兼容 reasonix transcript 规范
//   {"role":"user","content":"..."}
//   {"role":"assistant","content":"...","tokenUsage":{...}}
//
// 用户可通过以下方式查看和继续对话:
//   reasonix replay ~/.reasonix/mind-transcripts/<file>.jsonl
// ============================================================

import fs from 'fs';
import path from 'path';
import os from 'os';

/** 转录目录 */
const TRANSCRIPTS_DIR = path.join(os.homedir(), '.reasonix', 'mind-transcripts');

/**
 * 确保转录目录存在
 */
function ensureDir() {
  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  }
}

/**
 * 从 .mind 文件内容中提取首个 # @d 作为会话标题
 */
function extractTitle(content) {
  const match = content.match(/# @d\s*(.+)/);
  if (match) return match[1].trim().slice(0, 60);
  // 取第一行非空内容
  const first = content.split('\n').find(l => l.trim() && !l.trim().startsWith('#'));
  return first ? first.trim().slice(0, 60) : 'untitled';
}

/**
 * 获取转录文件路径（基于 .mind 文件名 hash）
 */
function getTranscriptPath(mindContent) {
  ensureDir();
  const title = extractTitle(mindContent);
  const safeName = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_').slice(0, 40);
  const timestamp = Date.now();
  return path.join(TRANSCRIPTS_DIR, `${safeName}_${timestamp}.jsonl`);
}

/**
 * 保存一次分析对话到转录文件
 * @param {string} mindContent - 用户输入的 .mind 内容
 * @param {string} systemPrompt - 系统提示词
 * @param {string} response - AI 返回的 JSON
 * @param {object} tokenUsage - 用量统计
 * @returns {string|null} 转录文件路径，保存失败返回 null
 */
export function saveTranscript(mindContent, systemPrompt, response, tokenUsage) {
  try {
    const filePath = getTranscriptPath(mindContent);
    const lines = [];

    // System prompt
    lines.push(JSON.stringify({
      role: 'system',
      content: systemPrompt,
    }));

    // User request
    lines.push(JSON.stringify({
      role: 'user',
      content: mindContent,
    }));

    // AI response
    lines.push(JSON.stringify({
      role: 'assistant',
      content: response,
      tokenUsage: tokenUsage || {},
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    }));

    // 追加到文件（如果已存在则追加，否则创建）
    fs.appendFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
    console.log(`[转录] 保存: ${filePath}`);
    return filePath;
  } catch (err) {
    console.warn(`[转录] 保存失败: ${err.message}`);
    return null;
  }
}

/**
 * 获取所有转录文件列表
 */
export function listTranscripts() {
  ensureDir();
  try {
    return fs.readdirSync(TRANSCRIPTS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse()
      .map(f => ({
        name: f,
        path: path.join(TRANSCRIPTS_DIR, f),
        size: fs.statSync(path.join(TRANSCRIPTS_DIR, f)).size,
      }));
  } catch {
    return [];
  }
}
