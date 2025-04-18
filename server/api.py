from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import asyncio
from typing import Dict, Any, Optional, List
from main import Configuration, create_server, LLMClient, ChatSession, initialize_system
import logging
import os
from fastapi.responses import JSONResponse
import uuid

# 全局变量来存储服务器实例和会话
global_servers = {}
chat_sessions = {}
initialized = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    """处理应用的生命周期事件"""
    global global_servers, initialized
    
    # 启动时初始化
    try:
        # 初始化系统
        chat_session = await initialize_system()
        
        # 保存所有服务器实例
        for server in chat_session.servers:
            global_servers[server.name] = server
            
        initialized = True
        logging.info("系统初始化完成")
        
    except Exception as e:
        logging.error(f"系统启动失败: {e}")
        raise
    
    yield  # 服务运行中
    
    # 关闭时清理资源
    try:
        # 清理所有会话
        for session in chat_sessions.values():
            await session.cleanup_servers()
    except Exception as e:
        logging.error(f"清理资源时出错: {e}")
    finally:
        chat_sessions.clear()
        global_servers.clear()
        logging.info("系统已关闭")

app = FastAPI(lifespan=lifespan)

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有源，生产环境应该设置具体的源
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有方法
    allow_headers=["*"],  # 允许所有头部
)

class ServerConfig(BaseModel):
    name: str
    config: Dict[str, Any]

class UserRequest(BaseModel):
    content: str
    session_id: str

class ChatResponse(BaseModel):
    message: str
    status: str = "success"
    error: Optional[str] = None

class SessionResponse(BaseModel):
    session_id: str
    status: str = "success"
    error: Optional[str] = None

async def update_servers_config(new_server: ServerConfig) -> None:
    """更新servers_config.json文件"""
    config_path = "./servers_config.json"
    try:
        with open(config_path, "r") as f:
            current_config = json.load(f)
    except FileNotFoundError:
        current_config = {"mcpServers": {}}

    # 添加新服务器配置
    current_config["mcpServers"][new_server.name] = new_server.config

    # 保存更新后的配置
    with open(config_path, "w") as f:
        json.dump(current_config, f, indent=2)

async def get_or_create_chat_session(session_id: str) -> ChatSession:
    """获取或创建聊天会话"""
    from main import ChatSession
    
    logging.info(f"获取或创建会话：{session_id}")
    if session_id not in chat_sessions:
        logging.info(f"创建新会话：{session_id}")
        if not initialized:
            raise RuntimeError("系统未初始化")
            
        llm_client = LLMClient(Configuration().llm_api_key)
        servers = list(global_servers.values())
        chat_session = ChatSession(servers, llm_client)
        await chat_session.initialize()
        chat_sessions[session_id] = chat_session
        
    return chat_sessions[session_id]

@app.post("/api/create_session")
async def create_session():
    """创建新的会话"""
    try:
        session_id = str(uuid.uuid4())
        logging.info(f"创建新会话：{session_id}")
        # 预创建会话
        await get_or_create_chat_session(session_id)
        return JSONResponse(content={
            "status": "success",
            "session_id": session_id
        })
    except Exception as e:
        logging.error(f"创建会话失败: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "session_id": "",
                "error": f"创建会话失败: {str(e)}"
            }
        )

@app.post("/api/chat")
async def chat_endpoint(request: UserRequest):
    try:
        logging.info(f"接收到聊天请求：session_id={request.session_id}, content={request.content}")
        
        # 获取或创建会话
        chat_session = await get_or_create_chat_session(request.session_id)

        async def generate():
            try:
                async for response in chat_session.process_message(request.content):
                    if response:
                        try:
                            # 直接透传响应
                            if isinstance(response, (dict, list)):
                                yield f"data: {json.dumps(response, ensure_ascii=False)}\n\n"
                            else:
                                yield f"data: {str(response)}\n\n"
                        except Exception as e:
                            logging.error(f"处理响应时出错: {str(e)}, 原始响应: {response}")
                            yield f"data: 处理响应时出错: {str(e)}\n\n"
                
                yield "data: [DONE]\n\n"
                
            except Exception as e:
                logging.error(f"处理消息时出错: {str(e)}, session_id={request.session_id}")
                yield f"data: 处理消息时出错: {str(e)}\n\n"
                yield "data: [DONE]\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )

    except Exception as e:
        logging.error(f"Chat error: {str(e)}, session_id={request.session_id}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": "",
                "error": str(e)
            }
        )

@app.post("/add_server")
async def add_server(server: ServerConfig):
    try:
        # 检查服务器是否已存在
        if server.name in global_servers:
            return {
                "status": "warning",
                "message": f"服务器 {server.name} 已存在",
                "exists": True
            }

        # 更新配置文件
        await update_servers_config(server)

        # 创建新的服务器实例
        new_server = create_server(server.name, server.config)
        await new_server.initialize()
        
        # 更新全局服务器字典
        global_servers[server.name] = new_server

        return {
            "status": "success", 
            "message": f"服务器 {server.name} 添加成功",
            "exists": False
        }
    except Exception as e:
        logging.error(f"添加服务器失败: {str(e)}")
        return {
            "status": "error",
            "message": f"添加服务器失败: {str(e)}",
            "exists": False
        }

@app.get("/servers")
async def list_servers():
    """获取当前所有可用的服务器列表"""
    return {
        "servers": [
            {
                "name": name,
                "status": "active" if server.session else "inactive",
                "config": server.config,
                "connected": True if server.session else False
            }
            for name, server in global_servers.items()
        ]
    } 