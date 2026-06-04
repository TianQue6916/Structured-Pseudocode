/**
 * ============================================================
 * Mind 插件 — 配置管理
 * ============================================================
 * 读取 VS Code 设置面板中的用户配置，提供类型安全的访问接口。
 * 所有颜色值、开关、数值均有合理的默认值，开箱即用。
 *
 * 配置项在 package.json contributes.configuration 中定义，
 * 用户在 设置 → 扩展 → Mind Language 中可视化调整。
 * ============================================================
 */

import * as vscode from 'vscode';

/**
 * 插件配置接口
 * 映射 package.json 中的所有 configuration 属性
 */
export interface MindConfig {
  // ---- 颜色配置 ----
  actionColor: string;       // 操作词颜色（控制流关键字）
  entityColor: string;       // 实体/变量颜色
  functionColor: string;     // 函数调用颜色
  typeColor: string;         // 类型关键字颜色
  numberColor: string;       // 数字/常量颜色
  stringColor: string;       // 字符串颜色
  naturalColor: string;      // 自然语言描述颜色
  commentColor: string;      // 注释颜色
  operatorColor: string;     // 运算符颜色
  arrowColor: string;        // 指针/箭头颜色
  builtinColor: string;      // 内置函数颜色
  declarationColor: string;  // 声明关键字颜色
  nlVerbColor: string;       // 自然语言动词颜色
  nlNounColor: string;       // 自然语言名词颜色
  parameterColor: string;    // 函数参数颜色
  propertyColor: string;     // 属性访问颜色
  errorColor: string;        // 逻辑错误下划线颜色
  warningColor: string;      // 不理解/警告下划线颜色
  indentColors: string[];    // 缩进线颜色列表（按层级）

  // ---- 行为开关 ----
  enableIndentLines: boolean;    // 是否显示缩进关系线
  enableHoverHighlight: boolean; // 是否启用悬停引用高亮
  enableDiagnostics: boolean;    // 是否启用逻辑错误诊断

  // ---- 性能 ----
  analysisDebounce: number;  // 分析防抖时间（毫秒）

  // ---- 桥接服务 ----
  enableBridge: boolean;     // 是否启用桥接
  bridgePort: number;        // Mind Bridge 端口
  bridgeHost: string;        // Mind Bridge 主机地址
}

/**
 * 获取当前用户设置中的桥接服务 URL
 */
export function getBridgeUrl(config: MindConfig): string {
  return `http://${config.bridgeHost}:${config.bridgePort}`;
}

/**
 * 从 VS Code 配置中读取所有 mind 相关设置
 * 若用户未自定义，使用 package.json 中定义的默认值
 *
 * @returns {MindConfig} 完整的配置对象
 */
export function loadConfig(): MindConfig {
  const cfg = vscode.workspace.getConfiguration('mind');

  return {
    // 颜色值（format: color 在设置UI中显示颜色选择器）
    actionColor: cfg.get<string>('actionColor', '#569CD6'),
    entityColor: cfg.get<string>('entityColor', '#9CDCFE'),
    functionColor: cfg.get<string>('functionColor', '#4EC9B0'),
    typeColor: cfg.get<string>('typeColor', '#4FC1FF'),
    numberColor: cfg.get<string>('numberColor', '#B5CEA8'),
    stringColor: cfg.get<string>('stringColor', '#CE9178'),
    naturalColor: cfg.get<string>('naturalColor', '#CE9178'),
    commentColor: cfg.get<string>('commentColor', '#6A9955'),
    operatorColor: cfg.get<string>('operatorColor', '#D4D4D4'),
    arrowColor: cfg.get<string>('arrowColor', '#D4D4D4'),
    builtinColor: cfg.get<string>('builtinColor', '#DCDCAA'),
    declarationColor: cfg.get<string>('declarationColor', '#569CD6'),
    nlVerbColor: cfg.get<string>('nlVerbColor', '#C586C0'),
    nlNounColor: cfg.get<string>('nlNounColor', '#CE9178'),
    parameterColor: cfg.get<string>('parameterColor', '#9CDCFE'),
    propertyColor: cfg.get<string>('propertyColor', '#9CDCFE'),
    errorColor: cfg.get<string>('errorColor', '#F44747'),
    warningColor: cfg.get<string>('warningColor', '#6A9955'),
    indentColors: cfg.get<string[]>('indentColors', [
      '#3A3D41', '#4A4D51', '#5A5D61', '#6A6D71', '#7A7D81'
    ]),

    // 行为开关
    enableIndentLines: cfg.get<boolean>('enableIndentLines', true),
    enableHoverHighlight: cfg.get<boolean>('enableHoverHighlight', true),
    enableDiagnostics: cfg.get<boolean>('enableDiagnostics', true),

    // 性能
    analysisDebounce: cfg.get<number>('analysisDebounce', 500),

    // 桥接服务
    enableBridge: cfg.get<boolean>('enableBridge', true),
    bridgePort: cfg.get<number>('bridgePort', 3456),
    bridgeHost: cfg.get<string>('bridgeHost', 'localhost'),
  };
}

/**
 * 监听配置变更事件
 * 当用户修改设置时触发回调，使插件能实时响应
 *
 * @param callback 配置变更时的回调函数
 * @returns Disposable 用于取消监听
 */
export function onConfigChange(callback: (config: MindConfig) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    // 只监听桥接地址和端口的变化（其他配置在具体模块中单独监听）
    if (event.affectsConfiguration('mind.bridgeHost') ||
        event.affectsConfiguration('mind.bridgePort')) {
      callback(loadConfig());
    }
  });
}
