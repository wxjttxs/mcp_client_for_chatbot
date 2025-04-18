'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Conversation, MCPServer, Message, ModelConfig } from '@/types';

interface AppContextType {
  conversations: Conversation[];
  currentConversationId: string | null;
  mcpServers: MCPServer[];
  modelConfig: ModelConfig;
  processingStates: Record<string, boolean>;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  setCurrentConversationId: React.Dispatch<React.SetStateAction<string | null>>;
  setMcpServers: React.Dispatch<React.SetStateAction<MCPServer[]>>;
  setModelConfig: React.Dispatch<React.SetStateAction<ModelConfig>>;
  setProcessingState: (key: string, value: boolean) => void;
  createNewConversation: () => string;
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'created_at'>) => void;
  updateMessage: (conversationId: string, messageId: string, updatedMessage: Partial<Message>) => void;
  deleteConversation: (conversationId: string) => void;
  addMcpServer: (server: Omit<MCPServer, 'id' | 'createdAt'>) => Promise<{ success: boolean; message?: string }>;
  removeMcpServer: (serverId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-v3',
};

function getLocalStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Error reading localStorage key "${key}":`, e);
    return defaultValue;
  }
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(DEFAULT_MODEL_CONFIG);
  const [processingStates, setProcessingStates] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);
  const [mounted, setMounted] = useState(true);

  const createNewConversation = () => {
    const now = new Date().toISOString();
    const id = uuidv4();
    const newConversation: Conversation = {
      id,
      title: '新对话',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    setConversations(prev => [...prev, newConversation]);
    setCurrentConversationId(id);
    return id;
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && !initialized) {
      setConversations(getLocalStorage('conversations', []));
      setMcpServers(getLocalStorage('mcpServers', []));
      setModelConfig(getLocalStorage('modelConfig', DEFAULT_MODEL_CONFIG));
      
      const storedId = localStorage.getItem('currentConversationId');
      if (storedId) setCurrentConversationId(storedId);
      
      setInitialized(true);
    }
  }, [initialized]);

  useEffect(() => {
    if (typeof window !== 'undefined' && initialized) {
      localStorage.setItem('conversations', JSON.stringify(conversations));
    }
  }, [conversations, initialized]);

  useEffect(() => {
    if (typeof window !== 'undefined' && initialized) {
      localStorage.setItem('mcpServers', JSON.stringify(mcpServers));
    }
  }, [mcpServers, initialized]);

  useEffect(() => {
    if (typeof window !== 'undefined' && initialized) {
      localStorage.setItem('modelConfig', JSON.stringify(modelConfig));
    }
  }, [modelConfig, initialized]);

  useEffect(() => {
    if (currentConversationId && typeof window !== 'undefined' && initialized) {
      localStorage.setItem('currentConversationId', currentConversationId);
    }
  }, [currentConversationId, initialized]);

  useEffect(() => {
    if (mounted && !currentConversationId && conversations.length === 0) {
      console.log('没有任何对话，创建新对话');
      createNewConversation();
    } else if (mounted && !currentConversationId && conversations.length > 0) {
      console.log('使用最新的对话');
      setCurrentConversationId(conversations[conversations.length - 1].id);
    }
  }, [mounted, currentConversationId, conversations, createNewConversation]);

  const setProcessingState = (key: string, value: boolean) => {
    setProcessingStates(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const addMessage = (conversationId: string, message: Omit<Message, 'id' | 'created_at'>) => {
    // console.log('添加新消息:', {
    //   conversationId,
    //   message,
    //   currentConversations: conversations
    // });

    const newMessage: Message = {
      ...message,
      id: (message as any).id || uuidv4(),
      created_at: (message as any).created_at || Date.now(),
    };

    setConversations(prev => {
      const targetConv = prev.find(conv => conv.id === conversationId);
      if (!targetConv) {
        console.error('未找到目标对话:', conversationId);
        return prev;
      }

      return prev.map(conv => 
        conv.id === conversationId
          ? { 
              ...conv, 
              messages: [...conv.messages, newMessage],
              updatedAt: new Date().toISOString()
            }
          : conv
      );
    });
  };

  const updateMessage = (conversationId: string, messageId: string, updatedMessage: Partial<Message>) => {
    setConversations(prev => {
      return prev.map(conv => {
        if (conv.id !== conversationId) {
          return conv;
        }
        
        const targetMessage = conv.messages.find(msg => msg.id === messageId);
        
        if (!targetMessage) {
          return conv;
        }

        const newMessages = conv.messages.map(msg => {
          if (msg.id === messageId) {
            // 确保content字段保持原始类型
            const updatedMsg = {
              ...msg,
              ...updatedMessage,
              // 保持content的原始值，不进行类型转换
              content: updatedMessage.content ?? msg.content
            };
            return updatedMsg;
          }
          return msg;
        });

        return {
          ...conv,
          messages: newMessages,
          updatedAt: new Date().toISOString()
        };
      });
    });
  };

  const deleteConversation = (conversationId: string) => {
    // console.log('开始删除对话:', {
    //   deleteId: conversationId,
    //   currentId: currentConversationId
    // });

    setConversations(prev => {
      const newConversations = prev.filter(conv => conv.id !== conversationId);
      // console.log('删除后的对话列表:', newConversations);

      // 如果删除的是当前对话，更新当前对话ID
      if (currentConversationId === conversationId && newConversations.length > 0) {
        // 获取最后一个对话的ID
        const lastConversationId = newConversations[newConversations.length - 1].id;
        // console.log('将切换到新的对话:', lastConversationId);
        // 使用 setTimeout 确保在状态更新后再设置当前对话ID
        setTimeout(() => {
          setCurrentConversationId(lastConversationId);
        }, 0);
      } else if (newConversations.length === 0) {
        // console.log('没有剩余对话，清空当前对话ID');
        setTimeout(() => {
          setCurrentConversationId(null);
        }, 0);
      }

      return newConversations;
    });
  };

  const addMcpServer = async (server: Omit<MCPServer, 'id' | 'createdAt'>) => {
    try {
      const newServer: MCPServer = {
        ...server,
        id: uuidv4(),
        createdAt: new Date().toISOString(),
      };
      setMcpServers(prev => [...prev, newServer]);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : '添加服务器失败'
      };
    }
  };

  const removeMcpServer = (serverId: string) => {
    setMcpServers(prev => prev.filter(server => server.id !== serverId));
  };

  const value = {
    conversations,
    currentConversationId,
    mcpServers,
    modelConfig,
    processingStates,
    setConversations,
    setCurrentConversationId,
    setMcpServers,
    setModelConfig,
    setProcessingState,
    createNewConversation,
    addMessage,
    updateMessage,
    deleteConversation,
    addMcpServer,
    removeMcpServer,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}; 
