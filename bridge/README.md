# Mind Bridge — .mind 语义分析桥接服务

## 概述

Mind Bridge 是一个轻量级 HTTP 桥接服务，接收 `.mind` 文件内容，调用 **DeepSeek API** 进行语义分析，返回结构化 JSON 供 VS Code 插件渲染。

## 工作原理

```
.mind 文件内容 → Mind Bridge (:3456) → DeepSeek API → JSON 分析结果
                     ↓                       ↑
               POST /analyze           OpenAI SDK
```

## 快速开始

### 1. 安装依赖

```bash
cd AI"    "文件夹/mind-bridge
npm install
```

### 2. 配置 API 密钥

编辑 `.env` 文件，确保已填入正确的 DeepSeek API Key：

```
DEEPSEEK_API_KEY=sk-your-key-here
```

> 💡 默认已配置你的密钥，如更换可在 `.env` 中修改。

### 3. 启动服务

```bash
npm start
```

输出：
```
╔═══════════════════════════════════════════════╗
║     Mind Bridge — 语义分析桥接服务已启动       ║
║     监听端口: 3456                            ║
║     POST /analyze  — 分析 .mind 文件           ║
║     GET  /health   — 健康检查                   ║
╚═══════════════════════════════════════════════╝
```

### 4. 测试服务

```bash
# 健康检查
curl http://localhost:3456/health

# 分析测试
curl -X POST http://localhost:3456/analyze \
  -H "Content-Type: application/json" \
  -d '{"content": "Count node num\nif num ≥ 30\n  delete minimum num\nprint result"}'
```

## API 文档

### `POST /analyze`

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | string | 是 | 完整的 `.mind` 文件内容（≤50000字符） |

**成功响应（200）：**

```json
{
  "tokens": [
    { "line": 0, "character": 0, "length": 4, "type": "nl-verb" },
    { "line": 0, "character": 5, "length": 8, "type": "nl-noun" },
    { "line": 1, "character": 0, "length": 2, "type": "keyword" }
  ],
  "entities": [
    {
      "id": "e1",
      "name": "num",
      "type": "variable",
      "occurrences": [
        { "line": 0, "character": 5, "length": 3 },
        { "line": 1, "character": 3, "length": 3 }
      ],
      "description": "计数器变量"
    }
  ],
  "nesting": [
    { "line": 0, "level": 0 },
    { "line": 1, "level": 0 },
    { "line": 2, "level": 1 }
  ],
  "diagnostics": [
    {
      "line": 3,
      "character": 6,
      "length": 6,
      "message": "未定义实体 'result'",
      "severity": "error"
    }
  ]
}
```

**Token 类型表：**

| 类型 | 说明 | 颜色 |
|------|------|------|
| `keyword` | 控制流关键字 (if/else/while/for) | 深蓝 |
| `c-call` | C 风格函数调用 | 亮蓝 |
| `py-def` | Python 函数定义 | 黄色 |
| `c-def` | C 函数定义 | 金黄 |
| `decl` | 变量声明 | 浅蓝 |
| `ref` | 变量引用 | 青蓝 |
| `type` | 类型关键字 (int/float/void) | 青色 |
| `user-type` | 自定义类型名 | 亮青 |
| `nl-verb` | 自然语言动词/操作 | 紫色 |
| `nl-noun` | 自然语言名词/属性 | 暖橙 |
| `operator` | 运算符 | 白色 |
| `ptr-op` | 指针/箭头运算符 | 白色 |
| `number` | 数字常量 | 浅绿 |
| `const` | 特殊常量 (TRUE/FALSE/NULL) | 浅绿 |
| `string` | 字符串 | 橙色 |
| `char` | 字符 | 橙色 |
| `comment` | 注释 | 灰绿 |
| `punct` | 标点/分隔符 | 白色 |

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误（缺少 content 或格式不对） |
| 502 | DeepSeek API 连接失败或认证错误 |
| 500 | 内部处理错误 |

## 配置

所有配置通过 `.env` 文件管理：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEEPSEEK_API_KEY` | — | DeepSeek API 密钥（必填） |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | API 基础地址 |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | AI 模型 |
| `PORT` | `3456` | 服务监听端口 |
| `REQUEST_TIMEOUT` | `30000` | API 请求超时（毫秒） |

## 降级策略

当 DeepSeek API 不可用时，服务会：
1. 返回空 tokens 列表（VS Code 插件降级为 TextMate 基本语法高亮）
2. 在 diagnostics 中返回友好的错误提示
3. nesting 信息由本地算法基于缩进空格数估算

## 与 VS Code 插件的关系

- VS Code 插件启动时自动连接 `http://localhost:{port}/analyze`
- 端口号可在插件设置中配置（默认 3456）
- 插件和桥接服务需同时运行
