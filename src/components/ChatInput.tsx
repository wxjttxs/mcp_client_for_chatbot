'use client';

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({ 
  onSendMessage, 
  disabled,
  placeholder = disabled ? "连接中..." : "输入消息..." 
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整文本区域高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-end space-x-2 w-full">
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={`flex-1 min-h-[40px] max-h-[200px] p-2 rounded-lg border resize-none
          ${disabled 
            ? 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-700 text-gray-500' 
            : 'bg-white border-gray-300 dark:bg-gray-900 dark:border-gray-600 text-gray-900 dark:text-white'
          } 
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
        rows={1}
      />
      <button
        onClick={handleSubmit}
        disabled={!message.trim() || disabled}
        className={`p-2 rounded-lg transition-colors
          ${(!message.trim() || disabled)
            ? 'bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600 dark:hover:bg-blue-400'
          }`}
      >
        <PaperAirplaneIcon className="h-5 w-5" />
      </button>
    </div>
  );
};

export default ChatInput; 