#!/bin/bash

# 颜色设置
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}启动MCP客户端系统...${NC}"

# 检查依赖
command -v python3 >/dev/null 2>&1 || { echo -e "${RED}需要python3但未安装.${NC}" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo -e "${RED}需要npm但未安装.${NC}" >&2; exit 1; }

# 确保工作目录
cd "$(dirname "$0")"
WORKING_DIR="$(pwd)"
echo -e "${GREEN}工作目录: ${WORKING_DIR}${NC}"

# 确保MCP服务器配置存在
if [ ! -f "server/mcp_servers.json" ]; then
    echo -e "${YELLOW}创建默认MCP服务器配置文件...${NC}"
    cat > server/mcp_servers.json << EOL
{
  "mcpServers": {
    "demo-stdio-server": {
      "command": "python",
      "args": ["server/mcp-server-demo/hello.py"],
      "env": {}
    },
    "demo-sse-server": {
      "serverType": "sse",
      "url": "http://localhost:8000/sse"
    }
  }
}
EOL
fi

# 安装Python依赖
echo -e "${YELLOW}安装Python依赖...${NC}"
pip install flask==2.3.3 flask-cors==4.0.0 mcp==0.2.0 requests==2.31.0

# 检查hello.py是否可用
if [ -f "server/mcp-server-demo/hello.py" ]; then
    echo -e "${GREEN}找到hello.py示例文件${NC}"
else
    echo -e "${YELLOW}警告: 未找到hello.py示例文件${NC}"
    mkdir -p server/mcp-server-demo
    cat > server/mcp-server-demo/hello.py << EOL
#!/usr/bin/env python
import sys
import json
import asyncio
from mcp import Server

# 简单的MCP服务器实现
class HelloServer:
    async def hello(self, name=None):
        """打招呼"""
        if name:
            return f"你好, {name}!"
        return "你好, 世界!"
    
    async def echo(self, message=None):
        """回音"""
        return message or "你什么都没说!"

async def main():
    server = Server("hello-server")
    
    # 注册工具
    hello_server = HelloServer()
    await server.register_tool("hello", hello_server.hello)
    await server.register_tool("echo", hello_server.echo)
    
    # 启动服务器
    await server.serve_stdio()

if __name__ == "__main__":
    asyncio.run(main())
EOL
    chmod +x server/mcp-server-demo/hello.py
    echo -e "${GREEN}已创建hello.py示例文件${NC}"
fi

# 启动后端服务器
echo -e "${GREEN}启动后端服务器...${NC}"
cd server
python3 mcp_backend.py &
BACKEND_PID=$!
cd ..

# 等待后端服务器启动
echo -e "${YELLOW}等待后端服务器启动...${NC}"
sleep 3

# 检查后端是否成功启动
curl -s http://localhost:3004/api/test >/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}后端服务器成功启动在端口3004${NC}"
else
    echo -e "${RED}后端服务器可能未成功启动，但仍将继续尝试启动前端${NC}"
fi

# 启动前端
echo -e "${GREEN}启动前端服务器...${NC}"
npm run dev

# 当前端关闭时，同时关闭后端
echo -e "${YELLOW}前端已关闭，正在关闭后端...${NC}"
kill $BACKEND_PID
wait $BACKEND_PID 2>/dev/null

echo -e "${GREEN}系统已完全关闭${NC}" 