/**
 * ============================================================
 * Mind 插件 — 诊断管理
 * ============================================================
 * 管理两种诊断标记:
 *   1. 红色波浪下划线 → 确定逻辑错误（未定义实体/矛盾操作等）
 *   2. 绿色波浪下划线 → AI 不理解的标记（歧义/未知词汇等）
 *
 * 两种标记在 VS Code 问题面板（Problems Panel）中显示。
 * 悬停在波浪线上时弹窗显示错误/警告消息。
 *
 * VS Code API:
 *   - DiagnosticCollection: 管理诊断条目集合
 *   - DiagnosticSeverity.Error: 红色波浪线
 *   - DiagnosticSeverity.Warning: 绿色波浪线
 * ============================================================
 */

import * as vscode from 'vscode';
import { DiagnosticInfo } from './bridgeClient';
import { loadConfig } from './config';

/** 全局诊断集合 */
let diagnosticCollection: vscode.DiagnosticCollection;

/**
 * 初始化诊断管理
 * 创建诊断集合并注册到 VS Code
 *
 * @param context - 扩展上下文
 */
export function registerDiagnosticManager(context: vscode.ExtensionContext): void {
  // 创建诊断集合（名为 "Mind" 在问题面板中显示）
  diagnosticCollection = vscode.languages.createDiagnosticCollection('mind');
  context.subscriptions.push(diagnosticCollection);

  // ---- 监听配置变化（实时更新下划线颜色） ----
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('mind.enableDiagnostics') ||
          event.affectsConfiguration('mind.errorColor') ||
          event.affectsConfiguration('mind.warningColor')) {
        // 清除所有诊断，等待下一次分析重建
        diagnosticCollection.clear();
      }
    })
  );
}

/**
 * 更新指定文件的诊断信息
 *
 * @param uri - 文件 URI
 * @param diagnostics - AI 分析的诊断列表
 */
export function updateDiagnostics(uri: vscode.Uri, diagnostics: DiagnosticInfo[]): void {
  const config = loadConfig();

  // 如果诊断被禁用，直接清空并返回
  if (!config.enableDiagnostics || !diagnostics || diagnostics.length === 0) {
    diagnosticCollection.set(uri, []);
    return;
  }

  // ---- 将 AI 诊断转换为 VS Code 诊断 ----
  const vsCodeDiagnostics: vscode.Diagnostic[] = diagnostics.map((d) => {
    // 计算诊断范围
    const range = new vscode.Range(
      d.line, d.character,
      d.line, d.character + (d.length || 1)
    );

    // 映射严重程度
    const severity = d.severity === 'error'
      ? vscode.DiagnosticSeverity.Error    // 红色波浪线
      : vscode.DiagnosticSeverity.Warning;  // 绿色波浪线

    // 创建诊断对象
    const diagnostic = new vscode.Diagnostic(range, d.message, severity);

    // 设置诊断来源
    diagnostic.source = 'Mind (语义分析)';

    // 为错误类型添加更详细的描述
    if (d.severity === 'error') {
      diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
      diagnostic.code = {
        value: 'mind-error',
        target: vscode.Uri.parse('https://github.com/TianQue6916/Structured-Pseudocode#error-types'),
      };
    } else {
      // 警告（绿色波浪线）添加提示
      diagnostic.code = {
        value: 'mind-uncertain',
        target: vscode.Uri.parse('https://github.com/TianQue6916/Structured-Pseudocode#warning-types'),
      };
    }

    return diagnostic;
  });

  // 更新诊断集合
  diagnosticCollection.set(uri, vsCodeDiagnostics);
}

/**
 * 清除指定文件的所有诊断
 *
 * @param uri - 文件 URI，不传则清除全部
 */
export function clearDiagnostics(uri?: vscode.Uri): void {
  if (uri) {
    diagnosticCollection.set(uri, []);
  } else {
    diagnosticCollection.clear();
  }
}

/**
 * 获取指定文件的诊断数量统计
 *
 * @param uri - 文件 URI
 * @returns { errors: number, warnings: number }
 */
export function getDiagnosticStats(uri: vscode.Uri): { errors: number; warnings: number } {
  const diagnostics = diagnosticCollection.get(uri);
  if (!diagnostics) return { errors: 0, warnings: 0 };

  let errors = 0;
  let warnings = 0;

  for (const d of diagnostics) {
    if (d.severity === vscode.DiagnosticSeverity.Error) {
      errors++;
    } else {
      warnings++;
    }
  }

  return { errors, warnings };
}
