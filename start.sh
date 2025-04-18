#!/bin/bash

# 颜色设置
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}启动MCP客户端系统...${NC}"

# 检查Python和Node.js是否安装
if ! command -v python &> /dev/null; then
    echo -e "${RED}Error: Python未安装，请先安装Python${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js未安装，请先安装Node.js${NC}"
    exit 1
fi

# 检查是否有需要的目录
if [ ! -d "server" ]; then
    echo -e "${YELLOW}创建server目录...${NC}"
    mkdir -p server
fi

# 确保后端目录中有package.json
if [ ! -f "server/package.json" ]; then
    echo -e "${YELLOW}初始化后端package.json...${NC}"
    cat > server/package.json << EOF
{
  "name": "mcp-client-backend",
  "version": "1.0.0",
  "description": "MCP客户端后端服务器",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "body-parser": "^1.20.2",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "mcp-framework": "^0.2.11"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF
fi

# 安装依赖
echo -e "${GREEN}安装前端依赖...${NC}"
npm install

echo -e "${GREEN}安装后端Python依赖...${NC}"
cd server && pip install -r requirements.txt && cd ..

# 检查MCP服务器demo是否存在
if [ ! -d "server/mcp-server-demo" ]; then
    echo -e "${YELLOW}MCP服务器demo未找到，请确保正确配置server/mcp-server-demo目录${NC}"
fi

# 使用并行运行前端和后端
echo -e "${GREEN}启动前端和后端服务...${NC}"
echo -e "${YELLOW}前端地址: http://localhost:3000${NC}"
echo -e "${YELLOW}后端地址: http://localhost:3004${NC}"

# 检查是否存在concurrently，如果不存在就使用多个终端
if npx concurrently --version &> /dev/null; then
    npx concurrently \
        --names "前端,后端" \
        --prefix-colors "blue,green" \
        "npm run dev" \
        "cd server && python mcp_backend.py"
else
    # 提示在不同终端窗口运行命令
    echo -e "${RED}缺少concurrently包，请在两个单独的终端窗口中运行以下命令:${NC}"
    echo -e "终端1: ${YELLOW}npm run dev${NC}"
    echo -e "终端2: ${YELLOW}cd server && python mcp_backend.py${NC}"
    
    # 尝试在后台运行
    echo -e "${GREEN}尝试在后台启动后端服务...${NC}"
    cd server && python mcp_backend.py &
    BACKEND_PID=$!
    
    echo -e "${GREEN}启动前端服务...${NC}"
    cd .. && npm run dev
    
    # 结束后终止后端进程
    kill $BACKEND_PID 2>/dev/null
fi 