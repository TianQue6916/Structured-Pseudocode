/**
 * ============================================================
 * Mind 插件 — 缩进关系线装饰
 * ============================================================
 * 在文本左侧绘制彩色垂直缩进线，表示逻辑从属关系。
 *
 * 效果（使用 ASCII 字符，兼容所有字体）:
 *   | Count node num
 *   | if num >= 30
 *   |   |-- delete minimum num
 *   |   \-- add node count to total
 *   | print result
 *
 * 实现:
 *   - 顶层级 (level 0): 使用 │  前缀
 *   - 子层级 (level > 0): 根据是否有后续兄弟节点决定 ├─ 或 └─
 *   - 每层颜色不同，可配置
 *   - 同时渲染连续竖线（延续线），显示从属结构
 * ============================================================
 */

import * as vscode from 'vscode';
import { loadConfig, MindConfig } from './config';

/**
 * 每个层级需要两种装饰类型:
 *   branchDecos[l]     — 有后续兄弟 → "├─ "
 *   lastChildDecos[l]  — 最后一个子节点 → "└─ "
 *   contDecos[l]       — 延续竖线（该层级之后还有行）→ "│ "
 */
let branchDecos: vscode.TextEditorDecorationType[] = [];
let lastChildDecos: vscode.TextEditorDecorationType[] = [];
let contDecos: vscode.TextEditorDecorationType[] = [];

/**
 * 注册缩进关系线
 */
export function registerIndentDecorations(context: vscode.ExtensionContext): void {
  rebuildDecorationTypes(loadConfig());

  // ---- 活跃编辑器切换 ----
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.languageId === 'mind') {
        renderIndentLines(editor);
      }
    })
  );

  // ---- 文本内容变化 ----
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document && editor.document.languageId === 'mind') {
        renderIndentLines(editor);
      }
    })
  );

  // ---- 配置变化 ----
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('mind.indentColors') || event.affectsConfiguration('mind.enableIndentLines')) {
        rebuildDecorationTypes(loadConfig());
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.languageId === 'mind') renderIndentLines(editor);
      }
    })
  );

  // ---- 初始渲染 ----
  if (vscode.window.activeTextEditor?.document.languageId === 'mind') {
    renderIndentLines(vscode.window.activeTextEditor);
  }
}

/**
 * 重建所有装饰类型
 */
function rebuildDecorationTypes(config: MindConfig): void {
  // 清理旧装饰
  for (const arr of [branchDecos, lastChildDecos, contDecos]) {
    for (const d of arr) d.dispose();
  }
  branchDecos = [];
  lastChildDecos = [];
  contDecos = [];

  if (!config.enableIndentLines) return;

  const maxLevels = Math.min(config.indentColors.length, 8);
  for (let l = 0; l < maxLevels; l++) {
    const color = config.indentColors[l] || config.indentColors[config.indentColors.length - 1];

    // +-- 分支（有后续兄弟）
    branchDecos.push(
      vscode.window.createTextEditorDecorationType({
        before: { contentText: '+-- ', color, fontWeight: 'normal', margin: '0 0 0 0' },
        opacity: '0.5',
        rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
      })
    );

    // \-- 结尾（最后一个子节点）
    lastChildDecos.push(
      vscode.window.createTextEditorDecorationType({
        before: { contentText: '\\-- ', color, fontWeight: 'normal', margin: '0 0 0 0' },
        opacity: '0.5',
        rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
      })
    );

    // | 延续竖线（该层级之后还有内容）
    contDecos.push(
      vscode.window.createTextEditorDecorationType({
        before: { contentText: '| ', color, fontWeight: 'normal', margin: '0 0 0 0' },
        opacity: '0.4',
        rangeBehavior: vscode.DecorationRangeBehavior.OpenOpen,
      })
    );
  }
}

/**
 * 解析文档中的缩进信息
 * 返回按行索引排列的 { level, text, isEmpty }
 */
function parseIndents(document: vscode.TextDocument): Array<{ level: number; text: string; isEmpty: boolean }> {
  const result: Array<{ level: number; text: string; isEmpty: boolean }> = [];
  for (let i = 0; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    if (text.trim() === '') {
      result.push({ level: -1, text: '', isEmpty: true });
    } else {
      const indentMatch = text.match(/^(\s*)/);
      const indentLen = indentMatch ? indentMatch[1].length : 0;
      result.push({ level: Math.floor(indentLen / 2), text, isEmpty: false });
    }
  }
  return result;
}

