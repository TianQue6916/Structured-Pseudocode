/**
 * ============================================================
 * Mind 插件 — 独立对话管理
 * ============================================================
 * 管理插件与 AI 后端之间的"对话"会话。
 *
 * 核心功能:
 *   1. 每个 .mind 文件自动创建专属"对话上下文"
 *   2. 切换文件时自动切换对话
 *   3. 同一文件的多次分析共享上下文（历史记录）
 *   4. 文件关闭时自动结束对话
 *
 * 注意: 当前实现中，由于 mind-bridge 是无状态 HTTP 服务，
 * 每次请求都发送完整文件内容。真正的"对话"是通过 DeepSeek
 * 的 API 缓存实现的——相同的文件内容命中缓存，无需重新推理。
 *
 * 如果需要真正的多轮对话（追踪文件修改历史），可以扩展
 * mind-bridge 添加 session 管理功能。
 * ============================================================
 */

import * as vscode from 'vscode';

/** 对话会话接口 */
interface Session {
  /** 会话唯一标识 */
  id: string;
  /** 文件路径（作为标识） */
  filePath: string;
  /** 创建时间 */
  createdAt: Date;
  /** 最后活跃时间 */
  lastActive: Date;
  /** 分析次数 */
  analysisCount: number;
}

/** 会话存储 Map: 文件路径 → Session */
const sessions = new Map<string, Session>();

/** 当前活跃会话的文件路径 */
let activeSessionPath: string | null = null;

/**
 * 获取或创建文件对应的会话
 *
 * @param filePath - 文件的绝对路径
 * @returns 会话对象
 */
export function getOrCreateSession(filePath: string): Session {
  let session = sessions.get(filePath);

  if (!session) {
    // 创建新会话
    session = {
      id: `mind-session-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`,
      filePath,
      createdAt: new Date(),
      lastActive: new Date(),
      analysisCount: 0,
    };
    sessions.set(filePath, session);
    console.log(`[会话] 创建新会话: ${filePath}`);
  }

  return session;
}

/**
 * 切换到指定文件的会话
 *
 * @param filePath - 文件路径
 */
export function activateSession(filePath: string): void {
  const session = getOrCreateSession(filePath);
  session.lastActive = new Date();
  activeSessionPath = filePath;
}

/**
 * 记录一次分析请求
 *
 * @param filePath - 文件路径
 */
export function recordAnalysis(filePath: string): void {
  const session = getOrCreateSession(filePath);
  session.analysisCount++;
  session.lastActive = new Date();
}

/**
 * 关闭文件时结束会话
 *
 * @param filePath - 文件路径
 */
export function closeSession(filePath: string): void {
  const session = sessions.get(filePath);
  if (session) {
    console.log(`[会话] 结束会话: ${filePath} (分析次数: ${session.analysisCount})`);
    sessions.delete(filePath);

    if (activeSessionPath === filePath) {
      activeSessionPath = null;
    }
  }
}

/**
 * 获取当前活跃会话
 */
export function getActiveSession(): Session | null {
  if (activeSessionPath) {
    return sessions.get(activeSessionPath) || null;
  }
  return null;
}

/**
 * 获取所有活跃会话统计
 */
export function getSessionStats(): { total: number; active: Session | null } {
  return {
    total: sessions.size,
    active: getActiveSession(),
  };
}

/**
 * 获取会话历史摘要
 * 用于在 UI 中显示
 */
export function getSessionSummary(filePath: string): string {
  const session = sessions.get(filePath);
  if (!session) return '无活跃会话';

  const minutesSinceActive = Math.floor(
    (Date.now() - session.lastActive.getTime()) / 60000
  );

  return [
    `对话标识: ${session.id.slice(0, 40)}...`,
    `分析次数: ${session.analysisCount}`,
    `上次活跃: ${minutesSinceActive} 分钟前`,
  ].join('\n');
}

/**
 * 注册对话管理的事件监听
 *
 * @param context - 扩展上下文
 */
export function registerSessionManager(context: vscode.ExtensionContext): void {
  // ---- 监听编辑器切换 ----
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.languageId === 'mind') {
        activateSession(editor.document.uri.fsPath);
      }
    })
  );

  // ---- 监听文档关闭 ----
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (document.languageId === 'mind') {
        closeSession(document.uri.fsPath);
      }
    })
  );

  // ---- 初始会话激活 ----
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.languageId === 'mind') {
    activateSession(editor.document.uri.fsPath);
  }
}
