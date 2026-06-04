import * as vscode from 'vscode';
import { loadConfig, onConfigChange } from './config';
import { analyzeContent, AnalysisResult, generateCode as genCode, GenerationResult } from './bridgeClient';
import { getCachedResult, setCachedResult } from './cache';
import { registerSemanticTokenProvider, updateSemanticResult, fireSemanticTokensChanged } from './semanticTokens';
import { registerIndentDecorations, renderIndentLines, updateDecorationsFromAnalysis } from './indentDecoration';
import { registerHoverFeature, updateEntities } from './hoverFeature';
import { registerDiagnosticManager, updateDiagnostics, getDiagnosticStats } from './diagnosticManager';
import { registerSessionManager, recordAnalysis, getSessionSummary, saveSessionContext, getSessionContext } from './sessionManager';
import { ensureTripletFiles, writeGeneratedCode, getPyPath } from './fileTriplet';
import { registerDocLinks, updateGenerationData } from './docLinks';
import { recordTokenUsage, showTokenPanel } from './tokenPanel';

let statusBarItem: vscode.StatusBarItem;
let bridgeConnected = false;
let totalTokensUsed = 0;
let totalCostUsd = 0;

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Mind] 插件激活中...');

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(symbol-namespace) Mind';
  statusBarItem.command = 'mind.showStatus';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register features
  registerSemanticTokenProvider(context);
  registerIndentDecorations(context);
  registerHoverFeature(context);
  registerDiagnosticManager(context);
  registerSessionManager(context);
  registerDocLinks(context);

  // Register commands
  registerCommands(context);

  // Check bridge
  checkBridgeConnection();

  // Init triplet
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === 'mind') {
    ensureTripletFiles(editor.document.uri.fsPath);
  }

  // Auto-reconnect
  const healthTimer = setInterval(() => {
    if (!bridgeConnected) checkBridgeConnection();
  }, 5000);
  context.subscriptions.push({ dispose: () => clearInterval(healthTimer) });

  // Config change
  context.subscriptions.push(
    onConfigChange(() => checkBridgeConnection())
  );

  console.log('[Mind] 插件激活完成');
}

function registerCommands(context: vscode.ExtensionContext): void {
  // Button 1: Analyze code (variables, colors, diagnostics only)
  context.subscriptions.push(
    vscode.commands.registerCommand('mind.analyzeCode', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'mind') {
        vscode.window.showInformationMessage('请打开一个 .mind 文件');
        return;
      }
      if (!bridgeConnected) {
        vscode.window.showWarningMessage('桥接服务未连接，请先启动 mind-bridge');
        return;
      }
      statusBarItem.text = '$(sync~spin) Mind 分析中...';
      triggerAnalysis(editor.document, false);
    })
  );

  // Button 2: AI detection of # @d comments (generate code, answer questions)
  context.subscriptions.push(
    vscode.commands.registerCommand('mind.analyzeAI', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'mind') {
        vscode.window.showInformationMessage('请打开一个 .mind 文件');
        return;
      }
      if (!bridgeConnected) {
        vscode.window.showWarningMessage('桥接服务未连接，请先启动 mind-bridge');
        return;
      }
      const content = editor.document.getText();
      if (!content.includes('@d')) {
        vscode.window.showInformationMessage('未检测到 # @d 注释，请添加后重试');
        return;
      }
      statusBarItem.text = '$(sync~spin) Mind AI 分析中...';
      triggerGeneration(editor.document);
    })
  );

  // Show status / token usage
  context.subscriptions.push(
    vscode.commands.registerCommand('mind.showStatus', () => {
      showTokenPanel();
    })
  );

  // Restart bridge
  context.subscriptions.push(
    vscode.commands.registerCommand('mind.restartBridge', () => {
      checkBridgeConnection();
      vscode.window.showInformationMessage('桥接重新连接: ' + (bridgeConnected ? '成功' : '失败'));
    })
  );
}

