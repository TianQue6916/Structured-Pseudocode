# Mind Bridge — .mind 语义分析 + 代码生成桥接服务

## 概述

轻量级 HTTP 桥接服务，提供两个核心端点：

| 端点 | 功能 |
|------|------|
| `POST /analyze` | 接收 `.mind` 文件内容 → DeepSeek 语义分析 → 返回 JSON |
| `POST /generate` | 检测 `# @d` 注释 → 生成 Python 3 + C11 双版本代码 |

## 快速开始

### 1. 安装

```bash
cd bridge
npm install
```

### 2. 配置

编辑 `.env`，填入 DeepSeek API Key：

```env
DEEPSEEK_API_KEY=sk-xxxxx
DEEPSEEK_MODEL=deepseek-v4-flash
PORT=3456
```

> 默认配置已使用你的 API Key，如更换可修改 `.env`。

### 3. 启动

```bash
npm start
```

输出：
```
╔═══════════════════════════════════════════════╗
║     Mind Bridge — 语义分析桥接服务已启动       ║
║     监听端口: 3456                            ║
║     POST /analyze  — 分析 .mind 文件           ║
║     POST /generate — 生成 Python + C 代码       ║
║     GET  /health   — 健康检查                   ║
╚═══════════════════════════════════════════════╝
```

## API 文档

### `POST /analyze`

**请求：** `{ "content": ".mind 文件内容" }`

**响应：**

```json
{
  "tokens": [
    { "line": 0, "character": 0, "length": 5, "type": "nl-verb" }
  ],
  "entities": [
    { "id": "e1", "name": "count", "type": "variable",
      "occurrences": [{"line":1, "character":3, "length":5}],
      "description": "计数器变量" }
  ],
  "nesting": [{"line": 0, "level": 0}],
  "diagnostics": [
    {"line": 1, "character": 3, "length": 5,
     "message": "变量未定义", "severity": "warning"}
  ],
  "tokenUsage": {
    "prompt": 342, "completion": 3936,
    "total": 4278, "cached": 256
  }
}
```

### `POST /generate`

**请求：** `{ "content": "含 # @d 注释的 .mind 文件内容" }`

**响应：**

```json
{
  "py": {
    "code": "# Python 实现代码（含详尽注释和测试）",
    "links": [{"mindLine": 0, "fileLine": 2, "name": "function_name"}]
  },
  "c": {
    "code": "// C 实现代码（含详尽注释和测试）",
    "links": [{"mindLine": 0, "fileLine": 6, "name": "function_name"}]
  }
}
```

### 完整响应示例

请求：
```json
{ "content": "# @d 计算斐波那契数列\nDefine function fib\ninput: integer n\nif n <= 1 return n\nreturn fib(n-1) + fib(n-2)" }
```

返回 Python：
```python
def fib(n: int) -> int:
    """计算第n个斐波那契数"""
    if n <= 1:
        return n
    return fib(n-1) + fib(n-2)

if __name__ == "__main__":
    n = int(input("请输入n: "))
    print(f"第{n}个斐波那契数是: {fib(n)}")
```

返回 C：
```c
#include <stdio.h>
int fib(int n) {
    if (n <= 1) return n;
    return fib(n-1) + fib(n-2);
}
int main() {
    int n;
    printf("请输入n: ");
    scanf("%d", &n);
    printf("结果: %d\n", fib(n));
    return 0;
}
```

## Token 类型表

| 类型 | 说明 | 颜色映射 |
|------|------|---------|
| `keyword` | 控制流 (if/else/while) | 深蓝 |
| `c-call` | C 函数调用 | 亮蓝 |
| `py-def` / `c-def` | 函数定义 | 黄色 |
| `decl` / `ref` | 变量声明/引用 | 浅蓝 |
| `type` / `user-type` | 类型关键字 | 青色 |
| `nl-verb` / `nl-noun` | 自然语言操作/名词 | 紫/橙 |
| `operator` / `ptr-op` | 运算符/指针 | 白色 |
| `number` / `const` | 数字/常量 | 浅绿 |
| `string` / `char` | 字符串/字符 | 橙色 |
| `comment` | 注释 | 灰绿 |
| `punct` | 标点 | 不着色 |

## 配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `DEEPSEEK_API_KEY` | — | API 密钥（必填） |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | API 地址 |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | 模型名 |
| `PORT` | `3456` | 监听端口 |
| `REQUEST_TIMEOUT` | `60000` | 超时毫秒 |

## 降级策略

- API 不可用时返回空 tokens + 本地缩进计算（fallback）
- 解析失败时自动重试 JSON 提取（代码块 → 补全大括号 → 贪婪匹配）
- 所有错误有中文提示，插件可据此显示友好消息
