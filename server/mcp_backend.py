import os
import json
import asyncio
import logging
import time  # 添加time模块
from datetime import datetime
from typing import Dict, List, Any, Optional
from functools import wraps

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS

# MCP相关导入
from mcp import ClientSession, StdioServerParameters, types
from mcp.client.stdio import stdio_client

# 尝试导入SSE相关模块
try:
    from mcp.client.sse import sse_client
    SSE_AVAILABLE = True
except ImportError:
    logger.warning("SSE传输模块不可用，仅支持stdio传输")
    SSE_AVAILABLE = False

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # 启用跨域请求支持

# 存储MCP会话
mcp_sessions = {}
# 存储SSE会话
sse_sessions = {}

# 工具类型定义
class MCPTool:
    def __init__(self, name, description, input_schema, output_schema=None, id=None, server_id=None):
        self.name = name
        self.description = description
        self.input_schema = input_schema
        self.output_schema = output_schema
        self.id = id or f"tool-{id(self)}"
        self.server_id = server_id
    
    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
            "outputSchema": self.output_schema,
            "serverId": self.server_id
        }

# 辅助函数：将异步函数包装为同步函数
def async_to_sync(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        return asyncio.run(f(*args, **kwargs))
    return wrapper

# SSE事件生成器 - 用于向客户端发送事件流
def sse_event_generator(server_id):
    try:
        sse_queue = asyncio.Queue()
        sse_sessions[server_id] = sse_queue
        
        # 发送初始连接事件
        yield f"event: connected\ndata: {json.dumps({'server_id': server_id})}\n\n"
        
        # 持续发送事件
        while True:
            # 从队列获取事件（非阻塞）
            try:
                event_data = sse_queue.get_nowait()
                yield f"event: {event_data['event']}\ndata: {json.dumps(event_data['data'])}\n\n"
            except asyncio.QueueEmpty:
                # 如果队列为空，发送心跳以保持连接
                yield f": heartbeat\n\n"
            
            # 休眠一小段时间
            time.sleep(1)
    except GeneratorExit:
        # 当客户端断开连接时清理
        if server_id in sse_sessions:
            del sse_sessions[server_id]
        logger.info(f"SSE客户端断开连接: {server_id}")

# 测试API
@app.route('/api/test', methods=['GET'])
def test_api():
    return jsonify({
        'success': True,
        'message': '后端服务器正常运行',
        'time': datetime.now().isoformat()
    })

# 健康检查
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'time': datetime.now().isoformat()
    }), 200

# SSE事件流端点
@app.route('/api/mcp/sse/<server_id>', methods=['GET'])
def sse_stream(server_id):
    logger.info(f"建立SSE连接: {server_id}")
    return Response(
        stream_with_context(sse_event_generator(server_id)),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )

