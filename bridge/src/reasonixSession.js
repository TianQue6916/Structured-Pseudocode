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
 * 根据文件路径生成稳定的会话名
 * 同文件每次得到的名称都一样，以便延续会话
 */
function getSessionName(filePath) {
  const basename = path.basename(filePath, '.mind');
  const safe = basename.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '_').slice(0, 30);
  return `mind-${safe}`;
}

/**
 * 保存/追加 .mind 分析到 Reasonix 会话
 * 同文件的多次分析追加到同一会话，不重复创建
 */
export function saveReasonixSession(filePath, mindContent, responseJson, tokenUsage) {
  try {
    ensureDir();
    const baseName = getSessionName(filePath);
    const metaPath = path.join(SESSIONS_DIR, `${baseName}.meta.json`);
    const jsonlPath = path.join(SESSIONS_DIR, `${baseName}.jsonl`);

    // 读取已有的会话（如果存在）
    let existingLines = [];
    let existingMeta = null;
    if (fs.existsSync(jsonlPath)) {
      const raw = fs.readFileSync(jsonlPath, 'utf-8').trim();
      if (raw) existingLines = raw.split('\n');
    }
    if (fs.existsSync(metaPath)) {
      try { existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch {}
    }

    // 追加新的对话轮次
    existingLines.push(JSON.stringify({ role: 'user', content: mindContent }));
    existingLines.push(JSON.stringify({ role: 'assistant', content: responseJson }));
    fs.writeFileSync(jsonlPath, existingLines.join('\n') + '\n', 'utf-8');

    // 更新或创建 meta
    const newMeta = existingMeta || {
      summary: '',
      workspace: process.cwd() || os.homedir(),
      branch: 'main',
      totalCostUsd: 0,
      turnCount: 0,
      cacheHitTokens: 0,
      cacheMissTokens: 0,
    };
    newMeta.summary = mindContent.split('\n')[0]?.trim()?.slice(0, 80) || 'mind session';
    newMeta.turnCount = Math.floor(existingLines.length / 2);
    newMeta.cacheHitTokens += tokenUsage?.cached || 0;
    newMeta.cacheMissTokens += (tokenUsage?.prompt || 0) + (tokenUsage?.completion || 0) - (tokenUsage?.cached || 0);
    fs.writeFileSync(metaPath, JSON.stringify(newMeta), 'utf-8');

    console.log(`[Reasonix] 会话 ${existingMeta ? '追加' : '创建'}: ${baseName} (共 ${newMeta.turnCount} 轮)`);
    return baseName;
  } catch (err) {
    console.warn(`[Reasonix] 保存失败: ${err.message}`);
    return null;
  }
}
