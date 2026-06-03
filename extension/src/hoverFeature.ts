/**
 * ============================================================
 * Mind 插件 — 悬停引用高亮 + 实体信息弹窗
 * ============================================================
 * 当用户悬停在一个实体（变量/函数/概念）上时：
 *   1. 灰色半透明高亮所有逻辑上指向同一对象的词汇
 *   2. 弹窗显示实体信息（名称、类型、描述、引用数量）
 *
 * 效果类似 VS Code 内置的"悬停变量高亮所有引用"。
 *
 * 使用 VS Code API:
 *   - DocumentHighlightProvider → 灰色半透明高亮
 *   - HoverProvider → 弹窗信息
 *
 * 数据来源: AI 分析结果中的 entities 字段
 *   entities[].occurrences 列出了同一实体的所有出现位置
 * ============================================================
 */

import * as vscode from 'vscode';
import { EntityInfo } from './bridgeClient';
import { loadConfig } from './config';

/**
 * 当前文档的分析结果（由 extension.ts 更新）
 * Map: 文件 URI → 实体列表
 */
const analysisResults = new Map<string, EntityInfo[]>();

/**
 * 更新指定文档的实体分析结果
 * 在每次 AI 分析完成后调用
 *
 * @param uri - 文档 URI
 * @param entities - 实体列表
 */
export function updateEntities(uri: string, entities: EntityInfo[]): void {
  analysisResults.set(uri, entities);
}

/**
 * 获取指定位置的实体
 * 边界判断: character 在 [occ.character, occ.character + occ.length) 范围内
 */
function findEntityAtPosition(
  entities: EntityInfo[],
  line: number,
  character: number
): EntityInfo | null {
  for (const entity of entities) {
    for (const occ of entity.occurrences) {
      if (occ.line === line &&
          character >= occ.character &&
          character < occ.character + occ.length) {  // 修复: < 而非 <=
        return entity;
      }
    }
  }
  return null;
}

/**
 * 注册悬停引用高亮功能
 *
 * @param context - 扩展上下文
 */
export function registerHoverFeature(context: vscode.ExtensionContext): void {
  const config = loadConfig();

  // ---- DocumentHighlightProvider: 灰色高亮所有引用 ----
  const highlightProvider = new (class implements vscode.DocumentHighlightProvider {
    provideDocumentHighlights(
      document: vscode.TextDocument,
      position: vscode.Position,
      _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentHighlight[]> {
      // 检查设置开关（修复 Bug 3）
      if (!loadConfig().enableHoverHighlight) return [];

      const entities = analysisResults.get(document.uri.toString());
      if (!entities || entities.length === 0) return [];

      // 查找当前光标所在的实体
      const entity = findEntityAtPosition(entities, position.line, position.character);
      if (!entity) return [];

      // 为该实体的所有 occurrence 创建高亮
      return entity.occurrences.map((occ) => {
        const range = new vscode.Range(
          occ.line, occ.character,
          occ.line, occ.character + occ.length
        );
        return new vscode.DocumentHighlight(range, vscode.DocumentHighlightKind.Read);
      });
    }
  });

  context.subscriptions.push(
    vscode.languages.registerDocumentHighlightProvider(
      { language: 'mind' },
      highlightProvider
    )
  );

  // ---- HoverProvider: 弹窗显示实体信息 ----
  const hoverProvider = new (class implements vscode.HoverProvider {
    provideHover(
      document: vscode.TextDocument,
      position: vscode.Position,
      _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Hover> {
      // 检查设置开关（修复 Bug 3）
      if (!loadConfig().enableHoverHighlight) return null;

      const entities = analysisResults.get(document.uri.toString());
      if (!entities || entities.length === 0) return null;

      // 查找当前悬停的实体
      const entity = findEntityAtPosition(entities, position.line, position.character);
      if (!entity) return null;

      // 构建弹窗内容
      const typeLabel = entityTypeToChinese(entity.type);
      const occurrencesCount = entity.occurrences.length;

      const markdown = new vscode.MarkdownString();
      markdown.isTrusted = true;
      markdown.appendMarkdown(`**${escapeMarkdown(entity.name)}** \\\n`);
      markdown.appendMarkdown(`类型: ${typeLabel} \\\n`);
      markdown.appendMarkdown(`引用: ${occurrencesCount} 处 \\\n`);
      if (entity.description) {
        markdown.appendMarkdown(`---\n${escapeMarkdown(entity.description)}\n`);
      }
      // 添加灰色提示
      markdown.appendMarkdown(`\n---\n_悬停时灰色高亮显示所有引用_\n`);

      return new vscode.Hover(markdown);
    }
  });

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: 'mind' },
      hoverProvider
    )
  );
}

/**
 * 将实体类型映射为中文描述
 */
function entityTypeToChinese(type: string): string {
  const map: Record<string, string> = {
    'variable': '变量',
    'function': '函数',
    'concept': '概念',
    'class': '类',
    'module': '模块',
    'constant': '常量',
  };
  return map[type] || type;
}

/**
 * 转义 Markdown 特殊字符
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1');
}
