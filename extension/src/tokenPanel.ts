/** 
 * Token 用量面板 — 显示累计 Token、缓存命中率、估算费用
 * 通过状态栏命令 'Mind: 显示状态/Token' 触发
 */

import * as vscode from 'vscode';

let totalTokens = 0;
let totalCached = 0;
let totalCost = 0;
let requestCount = 0;

/**
 * 记录一次 API 调用的用量
 */
export function recordTokenUsage(prompt: number, completion: number, cached: number): void {
  totalTokens += prompt + completion;
  totalCached += cached;
  // DeepSeek flash 估算: 输入 $0.27/M, 输出 $1.10/M, 缓存 $0.07/M
  const cost = (prompt - cached) * 0.00000027 + completion * 0.0000011 + cached * 0.00000007;
  totalCost += cost;
  requestCount++;
}

export function getTokenStats() {
  const cacheRate = totalTokens > 0 ? (totalCached / totalTokens * 100).toFixed(1) : '0.0';
  return {
    totalTokens,
    totalCached,
    cacheRate,
    totalCost: totalCost.toFixed(6),
    requestCount,
    costCNY: (totalCost * 7.2).toFixed(4), // 估算人民币
  };
}

/**
 * 显示 Token 用量面板
 */
export function showTokenPanel() {
  const stats = getTokenStats();
  const panel = vscode.window.createWebviewPanel(
    'mindTokenPanel',
    'Mind Token 用量统计',
    vscode.ViewColumn.Beside,
    { enableScripts: false }
  );

  panel.webview.html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
body { font-family: -apple-system, sans-serif; padding: 16px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
h2 { margin: 0 0 16px 0; font-size: 16px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 8px; }
.table { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px; }
.label { opacity: 0.7; }
.value { font-weight: 500; text-align: right; }
.bar { height: 6px; background: var(--vscode-progressBar-background); border-radius: 3px; margin-top: 4px; }
.bar-fill { height: 100%; background: var(--vscode-statusBarItem-prominentBackground); border-radius: 3px; }
.footer { margin-top: 16px; font-size: 11px; opacity: 0.5; border-top: 1px solid var(--vscode-panel-border); padding-top: 8px; }
</style></head>
<body>
<h2>Token 用量统计</h2>
<div class="table">
  <span class="label">请求次数</span><span class="value">${stats.requestCount}</span>
  <span class="label">总 Token</span><span class="value">${stats.totalTokens.toLocaleString()}</span>
  <span class="label">缓存命中</span><span class="value">${stats.totalCached.toLocaleString()}</span>
  <span class="label">缓存命中率</span><span class="value">${stats.cacheRate}%</span>
  <span class="label">估算费用 (USD)</span><span class="value">$${stats.totalCost}</span>
  <span class="label">估算费用 (CNY)</span><span class="value">¥${stats.costCNY}</span>
</div>
<div class="bar"><div class="bar-fill" style="width:${stats.cacheRate}%"></div></div>
<div class="footer">基于 DeepSeek Flash 公开价格估算 · 实际以账单为准</div>
</body></html>`;
}