# 连接到MCP服务器(标准STDIO方式)
@app.route('/api/mcp/connect', methods=['POST'])
@async_to_sync
async def connect_mcp_server():
    try:
        data = request.json
        server_id = data.get('serverId')
        command = data.get('command')
        args = data.get('args', [])
        env_vars = data.get('env', {})
        
        logger.info(f"连接请求: server_id={server_id}, command={command}, args={args}")
        
        # 如果未提供serverId，返回友好错误
        if not server_id:
            return jsonify({
                'success': False,
                'message': '缺少serverId参数'
            }), 400
        
        # 尝试从配置文件中获取服务器信息
        try:
            servers_file = os.path.join(os.path.dirname(__file__), 'mcp_servers.json')
            if os.path.exists(servers_file):
                with open(servers_file, 'r', encoding='utf-8') as f:
                    server_config = json.load(f)
                
                # 查找服务器配置
                if 'mcpServers' in server_config and server_id in server_config['mcpServers']:
                    server_info = server_config['mcpServers'][server_id]
                    logger.info(f"从配置中加载服务器信息: {server_id}")
                    
                    # 如果是SSE类型，重定向到SSE连接
                    if server_info.get('serverType') == 'sse' or 'url' in server_info:
                        logger.info(f"服务器 {server_id} 是SSE类型，重定向到SSE连接")
                        return jsonify({
                            'success': False,
                            'message': '此服务器是SSE类型，请使用SSE方式连接',
                            'shouldUseSSE': True,
                            'serverUrl': server_info.get('url', '')
                        }), 400
                    
                    # STDIO类型，使用配置中的命令和参数
                    command = server_info.get('command', command)
                    args = server_info.get('args', args)
                    env_vars = server_info.get('env', env_vars)
                    logger.info(f"使用配置中的命令和参数: command={command}, args={args}")
        except Exception as e:
            logger.warning(f"读取服务器配置失败，使用请求中的参数: {str(e)}")
        
        # 如果未提供命令，返回友好错误
        if not command:
            return jsonify({
                'success': False,
                'message': '缺少command参数'
            }), 400
        
        # 如果已有会话，先关闭
        if server_id in mcp_sessions:
            logger.info(f"关闭现有会话: {server_id}")
            await mcp_sessions[server_id]['cleanup']()
            del mcp_sessions[server_id]
        


        # 创建服务器参数
        server_params = StdioServerParameters(
            command=command,
            args=args,
            env=env_vars
        )
        
        logger.info(f"创建MCP连接: {command} {' '.join(map(str, args))}")
        
        # 创建mcp客户端会话清理函数
        async def cleanup():
            logger.info(f"清理会话: {server_id}")
            try:
                if server_id in mcp_sessions:
                    if mcp_sessions[server_id].get('exit_stack'):
                        await mcp_sessions[server_id]['exit_stack'].aclose()
                    del mcp_sessions[server_id]
            except Exception as e:
                logger.error(f"清理会话出错: {e}")
        
        try:
            # 使用正确的异步上下文管理器方式处理stdio_client
            logger.info(f"尝试创建stdio_client连接...")
            
            # 其他类型的服务器连接
            async with stdio_client(server_params) as stdio_transport:
                read_fn, write_fn = stdio_transport
                
                # 创建客户端会话
                session = ClientSession(read_fn, write_fn)
                
                # 初始化会话
                logger.info("初始化MCP会话...")
                await session.initialize()
                
                # 获取工具列表
                logger.info("获取工具列表...")
                tools_response = await session.list_tools()
                tools = []
                
                if hasattr(tools_response, 'tools'):
                    # 转换工具到我们需要的格式
                    for tool in tools_response.tools:
                        tools.append(MCPTool(
                            name=tool.name,
                            description=tool.description or f"Tool: {tool.name}",
                            input_schema=tool.inputSchema,
                            output_schema=tool.outputSchema,
                            server_id=server_id
                        ))
                
                # 存储会话
                mcp_sessions[server_id] = {
                    'session': session,
                    'tools': tools,
                    'last_activity': datetime.now(),
                    'cleanup': cleanup,
                    'exit_stack': None,  # 暂时不使用exit_stack
                    'transport_type': 'stdio'
                }
                
                logger.info(f"成功连接到MCP服务器，发现{len(tools)}个工具")
                
                # 转换工具为字典返回给前端
                tool_dicts = [tool.to_dict() for tool in tools]
                
                return jsonify({
                    'success': True,
                    'message': f"成功连接到MCP服务器，找到{len(tools)}个工具",
                    'tools': tool_dicts,
                    'transportType': 'stdio',
                    'serverId': server_id
                })
                
        except Exception as e:
            logger.error(f"连接MCP服务器时出错: {str(e)}")
            await cleanup()
            return jsonify({
                'success': False,
                'message': f"连接失败: {str(e)}",
                'stack': str(e)
            }), 500
    
    except Exception as e:
        logger.error(f"处理连接请求时出错: {str(e)}")
        return jsonify({
            'success': False,
            'message': f"请求处理错误: {str(e)}",
            'stack': str(e)
        }), 500

# 断开MCP服务器连接
@app.route('/api/mcp/disconnect', methods=['POST'])
@async_to_sync
async def disconnect_mcp_server():
    try:
        data = request.json
        server_id = data.get('serverId')
        
        logger.info(f"断开连接请求: {server_id}")
        
        if server_id in mcp_sessions:
            await mcp_sessions[server_id]['cleanup']()
            return jsonify({
                'success': True,
                'message': '已断开连接'
            })
        else:
            return jsonify({
                'success': False,
                'message': '服务器未连接'
            })
    
    except Exception as e:
        logger.error(f"断开连接时出错: {str(e)}")
        return jsonify({
            'success': False,
            'message': f"断开连接失败: {str(e)}"
        }), 500

