/**
 * ============================================================
 * Mind 插件 — 语义令牌着色
 * ============================================================
 * 注册 VS Code SemanticTokenProvider，根据 AI 分析结果
 * 对 .mind 文件中的词汇进行精细化着色。
 *
 * 数据结构:
 *   resultsMap: Map<URI字符串, AnalysisResult>
 *   - 由 extension.ts 在分析完成后通过 updateSemanticResult() 写入
 *   - buildTokens() 从这里读取，不走 vscode.extensions.getExtension
 *
 * 刷新机制:
 *   - 提供 onDidChangeSemanticTokens 事件发射器
 *   - extension.ts 分析完成后 fire() 通知 VS Code 重新请求
 * ============================================================
 */

import * as vscode from 'vscode';
import { AnalysisResult } from './bridgeClient';

// ============================================================
// 模块级分析结果缓存（替代原先的 getExtension 自引用）
// ============================================================

/** 分析结果缓存: URI字符串 → AnalysisResult */
const resultsMap = new Map<string, AnalysisResult>();

/**
 * 更新语义令牌数据（由 extension.ts 在分析完成后调用）
 */
export function updateSemanticResult(uri: string, result: AnalysisResult): void {
  resultsMap.set(uri, result);
}

/**
 * 清除指定文件的语义令牌数据
 */
export function clearSemanticResult(uri: string): void {
  resultsMap.delete(uri);
}

// ============================================================
// 刷新事件发射器（修复 Bug 2：令牌分析后不刷新）
// ============================================================

const _onDidChangeSemanticTokens = new vscode.EventEmitter<void>();

/**
 * 在分析完成后调用，通知 VS Code 重新请求语义令牌
 */
export function fireSemanticTokensChanged(): void {
  _onDidChangeSemanticTokens.fire();
}

// ============================================================
// Token 类型定义
// ============================================================

/**
 * 自定义语义令牌类型数组
 * 索引与 TYPE_MAP.type 一一对应
 */
const TOKEN_TYPES: string[] = [
  'keyword',   // 0: 控制流关键字 + 自然语言动词
  'function',  // 1: 函数调用/定义
  'variable',  // 2: 变量/实体
  'type',      // 3: 类型关键字
  'number',    // 4: 数字/常量
  'string',    // 5: 字符串/字符
  'operator',  // 6: 运算符
  'comment',   // 7: 注释
];

/**
 * AI 18 种 token 类型 → VS Code 内部类型索引
 */
const TYPE_MAP: Record<string, number> = {
  'keyword':   0,   // keyword
  'c-call':    1,   // function
  'py-def':    1,   // function
  'c-def':     1,   // function
  'decl':      2,   // variable
  'ref':       2,   // variable
  'type':      3,   // type
  'user-type': 3,   // type
  'nl-verb':   0,   // keyword（复用）
  'nl-noun':   2,   // variable（复用）
  'operator':  6,   // operator
  'ptr-op':    6,   // operator
  'number':    4,   // number
  'const':     4,   // number（复用）
  'string':    5,   // string
  'char':      5,   // string
  'comment':   7,   // comment
  // punct 不映射 → 跳过
};

/**
 * 注册语义令牌提供器
 */
export function registerSemanticTokenProvider(context: vscode.ExtensionContext): void {
  const legend = new vscode.SemanticTokensLegend(TOKEN_TYPES, []);

  // ---- 提供器：支持 onDidChangeSemanticTokens 事件 ----
  const provider: vscode.DocumentSemanticTokensProvider & {
    onDidChangeSemanticTokens: vscode.Event<void>;
  } = {
    onDidChangeSemanticTokens: _onDidChangeSemanticTokens.event,

    provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens {
      return buildTokens(document);
    },
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: 'mind' },
      provider,
      legend
    )
  );

  // 清理事件发射器
  context.subscriptions.push(_onDidChangeSemanticTokens);
}

/**
 * 构建文档的语义令牌数据
 */
function buildTokens(document: vscode.TextDocument): vscode.SemanticTokens {
  const result = resultsMap.get(document.uri.toString());

  if (!result || !result.tokens || result.tokens.length === 0) {
    return new vscode.SemanticTokens(new Uint32Array(0));
  }

  const builder = new vscode.SemanticTokensBuilder();

  for (const token of result.tokens) {
    const typeIdx = TYPE_MAP[token.type];
    // undefined → punct 等不着色的类型，跳过
    if (typeIdx === undefined) continue;

    const range = new vscode.Range(
      token.line, token.character,
      token.line, token.character + token.length
    );

    builder.push(range, TOKEN_TYPES[typeIdx], []);
  }

  return builder.build();
}
