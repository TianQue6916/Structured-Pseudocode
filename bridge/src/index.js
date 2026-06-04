// ============================================================
// Mind Bridge — HTTP 服务主入口
// ============================================================
// 提供 POST /analyze 端点，接收 .mind 文件内容，
// 调用 DeepSeek API 分析语义，返回结构化 JSON。
//
// 启动方式: npm start 或 node src/index.js
// 监听端口: 3456（可通过 .env 中 PORT 修改）
// ============================================================

import express from 'express';       // Web 框架
import cors from 'cors';             // 跨域支持（VS Code 扩展请求）
import { analyzeMindContent } from './mindAnalyzer.js';
import { generateCode, hasQueryComments } from './codeGenerator.js';
import { saveTranscript } from './transcriptSaver.js';

// 读取 .env 配置
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3456;

// ---- 中间件 ----
app.use(cors());                     // 允许来自 VS Code 扩展的跨域请求
app.use(express.json({ limit: '1mb' })); // 解析 JSON 请求体，限制 1MB

// ---- 请求日志 ----
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ============================================================
// POST /analyze
// 核心端点：分析 .mind 文件内容
//
// 请求体:
//   { "content": "完整的 .mind 文件内容" }
//
// 响应:
//   {
//     "tokens":       [{ line, character, length, type, entityId? }],
//     "entities":     [{ id, name, occurrences: [{line,char,len}], description }],
//     "nesting":      [{ line, level }],
//     "diagnostics":  [{ line, character, length, message, severity }]
//   }
// ============================================================
app.post('/analyze', async (req, res) => {
  try {
    const { content } = req.body;

    // 参数校验
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: '缺少必填字段 "content"（字符串类型）',
        hint: '请求体应为 JSON 格式: { "content": "你的 .mind 文件内容" }'
      });
    }

    if (content.trim().length === 0) {
      return res.status(400).json({
        error: 'content 不能为空',
        hint: '请提供至少包含一行内容的 .mind 文件'
      });
    }

    if (content.length > 50000) {
      return res.status(400).json({
        error: '文件内容过长（超过 50000 字符）',
        hint: '请缩小文件范围后重试'
      });
    }

    // 调用 DeepSeek 分析
    console.log(`[分析请求] 内容长度: ${content.length} 字符, 行数: ${content.split('\n').length}`);
    const result = await analyzeMindContent(content);
    const tu = result.tokenUsage || {};
    console.log(`[分析完成] tokens: ${result.tokens?.length || 0}, entities: ${result.entities?.length || 0}, diagnostics: ${result.diagnostics?.length || 0} | token: ↑${tu.prompt || '?'} ↓${tu.completion || '?'} (缓存命中: ${tu.cached || 0})`);

    // 保存转录到 ~/.reasonix/mind-transcripts/
    saveTranscript(content, 'analyze', JSON.stringify(result), result.tokenUsage);

    res.json(result);

  } catch (error) {
    console.error('[分析错误]', error.message);

    // 区分错误类型，给客户端友好的提示
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      return res.status(502).json({
        error: '无法连接到 DeepSeek API',
        details: error.message,
        hint: '请检查网络连接和 .env 中的 DEEPSEEK_API_KEY 配置'
      });
    }

    if (error.status === 401) {
      return res.status(502).json({
        error: 'DeepSeek API 认证失败',
        details: error.message,
        hint: '请检查 .env 中的 DEEPSEEK_API_KEY 是否正确'
      });
    }

    // 返回空分析结果（插件降级为纯 TextMate 高亮）
    res.status(500).json({
      tokens: [],
      entities: [],
      nesting: [],
      diagnostics: [{
        line: 0,
        character: 0,
        length: 1,
        message: `分析服务错误: ${error.message}。插件已降级为基本语法高亮。`,
        severity: 'warning'
      }]
    });
  }
});

// ============================================================
// POST /generate
// 代码生成端点：根据 .mind 中的 # @d 注释生成 Python + C 实现
//
// 请求体: { "content": ".mind 文件内容" }
// 响应:   { py: { code, links }, c: { code, links } }
// ============================================================
app.post('/generate', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: '缺少必填字段 "content"',
        hint: '请求体应为 JSON 格式: { "content": ".mind 文件内容" }'
      });
    }

    // 检查是否有 # @d 注释
    if (!hasQueryComments(content)) {
      return res.json({
        py: { code: '', links: [] },
        c: { code: '', links: [] },
        note: '未检测到 # @d 注释，无需生成代码'
      });
    }

    console.log(`[生成请求] 内容长度: ${content.length} 字符`);
    const result = await generateCode(content);

    const pyLen = result.py?.code?.length || 0;
    const cLen = result.c?.code?.length || 0;
    console.log(`[生成完成] Python: ${pyLen}字符, C: ${cLen}字符, 链接数: ${result.py?.links?.length || 0}`);

    saveTranscript(content, 'generate', JSON.stringify(result), null);

    res.json(result);

  } catch (error) {
    console.error('[生成错误]', error.message);

    if (error.code === 'ETIMEDOUT' || error.status === 401) {
      return res.status(502).json({
        error: '代码生成失败',
        details: error.message,
        hint: '请检查桥接服务配置'
      });
    }

    res.status(500).json({
      py: { code: '', links: [] },
      c: { code: '', links: [] },
      error: error.message
    });
  }
});

// ---- 健康检查端点 ----
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mind-bridge',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ---- 启动服务 ----
app.listen(PORT, () => {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║     Mind Bridge — 语义分析桥接服务已启动       ║');
  console.log(`║     监听端口: ${PORT}                            ║`);
  console.log('║     POST /analyze  — 分析 .mind 文件           ║');
  console.log('║     POST /generate — 生成 Python + C 代码       ║');
  console.log('║     GET  /health   — 健康检查                   ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log(`[就绪] DeepSeek 模型: ${process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'}`);
});
