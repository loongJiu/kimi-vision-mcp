#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import https from "https";
import http from "http";

// 配置常量
const CONFIG = {
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  DOWNLOAD_TIMEOUT: 30000, // 30秒
  SUPPORTED_FORMATS: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
  DEFAULT_MODEL: "kimi-k2.5",
  API_URL: "https://api.moonshot.cn/v1/chat/completions",
};

const server = new Server(
  {
    name: "kimi-vision",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 验证环境变量
function validateEnvironment() {
  if (!process.env.KIMI_API_KEY) {
    throw new Error("KIMI_API_KEY 环境变量未设置");
  }
}

// 从 URL 下载图片(带超时和大小限制)
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    
    const request = client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // 处理重定向
        downloadImage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败: HTTP ${res.statusCode}`));
        return;
      }

      const contentLength = parseInt(res.headers["content-length"] || "0");
      if (contentLength > CONFIG.MAX_IMAGE_SIZE) {
        reject(new Error(`图片太大: ${contentLength} bytes (最大 ${CONFIG.MAX_IMAGE_SIZE} bytes)`));
        return;
      }

      const chunks = [];
      let receivedLength = 0;

      res.on("data", (chunk) => {
        chunks.push(chunk);
        receivedLength += chunk.length;
        
        if (receivedLength > CONFIG.MAX_IMAGE_SIZE) {
          request.destroy();
          reject(new Error(`图片超过大小限制: ${CONFIG.MAX_IMAGE_SIZE} bytes`));
        }
      });

      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });

    request.on("error", reject);
    
    // 设置超时
    request.setTimeout(CONFIG.DOWNLOAD_TIMEOUT, () => {
      request.destroy();
      reject(new Error("下载超时"));
    });
  });
}

// 判断是 URL 还是本地路径
function isURL(str) {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// 验证 URL 安全性(防止 SSRF)
function isValidURL(url) {
  try {
    const parsed = new URL(url);
    
    // 只允许 http 和 https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    
    // 禁止访问内网地址
    const hostname = parsed.hostname.toLowerCase();
    const blockedHosts = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "169.254.169.254", // AWS metadata
    ];
    
    if (blockedHosts.includes(hostname)) {
      return false;
    }
    
    // 禁止访问内网 IP 段
    if (hostname.match(/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/)) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// 获取 MIME 类型
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return mimeTypes[ext] || "image/jpeg";
}

// 验证图片格式
function isSupportedFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONFIG.SUPPORTED_FORMATS.includes(ext);
}

// 调用 Kimi API
async function analyzeImageWithKimi(base64Image, mediaType, prompt, model = CONFIG.DEFAULT_MODEL) {
  const response = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${base64Image}`,
              },
            },
            {
              type: "text",
              text: prompt || "请详细描述这张图片的内容,特别关注UI设计、布局、颜色、文字等细节",
            },
          ],
        },
      ],
      temperature: 1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API 错误响应: ${errorText}`);
    throw new Error(`Kimi API 错误: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error("API 返回格式异常: " + JSON.stringify(result));
  }

  return content;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "analyze_image",
        description: "使用 Kimi K2.5 分析图片内容,支持本地文件路径或图片 URL。支持格式: JPG, PNG, GIF, WebP。最大文件大小: 10MB。",
        inputSchema: {
          type: "object",
          properties: {
            image_path: {
              type: "string",
              description: "图片文件路径或 URL",
            },
            prompt: {
              type: "string",
              description: "对图片的具体问题或要求(可选)",
            },
            model: {
              type: "string",
              description: "使用的模型名称(可选,默认: kimi-k2.5)",
              default: "kimi-k2.5",
            },
          },
          required: ["image_path"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "analyze_image") {
    try {
      const { image_path, prompt, model } = request.params.arguments;

      if (!image_path) {
        throw new Error("image_path 参数不能为空");
      }

      let imageBuffer;
      let mediaType;

      // 处理 URL 或本地文件
      if (isURL(image_path)) {
        // 验证 URL 安全性
        if (!isValidURL(image_path)) {
          throw new Error("不支持的 URL 或存在安全风险");
        }

        console.error(`正在下载图片: ${image_path}`);
        imageBuffer = await downloadImage(image_path);

        // 验证格式
        const urlPath = new URL(image_path).pathname;
        if (!isSupportedFormat(urlPath)) {
          throw new Error(`不支持的图片格式。支持的格式: ${CONFIG.SUPPORTED_FORMATS.join(", ")}`);
        }

        mediaType = getMimeType(urlPath);
      } else {
        console.error(`正在读取本地图片: ${image_path}`);

        // 检查文件是否存在
        try {
          await fs.access(image_path);
        } catch {
          throw new Error(`文件不存在: ${image_path}`);
        }

        // 验证格式
        if (!isSupportedFormat(image_path)) {
          throw new Error(`不支持的图片格式。支持的格式: ${CONFIG.SUPPORTED_FORMATS.join(", ")}`);
        }

        // 检查文件大小
        const stats = await fs.stat(image_path);
        if (stats.size > CONFIG.MAX_IMAGE_SIZE) {
          throw new Error(`文件太大: ${stats.size} bytes (最大 ${CONFIG.MAX_IMAGE_SIZE} bytes)`);
        }

        imageBuffer = await fs.readFile(image_path);
        mediaType = getMimeType(image_path);
      }

      const base64Image = imageBuffer.toString("base64");
      console.error(`图片格式: ${mediaType}, 大小: ${imageBuffer.length} bytes`);

      // 调用 Kimi API
      console.error(`正在调用 Kimi API: ${CONFIG.API_URL}`);
      const content = await analyzeImageWithKimi(base64Image, mediaType, prompt, model);
      
      console.error("图片分析完成");

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    } catch (error) {
      console.error(`错误详情: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
      
      return {
        content: [
          {
            type: "text",
            text: `分析图片时出错: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  try {
    validateEnvironment();
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error("Kimi Vision MCP server running on stdio");
    console.error(`支持的图片格式: ${CONFIG.SUPPORTED_FORMATS.join(", ")}`);
    console.error(`最大文件大小: ${CONFIG.MAX_IMAGE_SIZE / 1024 / 1024}MB`);
  } catch (error) {
    console.error("服务器启动失败:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
