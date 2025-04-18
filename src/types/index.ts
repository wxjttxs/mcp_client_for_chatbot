export interface MCPServer {
  id: string;
  name: string;
  description?: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  createdAt: number;
  connected?: boolean;
  transportType: 'http' | 'stdio';
}

export interface MCPTool {
  id: string;
  name: string;
  description: string;
  inputSchema: any;
  outputSchema?: any;
  serverId: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
  isStreaming?: boolean;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  success: boolean;
  data: any;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpToolMapping {
  serverId: string;
  mcpSession: any;
}

export interface WebSocketMessage {
  type: 'message' | 'tool_result' | 'error';
  data: any;
}

export interface ServerStatus {
  name: string;
  status: 'active' | 'inactive';
} 