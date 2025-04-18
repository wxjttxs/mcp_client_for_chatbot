#!/bin/bash

# 确保当前目录是server目录
cd "$(dirname "$0")"

# 检查Python是否安装
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python3，请先安装Python3"
    exit 1
fi

# 检查必要的Python库是否安装
echo "检查并安装必要的Python依赖..."
pip install flask==2.3.3 flask-cors==4.0.0 mcp==0.2.0 requests==2.31.0

# 启动后端服务
echo "启动MCP后端服务器..."
python3 mcp_backend.py 