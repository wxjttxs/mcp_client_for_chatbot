# MCP Client - 大模型工具调用平台

这是一个类似Claude桌面应用的网站应用，允许用户与大型语言模型进行交互，并支持MCP (Model Control Protocol) 服务器功能调用。

## 功能特点

- 支持与大型语言模型的对话交互
- 管理和记忆多个会话
- 支持添加和管理MCP服务器
- 支持工具调用功能，模型可以调用MCP服务器来回答问题
- 优雅的UI设计，参考Claude桌面应用

## 技术栈

- Next.js
- React
- TypeScript
- Tailwind CSS
- Axios

## 开始使用

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

应用将在 [http://localhost:3000](http://localhost:3000) 运行。

### 构建生产版本

```bash
npm run build
```

### 运行生产版本

```bash
npm start
```

## 配置

### 模型设置

点击界面左上角的设置图标，可以配置：

- API 地址：支持自定义大模型API地址
- API 密钥：用于API认证
- 模型名称：默认为deepseek-v3，可更改为其他支持工具调用的模型

### MCP服务器

可以通过侧边栏的"添加服务器"按钮添加MCP服务器：

- 服务器名称：MCP服务器的显示名称
- 服务器URL：MCP服务器的API地址
- 描述：可选的服务器功能描述

## MCP服务器接口规范

要与本客户端兼容，MCP服务器应提供以下API端点：

```
POST /function/query
```

请求体格式：
```json
{
  "query": "用户查询"
}
```

响应格式：
```json
{
  "tool_call_id": "调用ID",
  "content": "功能执行结果"
}
``` # mcp_client_for_chatbot
# mcp_client_for_chatbot
