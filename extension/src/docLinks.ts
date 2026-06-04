/**
 * ============================================================
 * Mind 插件 — 超链接导航
 * ============================================================
 * 在三文件之间创建可点击的超链接：
 *
 *   .mind ←──────────────── .py
 *    # @d 实现XX             def XX():
 *     ↑ 可点击                 ↑ 可点击
 *     └──────────────────── .c
 *                            void XX() {
 *
 * DocumentLinkProvider 实现:
 *   - .mind 文件: # @d 注释 → 可点击跳转到对应的 .py/.c 函数
 *   - .py 文件: 函数签名 → 可点击跳回对应的 .mind 注释
 *   - .c 文件: 函数签名 → 可点击跳回对应的 .mind 注释
 *
 * 数据来源: GenerationResult 中的 links 数组
 * ============================================================
 */

import * as vscode from 'vscode';
import { GenerationResult } from './bridgeClient';
import { getTripletUris } from './fileTriplet';

/**
 * 当前文档的代码生成链接数据
 * Map: .mind URI → GenerationResult
 */
const generationData = new Map<string, GenerationResult>();

/**
 * 更新生成结果（由 extension.ts 在生成完成后调用）
 */
export function updateGenerationData(uri: string, result: GenerationResult): void {
  generationData.set(uri, result);
}

/**
 * 注册所有超链接提供器
 *
 * @param context - 扩展上下文
 */
export function registerDocLinks(context: vscode.ExtensionContext): void {
  // ---- 1. .mind → .py / .c 链接 ----
  // 在 .mind 文件中，# @d 注释文本可点击，指向生成的 .py/.c 函数
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      { language: 'mind', scheme: 'file' },
      new MindLinkProvider()
    )
  );

  // ---- 2. .py → .mind 反向链接 ----
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      { language: 'python', scheme: 'file' },
      new GeneratedFileLinkProvider('py')
    )
  );

  // ---- 3. .c → .mind 反向链接 ----
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      { language: 'c', scheme: 'file' },
      new GeneratedFileLinkProvider('c')
    )
  );
}

/**
 * .mind 文件中的 DocumentLinkProvider
 * 将 # @d 注释转换为可点击链接，跳转到 .py/.c 中的实现
 */
class MindLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const result = generationData.get(document.uri.toString());
    if (!result) return [];

    const links: vscode.DocumentLink[] = [];
    const uris = getTripletUris(document.uri.fsPath);

    // 处理 Python 链接
    if (result.links) {
      for (const link of result.links) {
        const range = new vscode.Range(link.mindLine, 0, link.mindLine, 255);
        const target = uris.pyUri.with({
          fragment: `${link.fileLine + 1}`,
        });
        links.push(new vscode.DocumentLink(range, target));
      }
    }

    return links;
  }
}

/**
 * 生成文件（.py / .c）中的 DocumentLinkProvider
 * 将函数签名处的注释转换为可点击链接，跳回 .mind 中的 # @d
 */
class GeneratedFileLinkProvider implements vscode.DocumentLinkProvider {
  constructor(private lang: 'py' | 'c') {}

  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    for (const [mindUri, result] of generationData) {
      if (!result.links || result.links.length === 0) continue;

      const mindPath = vscode.Uri.parse(mindUri).fsPath;
      const uris = getTripletUris(mindPath);
      const targetUri = this.lang === 'py' ? uris.pyUri : uris.cUri;
      if (document.uri.fsPath.toLowerCase() !== targetUri.fsPath.toLowerCase()) continue;

      const links: vscode.DocumentLink[] = [];
      const mindTarget = vscode.Uri.parse(mindUri).with({
        fragment: `${result.links[0].mindLine + 1}`,
      });

      for (const link of result.links) {
        const range = new vscode.Range(link.fileLine, 0, link.fileLine, 100);
        links.push(new vscode.DocumentLink(range, mindTarget));
      }
      return links;
    }
    return [];
  }
}
