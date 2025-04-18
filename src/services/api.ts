import axios from 'axios';
import { FunctionDefinition, MCPServer, MCPTool, Message, ModelConfig, ToolCall, ToolResult, WebSocketMessage } from '@/types';

// 后端API基础URL
const BACKEND_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008';

// MCP 会话缓存
const mcpSessions: Record<string, { 
  connected: boolean,
  tools: MCPTool[] 
}> = {};

// 创建API客户端实例
const apiClient = axios.create({
  baseURL: BACKEND_API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 创建基础模型API客户端实例
const createModelApiClient = (config: ModelConfig) => {
  return axios.create({
    baseURL: config.baseUrl,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    }
  });
};

export interface ChatCompletionRequest {
  model: string;
  messages: Omit<Message, 'id' | 'created_at'>[];
  functions?: FunctionDefinition[];
  temperature?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: {
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        }
      }[];
    };
    finish_reason: string;
  }[];
}

// 获取服务器列表
export const getServerList = async () => {
  try {
    const response = await apiClient.get('/servers');
    return response.data.servers;
  } catch (error) {
    console.error('获取服务器列表失败:', error);
    throw error;
  }
};

// 添加新服务器
export const addServer = async (server: Omit<MCPServer, 'id' | 'createdAt'>) => {
  try {
    const response = await apiClient.post('/add_server', {
      name: server.name,
      config: {
        url: server.url,
        command: server.command,
        args: server.args,
        env: server.env
      }
    });

    return {
      success: response.data.status === 'success',
      warning: response.data.status === 'warning',
      message: response.data.message
    };
  } catch (error) {
    console.error('添加服务器失败:', error);
    return {
      success: false,
      warning: false,
      message: `添加服务器失败: ${(error as any)?.response?.data?.message || (error as Error).message}`
    };
  }
};

// 聊天消息响应类型
export interface ChatMessageResponse {
  status: 'success' | 'error';
  message: string;
  error?: string;
}

// 创建新会话响应类型
export interface CreateSessionResponse {
  status: 'success' | 'error';
  session_id: string;
  error?: string;
}

// 创建新会话
export const createSession = async (): Promise<CreateSessionResponse> => {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/create_session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '创建会话失败');
    }

    return data;
  } catch (error) {
    console.error('创建会话失败:', error);
    throw error;
  }
};

// 发送聊天消息
export const sendChatMessage = async (
  sessionId: string, 
  content: string, 
  onMessage: (message: string) => void
): Promise<void> => {
  try {
    console.log('开始发送聊天消息:', { sessionId, content });
    const response = await fetch(`${BACKEND_API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: sessionId,
        content: content
      }),
    });

    console.log('收到服务器响应:', response.status);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    console.log('获取到reader:', !!reader);
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const processChunk = (chunk: string) => {
      console.log('===开始处理数据块===');
      try {
        console.log('处理数据块原始内容:', chunk);
        // 如果是data:开头的行，提取数据部分
        if (chunk.startsWith('data: ')) {
          const content = chunk.slice(6).trim();
          if (content && content !== '[DONE]') {
            onMessage(content);
          }
        }
      } catch (e) {
        console.error('处理数据块时出错:', e);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      const decodedValue = decoder.decode(value, { stream: true });
      console.log('解码后的原始数据:', decodedValue);
      buffer += decodedValue;
      
      // 按行分割
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          processChunk(line.trim());
        }
      }
    }
  } catch (error) {
    console.error('发送消息失败:', error);
    throw error;
  }
};

