'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message } from '@/types';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { UserIcon, ChatBubbleBottomCenterTextIcon as AssistantIcon } from '@heroicons/react/24/solid';
import styles from '../styles/ChatMessage.module.css';
import { Typewriter } from '../components/Typewriter';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface ChatMessageProps {
  message: Message;
  isProcessing?: boolean;
  isTyping?: boolean;
  onTypingComplete?: () => void;
}

interface ToolResult {
  content?: string;
  error?: string;
  status?: 'success' | 'error' | 'pending';
  timestamp?: string;
}

interface ToolCall {
  name: string;
  args: Record<string, any>;
}

// 格式化工具调用参数显示
const formatArguments = (args: string): React.ReactNode => {
  try {
    const parsedArgs = JSON.parse(args);
    return (
      <pre className={styles.argumentsPre}>
        {JSON.stringify(parsedArgs, null, 2)}
      </pre>
    );
  } catch (e) {
    return <pre className={styles.argumentsPreSimple}>{args}</pre>;
  }
};

// 渲染工具调用
const ToolCallRenderer = ({ toolCall, result }: { toolCall: ToolCall; result?: ToolResult }) => {
  return (
    <div className="mb-4">
      <div className={styles.toolCall}>
        <div className={styles.toolCallName}>
          工具调用: {toolCall.name}
        </div>
        <div className={styles.toolCallArgs}>
          <div className="mb-2">参数:</div>
          {formatArguments(JSON.stringify(toolCall.args))}
        </div>
      </div>
      
      {result && (
        <div className={styles.toolResult}>
          <div className={styles.toolResultTitle}>
            执行结果:
          </div>
          <div className={styles.toolResultContent}>
            {result.content}
          </div>
        </div>
      )}
    </div>
  );
};

// 自定义Markdown渲染组件
const MarkdownComponents: Components = {
  p: ({ children, ...props }) => {
    return <p className={styles.paragraph} {...props}>{children}</p>;
  },
  code: ({ inline, className, children, ...props }: any) => {
    return inline ? (
      <code className={styles.inlineCode} {...props}>{children}</code>
    ) : (
      <pre className={styles.codeBlock}>
        <code {...props}>{children}</code>
      </pre>
    );
  },
  // 添加对文本节点的处理
  text: ({ children }) => {
    return <>{children}</>;
  }
};

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isProcessing, isTyping, onTypingComplete }) => {
  const { role, content = '', id, isStreaming } = message;
  const [showContent, setShowContent] = useState(content || '');
  
  useEffect(() => {
    console.log('消息更新:', { role, content, isTyping, id });
    if (content !== undefined) {
      setShowContent(content);
    }
  }, [content, role, id]);

  // 如果是空的助手消息，不显示
  if (role === 'assistant' && !showContent.trim()) {
    return null;
  }

  // 预处理内容，确保数字和特殊字符被正确显示
  const processContent = (text: string) => {
    // console.log('处理前的文本内容:', text);
    // 确保text是字符串
    const processedText = String(text)
      // 处理转义的换行符
      .replace(/\\n/g, '\n')
      .replace(/°C/g, '℃');  // 替换温度符号
    // console.log('处理后的文本内容:', processedText);
    return processedText;
  };

  return (
    <div className={`${styles.message} ${styles[role]}`}>
      <div className={styles.avatar}>
        {role === 'assistant' ? <AssistantIcon className="w-6 h-6" /> : <UserIcon className="w-6 h-6" />}
      </div>
      <div className={styles.content}>
      {role === 'assistant' ? (
          isStreaming ? (
            <Typewriter
              content={processContent(content)}
              isTyping={true}
              onComplete={onTypingComplete}
            />
          ) : (
            <ReactMarkdown
              className={styles.text}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={MarkdownComponents}
              skipHtml={false}
            >
              {processContent(content)}
            </ReactMarkdown>
          )
        ) : (
          <div className={styles.text}>
            {processContent(content)}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;