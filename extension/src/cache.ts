/**
 * ============================================================
 * Mind 插件 — 本地分析缓存
 * ============================================================
 * 缓存 AI 分析结果，避免对未修改文件重复请求。
 *
 * 缓存策略:
 *   - 键: 文件路径 + 文件内容哈希（前 64 字符）
 *   - 值: 完整的分析结果（tokens/entities/nesting/diagnostics）
 *   - 失效: 文件内容变化时清除该文件缓存
 *   - 大小: 最多缓存 10 个文件的分析结果
 *
 * 缓存命中优势:
 *   - 用户切换文件时无需重新请求 AI
 *   - 文件分析完成后，后续的悬停/高亮操作直接读缓存
 *   - 结合 DeepSeek 的 API 缓存，端到端延迟大幅降低
 * ============================================================
 */

import { AnalysisResult } from './bridgeClient';

/** 缓存条目 */
interface CacheEntry {
  /** 文件路径 */
  filePath: string;
  /** 内容摘要（用于判断内容是否变化） */
  contentDigest: string;
  /** 分析结果 */
  result: AnalysisResult;
  /** 缓存时间戳 */
  timestamp: number;
}

/** 最大缓存文件数 */
const MAX_CACHE_SIZE = 10;

/** 缓存存储（Map: 文件路径 → 缓存条目） */
const cache = new Map<string, CacheEntry>();

/**
 * 生成内容摘要
 * 取文件内容前 64 个字符 + 内容长度作为快速摘要，
 * 足够判断文件是否变化，比完整哈希更快
 */
function makeDigest(content: string): string {
  return `${content.length}:${content.slice(0, 64)}`;
}

/**
 * 获取缓存的分析结果
 *
 * @param filePath - 文件绝对路径
 * @param content - 当前文件内容
 * @returns 缓存的分析结果，缓存未命中返回 null
 */
export function getCachedResult(filePath: string, content: string): AnalysisResult | null {
  const entry = cache.get(filePath);
  if (!entry) return null;

  // 检查内容是否变化
  const currentDigest = makeDigest(content);
  if (entry.contentDigest !== currentDigest) {
    // 内容已变化，清除该缓存
    cache.delete(filePath);
    return null;
  }

  return entry.result;
}

/**
 * 存入缓存
 *
 * @param filePath - 文件绝对路径
 * @param content - 文件内容
 * @param result - 分析结果
 */
export function setCachedResult(filePath: string, content: string, result: AnalysisResult): void {
  // 检查缓存大小限制，超出时淘汰最旧的
  if (cache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(filePath, {
    filePath,
    contentDigest: makeDigest(content),
    result,
    timestamp: Date.now(),
  });
}

/**
 * 清除指定文件的缓存
 */
export function clearCache(filePath: string): void {
  cache.delete(filePath);
}

/**
 * 清除所有缓存
 */
export function clearAllCache(): void {
  cache.clear();
}

/**
 * 获取当前缓存统计
 */
export function getCacheStats(): { size: number; files: string[] } {
  return {
    size: cache.size,
    files: Array.from(cache.keys()),
  };
}
