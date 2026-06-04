/**
 * ============================================================
 * Mind 语言插件 — 主入口（激活/停用）
 * ============================================================
 * 整合所有模块:
 *   - 语言注册（TextMate 语法 + 语义令牌）
 *   - 缩进关系线
 *   - 悬停引用高亮
 *   - 诊断管理（红/绿波浪线）
 *   - 桥接服务通信
 *   - 对话管理
 *
 * 工作流:
 *   1. 用户打开/编辑 .mind 文件
 *   2. 防抖 500ms 后触发分析
 *   3. 发送文件内容到 mind-bridge
 *   4. 接收 JSON 分析结果
 *   5. 更新所有渲染（颜色/缩进线/悬停/诊断）
 *
 * 降级策略:
 *   - 桥接服务不可用 → 仅使用 TextMate 语法高亮
 *   - 用户可手动触发分析（命令面板）
 *   - 所有功能可独立开关
 * ============================================================
 */

import * as vscode from 'vscode';
import { loadConfig, onConfigChange, MindConfig } from './config';
import { analyzeContent, AnalysisResult } from './bridgeClient';
import { getCachedResult, setCachedResult } from './cache';
import { registerSemanticTokenProvider, updateSemanticResult, fireSemanticTokensChanged } from './semanticTokens';
import { registerIndentDecorations, renderIndentLines, updateDecorationsFromAnalysis } from './indentDecoration';
import { registerHoverFeature, updateEntities } from './hoverFeature';
import { registerDiagnosticManager, updateDiagnostics, getDiagnosticStats } from './diagnosticManager';
import { registerSessionManager, recordAnalysis, getSessionSummary, saveSessionContext, getSessionContext } from './sessionManager';
import { generateCode as genCode, GenerationResult } from './bridgeClient';
import { ensureTripletFiles, writeGeneratedCode, getTriplet } from './fileTriplet';
import { registerDocLinks, updateGenerationData } from './docLinks';

/**
 * 定时器（行完成分析）
 * 只在按 Enter 后触发，行中编辑不触发任何分析
 */
let lineTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 进行中的分析请求对应的文档版本号
 * 用于丢弃过期请求的响应
 */
let pendingAnalysisVersion = 0;

/**
 * 状态栏项
 */
let statusBarItem: vscode.StatusBarItem;

/**
 * 桥接服务连接状态
 */
let bridgeConnected = false;

/**
 * 累计 token 消耗（本次会话）
 */
let totalTokensUsed = 0;
let totalCachedTokens = 0;

/** 行完成分析延迟：按 Enter 后等待 N ms 再触发分析 */
const LINE_COMPLETE_DELAY = 200;