# 获取工具列表
@app.route('/api/mcp/tools/<server_id>', methods=['GET'])
def get_tools(server_id):
    try:
        logger.info(f"获取工具列表: {server_id}")
        
        if server_id not in mcp_sessions:
            return jsonify({
                'success': False,
                'message': '服务器未连接'
            }), 404
        
        # 更新最后活动时间
        mcp_sessions[server_id]['last_activity'] = datetime.now()
        
        # 获取工具
        tools = mcp_sessions[server_id]['tools']
        tool_dicts = [tool.to_dict() for tool in tools]
        
        return jsonify({
            'success': True,
            'tools': tool_dicts
        })
    
    except Exception as e:
        logger.error(f"获取工具列表时出错: {str(e)}")
        return jsonify({
            'success': False,
            'message': f"获取工具列表失败: {str(e)}"
        }), 500

# 调用工具 - 兼容SSE模式
@app.route('/api/mcp/call-tool', methods=['POST'])
@async_to_sync
async def call_tool():
    try:
        data = request.json
        server_id = data.get('serverId')
        tool_name = data.get('toolName')
        args = data.get('args', {})
        
        logger.info(f"调用工具: server_id={server_id}, tool={tool_name}, args={args}")
        
        if server_id not in mcp_sessions:
            return jsonify({
                'success': False,
                'message': '服务器未连接'
            }), 404
        
        # 更新最后活动时间
        mcp_sessions[server_id]['last_activity'] = datetime.now()
        
        # 获取会话
        session = mcp_sessions[server_id]['session']
        transport_type = mcp_sessions[server_id].get('transport_type', 'stdio')
        
        try:
            # 调用工具
            logger.info(f"执行MCP工具调用: {tool_name} (传输类型: {transport_type})")
            result = await session.call_tool(tool_name, args)
            
            # 提取返回内容
            content = result.content if hasattr(result, 'content') else str(result)
            logger.info(f"工具调用成功: {content[:100]}...")
            
            # 对于SSE传输，还要通过事件流发送结果
            if transport_type == 'sse' and server_id in sse_sessions:
                await sse_sessions[server_id].put({
                    'event': 'tool_call_complete',
                    'data': {
                        'tool': tool_name,
                        'args': args,
                        'result': content
                    }
                })
            
            return jsonify({
                'success': True,
                'content': content
            })
        
        except Exception as e:
            logger.error(f"调用工具失败: {str(e)}")
            
            # 对于SSE传输，通过事件流发送错误
            if transport_type == 'sse' and server_id in sse_sessions:
                await sse_sessions[server_id].put({
                    'event': 'tool_call_error',
                    'data': {
                        'tool': tool_name,
                        'args': args,
                        'error': str(e)
                    }
                })
            
            return jsonify({
                'success': False,
                'message': f"调用工具失败: {str(e)}"
            }), 500
    
    except Exception as e:
        logger.error(f"处理工具调用请求时出错: {str(e)}")
        return jsonify({
            'success': False,
            'message': f"处理请求失败: {str(e)}"
        }), 500

# 清理不活跃的会话
def cleanup_inactive_sessions():
    while True:
        try:
            now = datetime.now()
            for server_id, session_data in list(mcp_sessions.items()):
                last_activity = session_data.get('last_activity')
                if last_activity and (now - last_activity).total_seconds() > 1800:  # 30分钟
                    logger.info(f"清理不活跃会话: {server_id}")
                    asyncio.run(session_data['cleanup']())
        except Exception as e:
            logger.error(f"清理会话时出错: {str(e)}")
        
        # 每10分钟检查一次
        time.sleep(600)

