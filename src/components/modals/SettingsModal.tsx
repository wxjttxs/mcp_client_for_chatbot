'use client';

import React, { useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { ModelConfig } from '@/types';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { modelConfig, setModelConfig } = useAppContext();
  
  const [baseUrl, setBaseUrl] = useState(modelConfig.baseUrl);
  const [apiKey, setApiKey] = useState(modelConfig.apiKey);
  const [model, setModel] = useState(modelConfig.model);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!baseUrl.trim()) {
      setError('API地址不能为空');
      return;
    }
    
    // 验证URL格式
    try {
      new URL(baseUrl);
    } catch (e) {
      setError('请输入有效的URL');
      return;
    }
    
    if (!model.trim()) {
      setError('模型名称不能为空');
      return;
    }
    
    const newConfig: ModelConfig = {
      baseUrl: baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl,
      apiKey,
      model
    };
    
    setModelConfig(newConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-medium">模型设置</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4">
          {error && (
            <div className="mb-4 text-red-500 text-sm p-2 bg-red-100 dark:bg-red-900 rounded">
              {error}
            </div>
          )}
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">API地址</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600"
              placeholder="例如: https://api.deepseek.com"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">API密钥</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600"
              placeholder="输入API密钥"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">模型名称</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600"
              placeholder="例如: deepseek-v3"
            />
          </div>
          
          <div className="mb-2 text-xs text-gray-500">
            * 请确保使用支持工具调用(function calling)功能的模型
          </div>
          
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={onClose}
              className="mr-2 px-4 py-2 border rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsModal; 