/**
 * 插件激活入口
 * 当 VS Code 打开 .mind 文件时自动调用
 *
 * @param context - 扩展上下文（用于注册资源和清理）
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('[Mind] 插件激活中...');

  // ---- 1. 创建状态栏 ----
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = '$(symbol-namespace) Mind';
  statusBarItem.tooltip = 'Mind 语义分析 — 点击查看状态';
  statusBarItem.command = 'mind.showStatus';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ---- 2. 注册语言功能 ----
  registerSemanticTokenProvider(context);
  registerIndentDecorations(context);
  registerHoverFeature(context);
  registerDiagnosticManager(context);
  registerSessionManager(context);
  registerDocLinks(context);

  // ---- 3. 注册命令 ----
  registerCommands(context);

  // ---- 4. 检查桥接服务连接 ----
  checkBridgeConnection();

  // ---- 5. 如果当前已有打开的 .mind 文件，立即分析 ----
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === 'mind') {
    ensureTripletFiles(editor.document.uri.fsPath);
    triggerAnalysis(editor.document);
  }

  // ---- 6. 逐行检测：只在按 Enter 后触发分析 ----
  // 策略（严格按你的要求）:
  //   - 只有写完一行（按 Enter）才触发分析
  //   - 行中编辑完全不触发，不浪费 token
  //   - 每次分析都处理整个文件（同步所有行的逻辑关系）
  //   - 悬停数据已缓存，鼠标悬停不额外请求
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document !== event.document || editor.document.languageId !== 'mind') return;

      // 检测是否按了 Enter（新行被插入）
      const hasNewLine = event.contentChanges.some(
        c => c.text.includes('\n') || c.text.includes('\r')
      );
      if (!hasNewLine) return; // 行中编辑 → 忽略

      // Enter 被按下 → 短延迟后分析整个文件
      if (lineTimer) clearTimeout(lineTimer);
      lineTimer = setTimeout(() => {
        triggerAnalysis(editor.document);
      }, LINE_COMPLETE_DELAY);
    })
  );

  // ---- 7. 监听编辑器切换（切换文件时自动分析） ----
  // 同时确保三文件体系完整
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === 'mind') {
        // 确保 .py 和 .c 文件存在
        ensureTripletFiles(editor.document.uri.fsPath);

        // 检查缓存，如果没有缓存则触发分析
        const content = editor.document.getText();
        const cached = getCachedResult(editor.document.uri.toString(), content);
        if (!cached) {
          triggerAnalysis(editor.document);
        } else {
          // 有缓存，直接使用
          applyAnalysisResult(editor.document, cached);
        }
      }
    })
  );

  // ---- 8. 监听配置变化 ----
  context.subscriptions.push(
    onConfigChange((config) => {
      // 防抖时间变化不影响正在等待的定时器
      // 桥接服务地址变化时重新连接
      checkBridgeConnection();
    })
  );

  // ---- 9. 每 3 秒检查桥接状态，断开时自动重连 ----
  const healthTimer = setInterval(() => {
    if (!bridgeConnected) {
      console.log('[Mind] 尝试重连桥接...');
      checkBridgeConnection();
    }
  }, 3000);
  context.subscriptions.push({ dispose: () => clearInterval(healthTimer) });

  console.log('[Mind] 插件激活完成');
}

/**
 * 注册所有命令
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // ---- 立即分析命令 ----
  context.subscriptions.push(
    vscode.commands.registerCommand('mind.analyzeNow', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'mind') {
        statusBarItem.text = '$(sync~spin) Mind 分析中...';
        triggerAnalysis(editor.document);
      } else {
        vscode.window.showInformationMessage('请打开一个 .mind 文件');
      }
    })
  );

  // ---- 重新连接桥接服务命令 ----
  context.subscriptions.push(
    vscode.commands.registerCommand('mind.restartBridge', () => {
      checkBridgeConnection();
      // 重新分析当前文件
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'mind') {
        triggerAnalysis(editor.document);
      }
    })
  );

  // ---- 显示分析状态命令 ----
  context.subscriptions.push(
    vscode.commands.registerCommand('mind.showStatus', () => {
      const editor = vscode.window.activeTextEditor;
      const filePath = editor?.document?.uri?.fsPath || '无';
      const sessionInfo = getSessionSummary(filePath);

      const stats = editor
        ? getDiagnosticStats(editor.document.uri)
        : { errors: 0, warnings: 0 };

      vscode.window.showInformationMessage(
        `Mind 分析状态\n` +
        `桥接服务: ${bridgeConnected ? '✅ 已连接' : '❌ 未连接'}\n` +
        `文件: ${filePath}\n` +
        `${sessionInfo}\n` +
        `诊断: ${stats.errors} 错误, ${stats.warnings} 警告`,
        { modal: true }
      );
    })
  );
}

/**
 * 检查桥接服务连接状态
 * @returns true 表示已连接
 */
