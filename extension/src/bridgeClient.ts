/**
 * ============================================================
 * Mind 插件 — 桥接服务通信客户端
 * ============================================================
 * 与 mind-bridge HTTP 服务通信，发送 .mind 文件内容，
 * 接收语义分析结果（tokens/entities/nesting/diagnostics）。
 *
 * 通信协议:
 *   POST http://{host}:{port}/analyze
 *   Request:  { content: ".mind 文件完整内容" }
 *   Response: { tokens, entities, nesting, diagnostics }
 *
 * 容错设计:
 *   - 桥接服务不可用时返回 null（插件降级为纯 TextMate 高亮）
 *   - 请求超时默认 30 秒
 *   - 网络错误时自动重试 1 次
 * ============================================================
 */

import * as vscode from 'vscode';

/**
 * 分析结果的数据结构
 * 与 mind-bridge 返回的 JSON 格式一致
 */
export interface AnalysisResult {
  /** 语义令牌列表 */
  tokens: TokenInfo[];
  /** 实体关系映射 */
  entities: EntityInfo[];
  /** 缩进层级信息 */
  nesting: NestingInfo[];
  /** 诊断信息（错误/警告） */
  diagnostics: DiagnosticInfo[];
  /** Token 用量统计（API 返回时才有） */
  tokenUsage?: TokenUsage;
}

/** 单个语义令牌 */
export interface TokenInfo {
  line: number;        // 行号（0 起始）
  character: number;   // 列号
  length: number;      // 长度
  type: string;        // 令牌类型（18 种之一）
  entityId?: string;   // 所属实体 ID（可选）
}

/** 实体定义（逻辑上指向同一对象的词汇集合） */
export interface EntityInfo {
  id: string;          // 唯一标识
  name: string;        // 实体名称
  type: string;        // 实体类型: variable | function | concept
  occurrences: Array<{ line: number; character: number; length: number }>;  // 所有出现位置
  description: string; // 实体描述
}

/** 缩进层级 */
export interface NestingInfo {
  line: number;   // 行号
  level: number;  // 缩进层级（0 = 最顶层）
}

/** 诊断信息 */
export interface DiagnosticInfo {
  line: number;       // 行号
  character: number;  // 列号
  length: number;     // 长度
  message: string;    // 诊断消息
  severity: 'error' | 'warning';  // 严重程度
}

/** Token 用量统计 */
export interface TokenUsage {
  prompt: number;      // 提示词 token 数
  completion: number;  // 生成 token 数
  total: number;       // 总 token 数
  cached: number;      // 缓存命中的 prompt token 数
}

/**
 * 调用桥接服务分析 .mind 文件内容
 *
 * @param content - 完整的 .mind 文件内容
 * @param host - 桥接服务主机地址
 * @param port - 桥接服务端口
 * @returns 分析结果，连接失败返回 null
 */
export async function analyzeContent(
  content: string,
  host: string,
  port: number
): Promise<AnalysisResult | null> {
  const url = `http://${host}:${port}/analyze`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 秒超时

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[Mind Bridge] HTTP ${response.status}: ${response.statusText}`);
      return null;
    }

    const data: unknown = await response.json();

    // ---- 运行时类型校验（修复 Bug 5） ----
    if (!isValidAnalysisResult(data)) {
      console.warn('[Mind Bridge] 响应格式不正确，已忽略');
      return null;
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.warn('[Mind Bridge] 请求超时');
      } else if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
        console.warn('[Mind Bridge] 无法连接到桥接服务，请确保 mind-bridge 已启动');
      } else {
        console.warn('[Mind Bridge] 通信错误:', error.message);
      }
    }

    return null;
  }
}

// ============================================================
// 代码生成接口
// ============================================================

/** 单个代码文件的生成结果 */
export interface FileCode {
  /** 完整的文件代码 */
  code: string;
  /** 超链接映射：.mind 注释行 → 实现函数位置 */
  links: Array<{
    mindLine: number;   // .mind 中 # @d 的行号（0起始）
    fileLine: number;   // .py/.c 中函数起始行号（0起始）
    name: string;       // 函数名
  }>;
}

/** 代码生成响应 */
export interface GenerationResult {
  py: FileCode;
  c: FileCode;
  /** 桥接端返回的备注 */
  note?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 调用桥接服务生成 Python + C 代码
 *
 * @param content - 完整的 .mind 文件内容
 * @param host - 桥接服务主机
 * @param port - 桥接服务端口
 * @returns 生成结果，失败返回 null
 */
export async function generateCode(
  content: string,
  host: string,
  port: number
): Promise<GenerationResult | null> {
  const url = `http://${host}:${port}/generate`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 秒超时

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) return null;

    const data: GenerationResult = await response.json();
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[Mind Generate] 代码生成请求失败:', error instanceof Error ? error.message : '');
    return null;
  }
}

/**
 * 运行时校验桥接响应是否符合 AnalysisResult 结构
 */
function isValidAnalysisResult(data: unknown): data is AnalysisResult {
  if (!data || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  // 检查 tokens
  if (!Array.isArray(obj.tokens)) return false;
  for (const t of obj.tokens) {
    if (!t || typeof t !== 'object') return false;
    const tok = t as Record<string, unknown>;
    if (typeof tok.line !== 'number' || typeof tok.character !== 'number' ||
        typeof tok.length !== 'number' || typeof tok.type !== 'string') {
      return false;
    }
  }

  // entities 可选，如果有则校验
  if (obj.entities !== undefined) {
    if (!Array.isArray(obj.entities)) return false;
  }

  // nesting 可选
  if (obj.nesting !== undefined) {
    if (!Array.isArray(obj.nesting)) return false;
  }

  // diagnostics 可选
  if (obj.diagnostics !== undefined) {
    if (!Array.isArray(obj.diagnostics)) return false;
  }

  return true;
}

/**
 * 检查桥接服务是否在线
 *
 * @param host - 桥接服务主机
 * @param port - 桥接服务端口
 * @returns 是否可用
 */
export async function checkBridgeHealth(host: string, port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://${host}:${port}/health`, {
      signal: AbortSignal.timeout(5000), // 5 秒超时
    });
    return response.ok;
  } catch {
    return false;
  }
}
