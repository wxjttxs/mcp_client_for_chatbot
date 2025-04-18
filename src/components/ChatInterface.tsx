'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { Message } from '@/types';
import { sendChatMessage, createSession } from '@/services/api';

const ChatInterface: React.FC = () => {
  const {
    conversations,
    currentConversationId,
    addMessage,
    updateMessage,
    processingStates,
    setProcessingState,
    createNewConversation
  } = useAppContext();

  const [error, setError] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // 设置mounted状态
  useEffect(() => {
    console.log('组件挂载');
    setMounted(true);
    return () => {
      console.log('组件卸载');
      setMounted(false);
    };
  }, []);

  // 确保有当前对话
  useEffect(() => {
    if (mounted && !currentConversationId) {
      console.log('没有当前对话，创建新对话');
      createNewConversation();
    }
  }, [mounted, currentConversationId, createNewConversation]);

  // 创建新会话
  const initializeSession = async () => {
    try {
      setIsInitializing(true);
      setError('');
      console.log('开始初始化会话');
      const response = await createSession();
      if (response.status === 'success') {
        setSessionId(response.session_id);
        console.log('会话创建成功:', response.session_id);
      } else {
        throw new Error(response.error || '创建会话失败');
      }
    } catch (error) {
      console.error('初始化会话失败:', error);
      setError(`初始化会话失败: ${(error as Error).message}`);
      // 自动重试机制
      setTimeout(() => {
        setRetryCount(prev => prev + 1);
      }, 3000);
    } finally {
      setIsInitializing(false);
    }
  };

  // 初始化会话
  useEffect(() => {
    if (mounted) {
      console.log('mounted状态为true，开始初始化会话');
      initializeSession();
    }
  }, [mounted, retryCount]);

  // 当创建新对话时，创建新会话
  useEffect(() => {
    if (currentConversationId && !sessionId) {
      console.log('检测到新对话，开始初始化会话');
      setIsInitializing(true);
      initializeSession();
    }
  }, [currentConversationId, sessionId]);

  const currentConversation = conversations.find(
    conv => conv.id === currentConversationId
  );

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentConversation?.messages]);

  const handleSendMessage = async (content: string) => {
    if (!currentConversationId || !content.trim() || processingStates.chat || !sessionId) {
      if (!sessionId) {
        setError('会话未初始化，请稍后重试');
        setIsInitializing(true);
        initializeSession();
      }
      return;
    }

    setProcessingState('chat', true);
    setError('');

    try {
      const timestamp = Date.now();
      // 添加用户消息到界面
      const userMessage: Message = {
        role: 'user',
        content,
        created_at: timestamp,
        id: `user-${timestamp}`
      };
      addMessage(currentConversationId, userMessage);

      // 创建一个临时的助手消息用于流式更新
      const assistantMessageId = `assistant-${timestamp}`;
      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        created_at: timestamp,
        id: assistantMessageId,
        isStreaming: true // 添加标记表示正在流式传输
      };
      addMessage(currentConversationId, assistantMessage);

      let currentContent = '';

      // 处理流式响应
      await sendChatMessage(
        sessionId, 
        content,
        (message: string) => {
          try {
            console.log('===ChatInterface收到消息===');
            console.log('收到助手消息:', message);
            
            // 直接累积消息内容
            currentContent = currentContent ? `${currentContent}${message}` : message;
            
            // 更新助手消息的内容
            updateMessage(currentConversationId, assistantMessageId, {
              content: currentContent,
              isStreaming: true
            });

            // 确保滚动到底部
            if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
          } catch (error) {
            console.error('处理消息时出错:', error);
            setError(`处理消息时出错: ${(error as Error).message}`);
          }
        }
      );

      // 消息发送完成后，更新最终状态
      updateMessage(currentConversationId, assistantMessageId, {
        role: 'assistant',
        content: currentContent,
        id: assistantMessageId,
        created_at: timestamp,
        isStreaming: false
      });
    } catch (error) {
      console.error('发送消息失败:', error);
      setError(`发送消息失败: ${(error as Error).message}`);
      
      // 添加错误消息到界面
      const errorMessage: Message = {
        role: 'system',
        content: `错误: ${(error as Error).message}`,
        created_at: Date.now(),
        id: `error-${Date.now()}`
      };
      addMessage(currentConversationId, errorMessage);

      // 如果是会话相关错误，尝试重新创建会话
      if ((error as Error).message.includes('会话')) {
        setIsInitializing(true);
        await initializeSession();
      }
    } finally {
      setProcessingState('chat', false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* 错误提示 */}
      {error && (
        <div className="px-4 py-2 text-sm bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setRetryCount(prev => prev + 1)}
            className="ml-2 px-2 py-1 bg-red-200 hover:bg-red-300 rounded"
          >
            重试
          </button>
        </div>
      )}

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {currentConversation?.messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            isProcessing={processingStates.chat}
            isTyping={message.role === 'assistant' && message.isStreaming === true}
            onTypingComplete={() => {
              if (message.role === 'assistant' && currentConversationId) {
                updateMessage(currentConversationId, message.id, {
                  ...message,
                  isStreaming: false
                });
                setProcessingState('chat', false);
              }
            }}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 w-full">
        <ChatInput
          onSendMessage={handleSendMessage}
          disabled={isInitializing || processingStates.chat}
          placeholder={isInitializing ? "正在初始化会话..." : "输入消息..."}
        />
      </div>
    </div>
  );
};

export default ChatInterface; 