async function checkBridgeConnection(): Promise<boolean> {
  const config = loadConfig();
  try {
    const response = await fetch(`http://${config.bridgeHost}:${config.bridgePort}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    bridgeConnected = response.ok;

    if (bridgeConnected) {
      statusBarItem.text = '$(symbol-namespace) Mind';
      statusBarItem.tooltip = '桥接服务已连接';
      console.log('[Mind] 桥接服务连接成功');
    } else {
      statusBarItem.text = '$(warning) Mind';
      statusBarItem.tooltip = '桥接服务异常';
      bridgeConnected = false;
    }
    return bridgeConnected;
  } catch {
    bridgeConnected = false;
    statusBarItem.text = '$(warning) Mind (离线)';
    statusBarItem.tooltip = '桥接服务未连接 — 请运行 mind-bridge';
    console.warn('[Mind] 桥接服务未连接');
    return false;
  }
}

/**
 * 触发文件分析
 *
 * 工作流:
 *   1. 检查缓存
 *   2. 发送到桥接服务
 *   3. 更新所有渲染
 *
 * @param document - 要分析的文档
 */
async function triggerAnalysis(document: vscode.TextDocument): Promise<void> {
  if (!document || document.languageId !== 'mind') return;

  // 检查桥接开关：关闭时只做本地缩进渲染
  const cfg = loadConfig();
  if (!cfg.enableBridge) {
    console.log('[Mind] 桥接已禁用，离线模式');
    statusBarItem.text = '$(symbol-namespace) Mind (离线)';
    statusBarItem.tooltip = '桥接已禁用 — 设置中可启用';
    const ed = vscode.window.activeTextEditor;
    if (ed) renderIndentLines(ed);
    return;
  }

  const filePath = document.uri.toString();
  const content = document.getText();

  // 空文件不分析
  if (!content.trim()) {
    updateDiagnostics(document.uri, []);
    return;
  }

  // ---- 1. 检查本地缓存 ----
  const cached = getCachedResult(filePath, content);
  if (cached) {
    updateSemanticResult(filePath, cached);
    fireSemanticTokensChanged();
    applyAnalysisResult(document, cached);
    return;
  }

  // ---- 2. 先检查桥接服务是否在线 ----
  const config = loadConfig();
  const healthy = await checkBridgeConnection();
  if (!healthy) {
    statusBarItem.text = '$(warning) Mind (离线)';
    statusBarItem.tooltip = '桥接服务未连接 — 请先启动 mind-bridge';
    // 保留现有诊断，不发起 API 请求
    return;
  }

  // ---- 3. 记录当前请求的版本号（用于去重） ----
  pendingAnalysisVersion++;
  const thisVersion = pendingAnalysisVersion;
  statusBarItem.text = '$(sync~spin) Mind 分析中...';

  // 获取上一次分析的上下文（保持对话连续）
  const prevCtx = getSessionContext(filePath);
  const result = await analyzeContent(
    content, config.bridgeHost, config.bridgePort,
    prevCtx.content, prevCtx.result
  );

  // ---- 如果版本号变了，说明有更新请求已发出，丢弃本次结果 ----
  if (thisVersion !== pendingAnalysisVersion) {
    console.log('[Mind] 丢弃过期分析结果（版本', thisVersion, '→', pendingAnalysisVersion, '）');
    return;
  }

  if (result) {
    // ---- 3. 缓存并应用结果 ----
    setCachedResult(filePath, content, result);
    updateSemanticResult(filePath, result);
    recordAnalysis(filePath);
    // 保存本次分析结果作为下次的上下文
    saveSessionContext(filePath, content, result);
    applyAnalysisResult(document, result);
    fireSemanticTokensChanged();

    // ---- 4. 累计 token 并更新状态栏 ----
    if (result.tokenUsage) {
      totalTokensUsed += result.tokenUsage.total;
      totalCachedTokens += result.tokenUsage.cached;
      console.log(
        `[Token] ↑${result.tokenUsage.prompt} ↓${result.tokenUsage.completion}` +
        ` 缓存:${result.tokenUsage.cached} 累计:${totalTokensUsed}`
      );
    }

    // ---- 5. 检测 # @d 注释 → 触发代码生成 ----
    // 只在文本包含 # @d 时才调用 /generate（节省 token）
    if (content.includes('@d')) {
      triggerGeneration(document, config.bridgeHost, config.bridgePort);
    }

    const stats = getDiagnosticStats(document.uri);
    const tokenPart = totalTokensUsed > 0
      ? ` $(database)${totalTokensUsed}T`
      : '';
    statusBarItem.text = `$(symbol-namespace) Mind${tokenPart} ${stats.errors > 0 ? '$(error)' : '$(check)'}`;
    statusBarItem.tooltip = `错误: ${stats.errors}, 警告: ${stats.warnings} | 累计消耗: ${totalTokensUsed} tokens (缓存命中: ${totalCachedTokens})`;
  } else {
    // 桥接服务不可用，显示提示
    statusBarItem.text = '$(warning) Mind (离线)';
    statusBarItem.tooltip = '桥接服务不可用，仅显示基本语法高亮';

    // 不清除诊断，保留之前的分析结果
    console.warn('[Mind] 分析请求失败，使用缓存或降级模式');
  }
}

/**
 * 触发代码生成（# @d → Python + C）
 * 生成完成后写入文件并更新超链接
 */
async function triggerGeneration(
  document: vscode.TextDocument,
  host: string,
  port: number
): Promise<void> {
  const content = document.getText();
  const filePath = document.uri.fsPath;

  // 确保三文件体系完整
  await ensureTripletFiles(filePath);
  const triplet = getTriplet(filePath);

  // 调用桥接端 /generate
  const result = await genCode(content, host, port);
  if (!result || result.error) {
    console.warn('[生成] 代码生成失败:', result?.error);
    return;
  }

  // 写入生成的代码到文件
  if (result.py?.code) {
    await writeGeneratedCode(triplet.py, result.py);
  }
  if (result.c?.code) {
    await writeGeneratedCode(triplet.c, result.c);
  }

  // 更新超链接数据（供 DocumentLinkProvider 使用）
  updateGenerationData(document.uri.toString(), result);

  // 打开生成的文件（如果是首次创建）
  if (result.py?.code) {
    const pyDoc = await vscode.workspace.openTextDocument(triplet.py);
    // 不切换到该文件，只在后台打开
  }
  if (result.c?.code) {
    const cDoc = await vscode.workspace.openTextDocument(triplet.c);
  }

  console.log('[生成] 代码生成完成，已写入 .py 和 .c 文件');
}

/**
 * 将分析结果应用到编辑器
 * 更新所有视觉元素：颜色/缩进线/悬停/诊断
 *
 * @param document - 目标文档
 * @param result - 分析结果
 */
function applyAnalysisResult(document: vscode.TextDocument, result: AnalysisResult): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document) return;

  // ---- 更新缩进关系线 ----
  if (result.nesting && result.nesting.length > 0) {
    updateDecorationsFromAnalysis(editor, result.nesting);
  } else {
    renderIndentLines(editor);
  }

  // ---- 更新悬停实体数据 ----
  if (result.entities) {
    updateEntities(document.uri.toString(), result.entities);
  }

  // ---- 更新诊断（红/绿波浪线） ----
  if (result.diagnostics) {
    updateDiagnostics(document.uri, result.diagnostics);
  } else {
    updateDiagnostics(document.uri, []);
  }

  // 语义令牌通过 updateSemanticResult() + fireSemanticTokensChanged() 更新
  // 已在 triggerAnalysis 中调用
}

/**
 * 插件停用入口
 */
export function deactivate(): void {
  console.log('[Mind] 插件停用');

  // 清除定时器
  if (lineTimer) { clearTimeout(lineTimer); lineTimer = undefined; }

  // 清理状态
  bridgeConnected = false;
}
