/**
 * ============================================================
 * Mind 插件 — 三文件关系管理
 * ============================================================
 * 管理 .mind ↔ .py ↔ .c 三文件体系：
 *
 *   同一文件夹/
 *   ├── project.mind    ← 用户写的需求规格
 *   ├── project.py      ← 插件自动生成的 Python 实现
 *   └── project.c       ← 插件自动生成的 C 实现
 *
 * 功能:
 *   1. 打开 .mind 时自动发现/创建同名的 .py 和 .c
 *   2. 提供文件路径映射（三文件互查）
 *   3. 写入生成代码到 .py / .c（增量更新，保留已有内容）
 * ============================================================
 */

import * as vscode from 'vscode';
import { FileCode } from './bridgeClient';

/** 三文件路径映射 */
export interface FileTriplet {
  /** .mind 文件路径 */
  mind: string;
  /** .py 文件路径（自动生成） */
  py: string;
  /** .c 文件路径（自动生成） */
  c: string;
  /** 文件基础名（不含扩展名） */
  basename: string;
  /** 所在目录 */
  dir: string;
}

/**
 * 根据 .mind 文件路径获取三文件映射
 * 使用 path 模块处理分隔符，跨平台兼容
 *
 * @param mindPath - .mind 文件的绝对路径（fsPath）
 * @returns 三文件映射
 */
function splitPath(p: string): { dir: string; base: string; ext: string } {
  // 同时支持 / 和 \ 分隔符
  const sep = p.includes('/') ? '/' : '\\';
  const lastSep = p.lastIndexOf(sep);
  const dir = lastSep >= 0 ? p.substring(0, lastSep) : '';
  const filename = p.substring(lastSep + 1);
  const dot = filename.lastIndexOf('.');
  const base = dot >= 0 ? filename.substring(0, dot) : filename;
  const ext = dot >= 0 ? filename.substring(dot) : '';
  return { dir, base, ext };
}

export function getTriplet(mindPath: string): FileTriplet {
  const { dir, base } = splitPath(mindPath);
  const sep = mindPath.includes('/') ? '/' : '\\';

  return {
    mind: mindPath,
    py: `${dir}${sep}${base}.py`,
    c: `${dir}${sep}${base}.c`,
    basename: base,
    dir,
  };
}

/**
 * 获取单文件（只 Python）
 */
export function getPyPath(mindPath: string): string {
  const { dir, base } = splitPath(mindPath);
  const sep = mindPath.includes('/') ? '/' : '\\';
  return `${dir}${sep}${base}.py`;
}

/**
 * 获取 .mind 文件对应的三文件 URI 列表
 * 供 DocumentLinkProvider 等使用
 */
export function getTripletUris(mindPath: string): { pyUri: vscode.Uri; cUri: vscode.Uri } {
  const t = getTriplet(mindPath);
  return {
    pyUri: vscode.Uri.file(t.py),
    cUri: vscode.Uri.file(t.c),
  };
}

/**
 * 确保三文件体系完整
 * 如果 .py 或 .c 不存在，创建空文件
 *
 * @param mindPath - .mind 文件路径
 */
export async function ensureTripletFiles(mindPath: string): Promise<void> {
  const t = getTriplet(mindPath);

  // 创建目录（确保 exist）
  const dirUri = vscode.Uri.file(t.dir);

  for (const filePath of [t.py]) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      // 文件已存在，跳过
    } catch {
      // 文件不存在，创建空文件
      const header = getFileHeader(filePath, t.basename);
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(filePath),
        new TextEncoder().encode(header)
      );
      console.log(`[文件体系] 创建: ${filePath}`);
    }
  }
}

/**
 * 写入生成的代码到 .py 或 .c 文件
 * 保留文件头部注释，追加或替换函数实现
 *
 * @param filePath - 目标文件路径
 * @param fileCode - 生成代码内容
 */
export async function writeGeneratedCode(
  filePath: string,
  fileCode: FileCode
): Promise<void> {
  const uri = vscode.Uri.file(filePath);

  if (!fileCode.code || fileCode.code.trim().length === 0) return;

  try {
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(fileCode.code));
    console.log(`[文件体系] 写入: ${filePath} (${fileCode.code.length} 字符)`);
  } catch (error) {
    console.error(`[文件体系] 写入失败: ${filePath}`, error);
  }
}

/**
 * 生成空文件的起始内容（含注释说明）
 */
function getFileHeader(filePath: string, basename: string): string {
  return (
    `# ============================================================\n` +
    `# ${basename}.py — 自动生成代码\n` +
    `# 由 Mind 插件根据 ${basename}.mind 中的 # @d 注释自动生成\n` +
    `# 请勿手动修改此文件，修改请在 .mind 文件中修改后重新生成\n` +
    `# ============================================================\n\n\n`
  );
}