async function checkBridgeConnection(): Promise<boolean> {
  const config = loadConfig();
  try {
    const response = await fetch(`http://${config.bridgeHost}:${config.bridgePort}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    bridgeConnected = response.ok;
    if (bridgeConnected) {
      statusBarItem.text = '$(symbol-namespace) Mind';
      statusBarItem.tooltip = '桥接已连接';
    } else {
      statusBarItem.text = '$(warning) Mind';
      bridgeConnected = false;
    }
    return bridgeConnected;
  } catch {
    bridgeConnected = false;
    statusBarItem.text = '$(warning) Mind (离线)';
    statusBarItem.tooltip = '桥接未连接';
    return false;
  }
}

async function triggerAnalysis(document: vscode.TextDocument, _autoRefresh?: boolean): Promise<void> {
  try {
  if (!document || document.languageId !== 'mind') { statusBarItem.text = '$(symbol-namespace) Mind'; return; }

  const filePath = document.uri.toString();
  const content = document.getText();
  if (!content.trim()) { statusBarItem.text = '$(symbol-namespace) Mind'; return; }

  const cached = getCachedResult(filePath, content);
  if (cached) {
    updateSemanticResult(filePath, cached);
    fireSemanticTokensChanged();
    applyAnalysisResult(document, cached);
    statusBarItem.text = '$(symbol-namespace) Mind';
    return;
  }

  const config = loadConfig();
  const result = await analyzeContent(content, config.bridgeHost, config.bridgePort, document.uri.fsPath);
  if (!result) {
    statusBarItem.text = '$(warning) Mind';
    vscode.window.showErrorMessage('分析失败：桥接服务无响应，请检查桥接是否启动');
    return;
  }

  setCachedResult(filePath, content, result);
  updateSemanticResult(filePath, result);
  recordAnalysis(filePath);
  saveSessionContext(filePath, content, result);
  applyAnalysisResult(document, result);
  fireSemanticTokensChanged();

  if (result.tokenUsage) {
    totalTokensUsed += result.tokenUsage.total;
    recordTokenUsage(result.tokenUsage.prompt, result.tokenUsage.completion, result.tokenUsage.cached);
    console.log(`[Token] ↑${result.tokenUsage.prompt} ↓${result.tokenUsage.completion} 缓存:${result.tokenUsage.cached} 累计:${totalTokensUsed}`);
  }
  vscode.window.showInformationMessage(
    `分析完成 · Token: ${result.tokenUsage?.total || '?'} (缓存: ${result.tokenUsage?.cached || 0})`
  );

  const stats = getDiagnosticStats(document.uri);
  statusBarItem.text = `$(symbol-namespace) Mind ${stats.errors > 0 ? '$(error)' : '$(check)'}`;
  statusBarItem.tooltip = `诊断: ${stats.errors}错误 ${stats.warnings}警告 | Token: ${totalTokensUsed}`;
  } catch (e: unknown) {
    console.error('[Mind] 分析失败:', e instanceof Error ? e.message : e);
    statusBarItem.text = '$(error) Mind 错误';
  }
}

async function triggerGeneration(document: vscode.TextDocument): Promise<void> {
  try {
  const content = document.getText();
  const filePath = document.uri.fsPath;

  await ensureTripletFiles(filePath);
  const pyPath = getPyPath(filePath);

  const config = loadConfig();
  const result = await genCode(content, config.bridgeHost, config.bridgePort);
  if (!result || result.error) {
    vscode.window.showErrorMessage('代码生成失败: ' + (result?.error || '桥接错误'));
    return;
  }

  if (result.code) {
    await writeGeneratedCode(pyPath, { code: result.code, links: result.links });
    updateGenerationData(document.uri.toString(), result);
    vscode.window.showInformationMessage('Python 代码已生成: ' + pyPath);
  } else {
    vscode.window.showInformationMessage('未生成代码（可能无 # @d 注释）');
  }

  console.log('[生成] 完成');
  } catch (e: unknown) {
    console.error('[生成] 失败:', e instanceof Error ? e.message : e);
    vscode.window.showErrorMessage('代码生成失败: ' + (e instanceof Error ? e.message : '未知错误'));
  }
}

function applyAnalysisResult(document: vscode.TextDocument, result: AnalysisResult): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== document) {
    console.warn('[Mind] 分析完成但编辑器已切换，结果缓存待用');
    return;
  }

  if (result.nesting && result.nesting.length > 0) {
    updateDecorationsFromAnalysis(editor, result.nesting);
  } else {
    renderIndentLines(editor);
  }

  if (result.entities) {
    updateEntities(document.uri.toString(), result.entities);
  }

  if (result.diagnostics) {
    updateDiagnostics(document.uri, result.diagnostics);
  } else {
    updateDiagnostics(document.uri, []);
  }
}

export function deactivate(): void {
  console.log('[Mind] 插件停用');
  bridgeConnected = false;
}
