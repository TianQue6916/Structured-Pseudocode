// ============================================================
// Reasonix Session Saver
// ============================================================
// 将 .mind 分析对话保存为 Reasonix 兼容的会话格式。
// 每次 /analyze 调用后，在 ~/.reasonix/sessions/ 下创建：
//   mind-<filename>-<timestamp>.meta.json  ← 元数据
//   mind-<filename>-<timestamp>.jsonl      ← 对话内容
//   mind-<filename>-<timestamp>.events.jsonl ← 事件日志
//
// 效果:
//   reasonix sessions → 可以看到 mind-xxx 会话
//   reasonix chat --session mind-xxx → 可以继续对话
// ============================================================

import fs from 'fs';
import path from 'path';
import os from 'os';

const SESSIONS_DIR = path.join(os.homedir(), '.reasonix', 'sessions');

function ensureDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * 从 .mind 内容提取标题
 */
function extractTitle(content) {
  const m = content.match(/# @d\s*(.+)/);
  if (m) return m[1].trim().slice(0, 60);
  const first = content.split('\n').find(l => l.trim() && !l.trim().startsWith('#'));
  return first ? first.trim().slice(0, 60) : 'untitled';
}

/**
 * 获取会话基础名称
 */
function getSessionBase(mindContent) {
  const title = extractTitle(mindContent);
  const safe = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_').slice(0, 30);
  const ts = new Date().toISOString().replace(/[:-]/g, '').slice(0, 12);
  return `mind-${safe}-${ts}`;
}

/**
 * 保存一次分析到 Reasonix 会话
 * @param {string} mindContent - 用户输入的 .mind 内容
 * @param {string} responseJson - AI 返回的 JSON 字符串
 * @param {object} [tokenUsage] - 用量统计
 * @returns {string|null} 会话名称，失败返回 null
 */
export function saveReasonixSession(mindContent, responseJson, tokenUsage) {
  try {
    ensureDir();
    const baseName = getSessionBase(mindContent);
    const metaPath = path.join(SESSIONS_DIR, `${baseName}.meta.json`);
    const jsonlPath = path.join(SESSIONS_DIR, `${baseName}.jsonl`);

    // .meta.json
    const meta = {
      summary: `${extractTitle(mindContent)}`,
      workspace: process.cwd() || os.homedir(),
      branch: 'main',
      totalCostUsd: 0,
      turnCount: 1,
      cacheHitTokens: tokenUsage?.cached || 0,
      cacheMissTokens: (tokenUsage?.prompt || 0) + (tokenUsage?.completion || 0) - (tokenUsage?.cached || 0),
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf-8');

    // .jsonl (conversation)
    const lines = [
      JSON.stringify({ role: 'user', content: mindContent }),
      JSON.stringify({ role: 'assistant', content: responseJson }),
    ];
    fs.writeFileSync(jsonlPath, lines.join('\n') + '\n', 'utf-8');

    console.log(`[Reasonix] 会话已保存: ${baseName}`);
    return baseName;
  } catch (err) {
    console.warn(`[Reasonix] 保存失败: ${err.message}`);
    return null;
  }
}
