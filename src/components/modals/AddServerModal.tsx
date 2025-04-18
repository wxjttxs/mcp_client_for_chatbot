'use client';

import React, { useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { MCPServer } from '@/types';

interface AddServerModalProps {
  onClose: () => void;
  onAddServer: (server: Omit<MCPServer, 'id' | 'createdAt'>) => void;
}

type ServerType = 'sse' | 'command';

const AddServerModal: React.FC<AddServerModalProps> = ({ onClose, onAddServer }) => {
  const { addMcpServer } = useAppContext();
  const [name, setName] = useState('');
  const [serverType, setServerType] = useState<ServerType>('sse');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [env, setEnv] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('服务器名称不能为空');
      return;
    }

    try {
      if (serverType === 'sse') {
        if (!url.trim()) {
          setError('服务器URL不能为空');
          return;
        }

        // 验证URL格式
        try {
          new URL(url);
        } catch (e) {
          setError('请输入有效的URL');
          return;
        }

        const newServer = {
          name: name.trim(),
          url: url.trim(),
          description: description.trim() || undefined,
          transportType: 'http' as 'http'
        };

        await addMcpServer(newServer);
        onAddServer(newServer);
        onClose();
      } else {
        if (!command.trim()) {
          setError('命令不能为空');
          return;
        }

        const argsArray = args.trim() ? args.split(/\s+/) : [];
        const envObject: Record<string, string> = {};
        
        // 解析环境变量
        if (env.trim()) {
          env.split('\n').forEach(line => {
            const [key, value] = line.split('=').map(s => s.trim());
            if (key && value) {
              envObject[key] = value;
            }
          });
        }

        const newServer = {
          name: name.trim(),
          command: command.trim(),
          args: argsArray,
          env: envObject,
          description: description.trim() || `命令行服务器: ${command} ${args}`,
          transportType: 'stdio' as 'stdio'
        };

        await addMcpServer(newServer);
        onAddServer(newServer);
        onClose();
      }
    } catch (err: unknown) {
      setError(`添加服务器失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-medium">MCP 服务器</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">服务器名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600"
              placeholder="例如：图片生成服务"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">服务器类型</label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={serverType === 'sse'}
                  onChange={() => setServerType('sse')}
                  className="mr-2"
                />
                <span>SSE (Server-Sent Events)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={serverType === 'command'}
                  onChange={() => setServerType('command')}
                  className="mr-2"
                />
                <span>命令行</span>
              </label>
            </div>
          </div>

          {serverType === 'sse' ? (
            <div>
              <label className="block text-sm font-medium mb-1">服务器URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600"
                placeholder="例如：http://localhost:3000/sse"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">命令</label>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600"
                  placeholder="python, node, java等"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">参数（空格分隔）</label>
                <input
                  type="text"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600"
                  placeholder="path/to/server.py 其他参数"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  环境变量（每行一个，格式：KEY=VALUE）
                </label>
                <textarea
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                  className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600"
                  rows={3}
                  placeholder="API_KEY=your_key_here&#10;DEBUG=true"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-400 dark:bg-gray-700 dark:border-gray-600"
              rows={3}
              placeholder="服务器功能描述"
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
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

export default AddServerModal; 