# Structured Pseudocode (Mind Language System)

自然语言驱动的结构化需求描述与多语言代码生成系统。

## 概述

一个完整的 VS Code 插件生态，实现 `.mind` 文件的智能语义分析和 Python/C 双语言代码自动生成。

### 核心能力

| 能力 | 说明 |
|------|------|
| **语义分析** | 18 种词汇类型的实时高亮（TextMate + SemanticTokens） |
| **缩进关系** | 分支符号 `├─ └─ │` 可视化逻辑层级 |
| **悬停引用** | 实体关联高亮（灰色半透明），数据已缓存，零额外 API 请求 |
| **双色诊断** | 红色波浪线（确定错误）+ 绿色波浪线（AI 不确定） |
| **代码生成** | `# @d` 注释驱动 → 自动生成 Python 3 + C11 双版本实现 |
| **超链接导航** | `.mind` ↔ `.py` ↔ `.c` 三文件可点击跳转 |
| **逐行触发** | 仅按 Enter 触发分析，行中编辑不浪费 token |
| **Token 追踪** | 状态栏实时显示累计 Token 消耗 |

## 项目结构

```
Structured-Pseudocode/
├── bridge/                    # 桥接服务 (Node.js + Express)
│   ├── src/
│   │   ├── index.js           # HTTP 服务入口 (:3456)
│   │   ├── deepseekClient.js  # DeepSeek API 客户端
│   │   ├── mindAnalyzer.js    # 语义分析引擎
│   │   └── codeGenerator.js   # 代码生成引擎
│   ├── package.json
│   └── README.md
│
├── extension/                 # VS Code 插件 (TypeScript)
│   ├── src/
│   │   ├── extension.ts       # 主入口
│   │   ├── config.ts          # 设置管理
│   │   ├── bridgeClient.ts    # 桥接通信客户端
│   │   ├── cache.ts           # 本地分析缓存
│   │   ├── semanticTokens.ts  # 语义令牌着色
│   │   ├── indentDecoration.ts# 缩进关系线
│   │   ├── hoverFeature.ts    # 悬停引用高亮
│   │   ├── diagnosticManager.ts# 诊断管理
│   │   ├── sessionManager.ts  # 对话管理
│   │   ├── fileTriplet.ts     # 三文件关系管理
│   │   └── docLinks.ts        # 超链接导航
│   ├── syntaxes/
│   │   └── mind.tmLanguage.json # TextMate 语法
│   ├── package.json
│   └── tsconfig.json
│
└── package/                   # 安装包
    ├── start.bat              # 一键启动脚本
    ├── 使用教程.txt
    └── 示例.mind
```

## 快速开始

### 前提条件

- [Node.js](https://nodejs.org/) 18+
- [VS Code](https://code.visualstudio.com/) 1.82+
- DeepSeek API Key

### 1. 启动桥接服务

```bash
cd bridge
npm install
# 编辑 .env 填入 DEEPSEEK_API_KEY
npm start
```

### 2. 构建并安装 VS Code 插件

```bash
cd extension
npm install
npm run build
npx vsce package
# 在 VS Code 中安装生成的 .vsix
```

### 3. 创建 .mind 文件

```mind
# @d 实现链表反转
Define function reverse_list
input: head of linked list
output: reversed head
if head is null or head.next is null
  return head
```

按 Enter → 自动分析 → 同目录生成 `.py` + `.c` 文件。

## 架构

```
用户编辑 .mind → 按 Enter → extension.ts
  → POST /analyze → bridge/mindAnalyzer.js → DeepSeek API
  → JSON {tokens, entities, nesting, diagnostics}
  → 更新颜色/缩进线/悬停/诊断

检测到 # @d →
  → POST /generate → bridge/codeGenerator.js → DeepSeek API
  → {py: {code, links}, c: {code, links}}
  → 写入 .py / .c 文件
  → 注册超链接导航
```

## Token 优化策略

- **全文件发送**：每次发完整文件 → 最大化 DeepSeek 缓存命中
- **极简提示词**：系统提示词 ≤ 80 tokens，稳定不变
- **逐行触发**：仅按 Enter 触发，行中编辑忽略
- **请求去重**：版本号机制丢弃过期分析响应
- **Hover 缓存**：实体数据存内存，悬停零 API 请求

## 成本估算

| 场景 | Token 消耗 | 费用（估） |
|------|-----------|-----------|
| 首次分析 10 行文件 | ~3,300 | ~$0.003 |
| 后续修改（缓存命中） | ~1,500 | ~$0.0015 |
| 代码生成（含 # @d） | ~5,000 | ~$0.005 |