# 连接到MCP服务器(SSE方式)
@app.route('/api/mcp/connect-sse', methods=['POST'])
@async_to_sync
async def connect_mcp_server_sse():
    if not SSE_AVAILABLE:
        return jsonify({
            'success': False,
            'message': 'SSE传输模式不可用，请使用stdio传输'
        }), 400
        
    try:
        data = request.json
        server_id = data.get('serverId')
        server_url = data.get('serverUrl')
        
        logger.info(f"SSE连接请求: server_id={server_id}, url={server_url}")
        
        # 基本参数验证
        if not server_id:
            return jsonify({
                'success': False,
                'message': '缺少serverId参数'
            }), 400
            
        if not server_url:
            return jsonify({
                'success': False,
                'message': '缺少serverUrl参数'
            }), 400
        
        # 如果已有会话，先关闭
        if server_id in mcp_sessions:
            logger.info(f"关闭现有会话: {server_id}")
            await mcp_sessions[server_id]['cleanup']()
            del mcp_sessions[server_id]
        
        # 创建清理函数
        async def cleanup():
            logger.info(f"清理SSE会话: {server_id}")
            try:
                if server_id in mcp_sessions:
                    if 'session' in mcp_sessions[server_id] and hasattr(mcp_sessions[server_id]['session'], 'close'):
                        await mcp_sessions[server_id]['session'].close()
                    del mcp_sessions[server_id]
            except Exception as e:
                logger.error(f"清理SSE会话出错: {e}")
        
        try:
            # 使用SSE客户端连接到服务器
            logger.info(f"尝试创建SSE客户端连接到: {server_url}")
            
            # 创建异步上下文管理器堆栈
            async with AsyncExitStack() as exit_stack:
                # 创建SSE客户端连接
                transport = await exit_stack.enter_async_context(sse_client(server_url))
                session = await exit_stack.enter_async_context(ClientSession(transport))
                
                try:
                    # 获取可用工具
                    tools = []
                    tools_list = await session.list_tools()
                    
                    for tool in tools_list:
                        tools.append(MCPTool(
                            name=tool.name,
                            description=tool.description,
                            input_schema=tool.input_schema,
                            output_schema=tool.output_schema,
                            server_id=server_id
                        ))
                    
                    # 存储会话
                    mcp_sessions[server_id] = {
                        'session': session,
                        'tools': tools,
                        'last_activity': datetime.now(),
                        'cleanup': cleanup,
                        'transport_type': 'sse',
                        'exit_stack': exit_stack
                    }
                    
                    # 转换工具为字典返回给前端
                    tool_dicts = [tool.to_dict() for tool in tools]
                    
                    return jsonify({
                        'success': True,
                        'message': '成功连接到SSE服务器',
                        'tools': tool_dicts
                    })
                    
                except Exception as session_error:
                    logger.error(f"SSE会话初始化失败: {str(session_error)}")
                    raise
            
        except Exception as e:
            logger.error(f"SSE连接MCP服务器时出错: {str(e)}")
            # 确保清理任何可能的部分连接
            await cleanup()
            return jsonify({
                'success': False,
                'message': f"连接SSE服务器失败: {str(e)}"
            }), 500
    
    except Exception as e:
        logger.error(f"处理SSE连接请求时出错: {str(e)}")
        return jsonify({
            'success': False,
            'message': f"SSE请求处理错误: {str(e)}",
            'stack': str(e)
        }), 500

# 获取MCP服务器列表
@app.route('/api/mcp/servers', methods=['GET'])
def get_mcp_servers():
    try:
        servers_file = os.path.join(os.path.dirname(__file__), 'mcp_servers.json')
        
        if not os.path.exists(servers_file):
            return jsonify({
                'success': True,
                'servers': []
            })
        
        with open(servers_file, 'r', encoding='utf-8') as f:
            server_config = json.load(f)
        
        if 'mcpServers' not in server_config:
            return jsonify({
                'success': True,
                'servers': []
            })
        
        servers = []
        
        for server_id, server_info in server_config['mcpServers'].items():
            server_data = {
                'id': server_id,
                'name': server_info.get('name', server_id)
            }
            
            # 添加描述（如果有）
            if 'description' in server_info:
                server_data['description'] = server_info['description']
            
            # 确定服务器类型
            if 'serverType' in server_info and server_info['serverType'] == 'sse':
                server_data['type'] = 'sse'
                server_data['url'] = server_info.get('url', '')
            else:
                server_data['type'] = 'stdio'
                server_data['command'] = server_info.get('command', '')
                server_data['args'] = server_info.get('args', [])
                server_data['env'] = server_info.get('env', {})
            
            servers.append(server_data)
        
        logger.info(f"返回服务器列表: {len(servers)}个")
        
        return jsonify({
            'success': True,
            'servers': servers
        })
    
    except Exception as e:
        logger.error(f"获取MCP服务器列表失败: {str(e)}")
        return jsonify({
            'success': False,
            'message': f"获取服务器列表失败: {str(e)}"
        }), 500

