# Mind Language — VS Code Extension

为 `.mind` 文件提供完整的智能语言支持与代码生成。

## 功能

| 功能 | 说明 |
|------|------|
| 🎨 **语义高亮** | 18 种词汇类型各有专属配色 |
| 📐 **缩进关系线** | `│ ├─ └─` 分支符号，层级颜色可配置 |
| 🖱 **悬停引用高亮** | 灰色高亮同义词 + 实体信息弹窗（**零额外 API 请求**） |
| 🔴 **逻辑错误诊断** | 红色波浪线标记确定错误 |
| 🟢 **不理解标记** | 绿色波浪线标记 AI 不确定内容 |
| ⚡ **逐行分析** | 仅按 Enter 触发，行中编辑不消耗 token |
| 🐍 **Python 代码生成** | `# @d` 注释 → 自动生成含详细注释的 Python 3 代码 |
| 🔧 **C 代码生成** | 同时生成可编译的 C11 代码 |
| 🔗 **超链接导航** | `.mind` ↔ `.py` ↔ `.c` 可点击跳转 |
| 💰 **Token 追踪** | 状态栏显示累计消耗 + 缓存命中 |
| ⚙️ **图形化设置** | 16 项可配置（颜色选择器/开关/端口） |

## 安装

### 从 VSIX 安装

```bash
cd extension
npm install
npm run build
npx vsce package
# VS Code → 扩展 → ... → 从 VSIX 安装
```

### 开发模式

```bash
cd extension
npm install
code .
# F5 启动扩展开发主机
```

## 使用方法

### 创建 .mind 文件

```mind
# @d 实现数组去重
Define function remove_duplicates
input: sorted array arr
output: new length

if arr is empty return 0
set write_pos = 1
for read_pos from 1 to len(arr)-1
  if arr[read_pos] != arr[read_pos - 1]
    arr[write_pos] = arr[read_pos]
    write_pos = write_pos + 1
return write_pos
```

### 工作流

1. 在 `.mind` 中写入需求
2. 按 **Enter** → 插件自动分析整份文件
3. 词汇自动着色，缩进线出现，诊断显示
4. 检测到 `# @d` → 自动生成 `同目录/同名.py` 和 `.c`
5. 点击 `# @d` 注释 → 跳转到 `.py`/`.c` 函数位置
6. 悬停实体名 → 灰色高亮所有同义词 + 弹窗信息

## 架构

```
src/
├── extension.ts            # 主入口：激活/命令/定时器
├── config.ts               # 设置读取（16项配置）
├── bridgeClient.ts         # HTTP 通信 + 类型定义
├── cache.ts                # 本地分析缓存（10文件 LRU）
├── semanticTokens.ts       # 语义令牌着色（8种 VS Code 类型）
├── indentDecoration.ts     # 缩进关系线（├─ └─ │ 三层装饰）
├── hoverFeature.ts         # 悬停实体高亮 + HoverProvider
├── diagnosticManager.ts    # 红/绿波浪线诊断
├── sessionManager.ts       # 独立对话管理
├── fileTriplet.ts          # 三文件关系（.mind ↔ .py ↔ .c）
└── docLinks.ts             # 超链接导航（DocumentLinkProvider）
```

## 设置

路径：`VS Code → 设置 → 扩展 → Mind Language`

### 颜色配置

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `mind.actionColor` | `#569CD6` | 控制流关键字 |
| `mind.entityColor` | `#9CDCFE` | 变量/实体 |
| `mind.functionColor` | `#4EC9B0` | 函数调用 |
| `mind.typeColor` | `#4FC1FF` | 类型关键字 |
| `mind.numberColor` | `#B5CEA8` | 数字/常量 |
| `mind.stringColor` | `#CE9178` | 字符串 |
| `mind.commentColor` | `#6A9955` | 注释 |
| `mind.errorColor` | `#F44747` | 红色下划线 |
| `mind.warningColor` | `#6A9955` | 绿色下划线 |
| `mind.indentColors` | `["#3A3D41", ...]` | 缩进线颜色（按层级） |

### 行为开关

| 设置 | 默认 | 说明 |
|------|------|------|
| `mind.enableIndentLines` | `true` | 显示缩进线 |
| `mind.enableHoverHighlight` | `true` | 悬停高亮 |
| `mind.enableDiagnostics` | `true` | 诊断标记 |

### 桥接配置

| 设置 | 默认 | 说明 |
|------|------|------|
| `mind.bridgeHost` | `localhost` | 桥接地址 |
| `mind.bridgePort` | `3456` | 桥接端口 |

## 命令

| 命令 | 快捷键 | 功能 |
|------|--------|------|
| `Mind: 立即分析` | Ctrl+Shift+P | 手动触发分析 |
| `Mind: 重新连接桥接` | Ctrl+Shift+P | 重连后端 |
| `Mind: 显示状态` | Ctrl+Shift+P | 查看诊断/Token/会话 |

## 降级策略

| 场景 | 行为 |
|------|------|
| 桥接未启动 | TextMate 基本语法高亮 |
| API 超时 | 使用本地缓存结果 |
| 生成失败 | 保留现有 .py/.c 文件 |
