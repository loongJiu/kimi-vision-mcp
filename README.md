# Kimi Vision MCP

一个基于 Kimi K2.5 视觉模型的 MCP 服务器,用于分析图片内容。

## 功能特性

- ✅ 支持本地图片文件和 URL
- ✅ 支持多种图片格式 (JPG, PNG, GIF, WebP)
- ✅ 安全的 URL 验证,防止 SSRF 攻击
- ✅ 文件大小限制 (最大 10MB)
- ✅ 自定义分析提示词

## 安装

### 方式 1: 通过 npm 安装 (推荐)
```bash
npm install -g kimi-vision-mcp
```

### 方式 2: 从源码安装
```bash
git clone https://github.com/yourusername/kimi-vision-mcp.git
cd kimi-vision-mcp
npm install
chmod +x index.js
```

## 配置

### 1. 获取 Kimi API Key

访问 [Moonshot AI](https://platform.moonshot.cn/) 注册并获取 API Key。

### 2. 配置 Claude Desktop

编辑配置文件:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### 使用 npm 全局安装 (推荐)
```json
{
  "mcpServers": {
    "kimi-vision": {
      "command": "kimi-vision-mcp",
      "env": {
        "KIMI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

#### 使用本地路径
```json
{
  "mcpServers": {
    "kimi-vision": {
      "command": "node",
      "args": ["/absolute/path/to/kimi-vision-mcp/index.js"],
      "env": {
        "KIMI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 3. 重启 Claude Desktop

配置完成后,完全退出并重启 Claude Desktop。

## 使用方法

在 Claude 对话中:
```
请帮我分析这张图片: /path/to/image.jpg
```

或使用 URL:
```
请分析这张图片: https://example.com/image.png
```

### 自定义提示词
```
请用以下要求分析图片 /path/to/screenshot.png:
重点关注UI布局和配色方案
```

## API 参数

### analyze_image

- `image_path` (必需): 图片文件路径或 URL
- `prompt` (可选): 对图片的具体问题或要求
- `model` (可选): 使用的模型名称,默认 `kimi-k2.5`

## 支持的图片格式

- JPG/JPEG
- PNG
- GIF
- WebP

## 限制

- 最大文件大小: 10MB
- 下载超时: 30秒
- 仅支持公开可访问的图片 URL

## 故障排除

### 1. "KIMI_API_KEY 环境变量未设置"

确保在配置文件中正确设置了 API Key。

### 2. "文件不存在"

检查文件路径是否正确,使用绝对路径更可靠。

### 3. "不支持的 URL 或存在安全风险"

不支持访问本地网络地址 (localhost, 127.0.0.1, 内网 IP 等)。

## 开发
```bash
# 克隆项目
git clone https://github.com/yourusername/kimi-vision-mcp.git
cd kimi-vision-mcp

# 安装依赖
npm install

# 运行
KIMI_API_KEY=your-key node index.js
```

## 贡献

欢迎提交 Issue 和 Pull Request!

## 许可证

MIT License

## 相关链接

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [Kimi API 文档](https://platform.moonshot.cn/docs)
- [问题反馈](https://github.com/yourusername/kimi-vision-mcp/issues)
