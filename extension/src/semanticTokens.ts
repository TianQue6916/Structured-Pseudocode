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
  'keyword',       // 0: 控制流关键字
  'function',      // 1: 函数调用
  'variable',      // 2: 变量引用
  'type',          // 3: 类型关键字
  'number',        // 4: 数字常量
  'string',        // 5: 字符串
  'operator',      // 6: 运算符
  'comment',       // 7: 注释
  'method',        // 8: 方法调用
  'declaration',   // 9: 声明关键字 (def/let/const)
  'parameter',     // 10: 函数参数
  'property',      // 11: 属性访问
  'nlVerb',        // 12: 自然语言动词
  'nlNoun',        // 13: 自然语言名词
  'builtin',       // 14: 内置函数/关键字
  'entity',        // 15: 实体名
  'arrow',         // 16: 指针/箭头
  'macro',         // 17: 特殊常量
];

/**
 * AI 18 种 token 类型 → VS Code 内部类型索引
 */
const TYPE_MAP: Record<string, number> = {
  // 控制流
  'keyword':   0,   // keyword
  'decl':      9,   // declaration（声明关键字）

  // 函数
  'c-call':    1,   // function（C函数调用）
  'py-def':    8,   // method（Python函数定义）
  'c-def':     8,   // method（C函数定义）
  'builtin':   14,  // builtin（内置函数）

  // 变量
  'ref':       2,   // variable（变量引用）
  'param':     10,  // parameter（函数参数）
  'prop':      11,  // property（属性）

  // 类型
  'type':      3,   // type（类型关键字）
  'user-type': 3,   // type（自定义类型）

  // 自然语言
  'nl-verb':   12,  // nlVerb（自然语言动词）
  'nl-noun':   13,  // nlNoun（自然语言名词）

  // 运算
  'operator':  6,   // operator（运算符）
  'ptr-op':    16,  // arrow（指针/箭头）

  // 字面量
  'number':    4,   // number（数字）
  'const':     17,  // macro（特殊常量）
  'string':    5,   // string（字符串）
  'char':      5,   // string（字符）

  // 注释
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