/**
 * 渲染缩进关系线
 * 基于缩进层级计算分支逻辑
 */
export function renderIndentLines(editor: vscode.TextEditor): void {
  const config = loadConfig();
  if (!config.enableIndentLines || indentDecorationsEmpty()) {
    clearAllDecorations(editor);
    return;
  }

  const lines = parseIndents(editor.document);
  const n = lines.length;

  // 清除所有旧装饰
  clearAllDecorations(editor);

  // 每层级的三种装饰分别收集 ranges
  const branchRanges: vscode.Range[][] = branchDecos.map(() => []);
  const lastRanges: vscode.Range[][] = lastChildDecos.map(() => []);
  const contRanges: vscode.Range[][] = contDecos.map(() => []);

  const maxLevel = branchDecos.length;

  // ---- 第一遍：计算"该层级之后是否还有内容"（延续竖线） ----
  // hasDeeper[maxLevel][lineIdx] = 该层级在 lineIdx 之后还有非空行
  const hasDeeper: boolean[][] = Array.from({ length: maxLevel }, () => new Array(n).fill(false));

  for (let lvl = 0; lvl < maxLevel; lvl++) {
    let found = false;
    for (let i = n - 1; i >= 0; i--) {
      if (lines[i].isEmpty) {
        hasDeeper[lvl][i] = found;
      } else {
        // 当前行是否达到了 lvl？
        hasDeeper[lvl][i] = found || lines[i].level >= lvl;
        if (lines[i].level >= lvl) found = true;
      }
    }
  }

  // ---- 第二遍：分配装饰 ----
  for (let i = 0; i < n; i++) {
    if (lines[i].isEmpty) continue;
    const lvl = lines[i].level;
    if (lvl < 0 || lvl >= maxLevel) continue;

    // 判断当前行是否是其父级下的最后一个子节点
    const isLast = isLastChild(lines, i);

    // 当前的线
    const range = new vscode.Range(i, 0, i, 0);

    if (lvl === 0) {
      contRanges[0].push(range);
    } else if (isLast) {
      lastRanges[lvl].push(range);
    } else {
      branchRanges[lvl].push(range);
    }

    // 为上层绘制延续竖线
    for (let upper = 0; upper < lvl; upper++) {
      if (hasDeeper[upper][i]) {
        contRanges[upper].push(range);
      }
    }
  }

  // ---- 应用装饰 ----
  for (let lvl = 0; lvl < maxLevel; lvl++) {
    if (branchRanges[lvl].length > 0) editor.setDecorations(branchDecos[lvl], branchRanges[lvl]);
    if (lastRanges[lvl].length > 0) editor.setDecorations(lastChildDecos[lvl], lastRanges[lvl]);
    if (contRanges[lvl].length > 0) editor.setDecorations(contDecos[lvl], contRanges[lvl]);
  }
}

/**
 * 判断 lines[i] 是否为其父级下的最后一个子节点
 */
function isLastChild(lines: Array<{ level: number; isEmpty: boolean }>, i: number): boolean {
  const lvl = lines[i].level;
  if (lvl <= 0) return true;

  // 向后找下一个非空行
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].isEmpty) continue;
    const nextLvl = lines[j].level;
    if (nextLvl <= lvl) {
      // 找到了同层或上层节点 → 当前节点不是最后一个
      return false;
    }
  }
  // 没找到同层或上层节点 → 当前节点是最后一个
  return true;
}

/**
 * 根据 AI 分析的 nesting 数据更新缩进线
 * 当前实现：忽略 AI nesting 数据，统一用本地缩进计算
 * （AI 的 nesting 可能只覆盖部分行，本地计算更完整）
 */
export function updateDecorationsFromAnalysis(
  editor: vscode.TextEditor,
  _nesting: unknown[]  // 保留签名兼容，但不使用
): void {
  // 用本地方法重新计算（nesting 数据可能不全）
  renderIndentLines(editor);
}

function clearAllDecorations(editor: vscode.TextEditor): void {
  for (const arr of [branchDecos, lastChildDecos, contDecos]) {
    for (const d of arr) editor.setDecorations(d, []);
  }
}

function indentDecorationsEmpty(): boolean {
  return branchDecos.length === 0 && lastChildDecos.length === 0 && contDecos.length === 0;
}