# 添加或更新MCP服务器配置
@app.route('/api/mcp/servers', methods=['POST'])
def add_mcp_server():
    try:
        data = request.json
        new_server = data.get('server')
        
        logger.info(f"添加/更新服务器请求: {json.dumps(data)}")
        
        if not new_server or not new_server.get('id'):
            return jsonify({
                'success': False,
                'message': '缺少服务器ID'
            }), 400
        
        # 读取现有服务器配置
        servers_file = os.path.join(os.path.dirname(__file__), 'mcp_servers.json')
        
        if os.path.exists(servers_file):
            with open(servers_file, 'r', encoding='utf-8') as f:
                server_config = json.load(f)
        else:
            server_config = {'mcpServers': {}}
        
        # 确保mcpServers键存在
        if 'mcpServers' not in server_config:
            server_config['mcpServers'] = {}
        
        # 准备服务器配置
        server_id = new_server.get('id')
        
        # 准备Cursor风格的配置对象
        server_config_obj = {}
        
        # 添加常见元数据
        if 'name' in new_server:
            server_config_obj['name'] = new_server.get('name')
        if 'description' in new_server:
            server_config_obj['description'] = new_server.get('description')
        
        # 根据类型设置服务器配置
        server_type = new_server.get('type', 'stdio')
        logger.info(f"服务器类型: {server_type}")
        
        if server_type == 'sse' or 'serverType' in new_server:
            # SSE类型服务器
            server_config_obj['serverType'] = 'sse'
            
            # 检查URL
            if 'url' not in new_server:
                return jsonify({
                    'success': False,
                    'message': 'SSE服务器缺少URL'
                }), 400
            
            server_config_obj['url'] = new_server.get('url')
            logger.info(f"添加SSE服务器: {server_id}, URL: {server_config_obj['url']}")
        else:
            # STDIO类型服务器
            if 'command' not in new_server:
                return jsonify({
                    'success': False,
                    'message': 'STDIO服务器缺少command'
                }), 400
            
            server_config_obj['command'] = new_server.get('command')
            
            # 处理参数
            args = new_server.get('args', [])
            if not isinstance(args, list):
                args = [args] if args else []
            
            server_config_obj['args'] = args
            server_config_obj['env'] = new_server.get('env', {})
            logger.info(f"添加STDIO服务器: {server_id}, 命令: {server_config_obj['command']}, 参数: {args}")
        
        # 更新配置
        server_config['mcpServers'][server_id] = server_config_obj
        
        # 保存到文件
        with open(servers_file, 'w', encoding='utf-8') as f:
            json.dump(server_config, f, indent=2, ensure_ascii=False)
        
        logger.info(f"服务器配置已保存: {server_id}")
        
        return jsonify({
            'success': True,
            'message': '服务器配置已保存'
        })
    
    except Exception as e:
        logger.error(f"添加/更新服务器配置失败: {str(e)}")
        return jsonify({
            'success': False,
            'message': f"服务器配置保存失败: {str(e)}"
        }), 500

# 删除MCP服务器配置
@app.route('/api/mcp/servers/<server_id>', methods=['DELETE'])
def delete_mcp_server(server_id):
    try:
        # 读取现有服务器配置
        servers_file = os.path.join(os.path.dirname(__file__), 'mcp_servers.json')
        
        if not os.path.exists(servers_file):
            return jsonify({
                'success': False,
                'message': '服务器配置文件不存在'
            }), 404
        
        with open(servers_file, 'r', encoding='utf-8') as f:
            server_config = json.load(f)
        
        # 检查服务器是否存在
        if 'mcpServers' not in server_config or server_id not in server_config['mcpServers']:
            return jsonify({
                'success': False,
                'message': f"未找到服务器: {server_id}"
            }), 404
        
        # 删除服务器
        del server_config['mcpServers'][server_id]
        
        # 保存配置
        with open(servers_file, 'w', encoding='utf-8') as f:
            json.dump(server_config, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'success': True,
            'message': f"服务器 {server_id} 已删除"
        })
    
    except Exception as e:
        logger.error(f"删除MCP服务器配置失败: {str(e)}")
        return jsonify({
            'success': False,
            'message': f"删除服务器配置失败: {str(e)}"
        }), 500

if __name__ == '__main__':
    import threading
    
    # 启动清理线程
    cleanup_thread = threading.Thread(target=cleanup_inactive_sessions, daemon=True)
    cleanup_thread.start()
    
    # 获取端口，默认3004
    port = int(os.environ.get('PORT', 3004))
    
    # 启动Flask应用
    app.run(host='0.0.0.0', port=port, debug=True) 