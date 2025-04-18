'use client';

import React, { useState, useEffect } from 'react';
import { useAppContext } from '@/context/AppContext';
import { PlusIcon, TrashIcon, Cog6ToothIcon, ServerIcon, CommandLineIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import AddServerModal from './modals/AddServerModal';
import SettingsModal from './modals/SettingsModal';
import { MCPServer } from '@/types';
import McpServerManager from './McpServerManager';

// MCP 服务器项组件
const McpServerItem = ({ 
  server, 
  onDelete 
}: { 
  server: MCPServer, 
  onDelete: (e: React.MouseEvent, id: string) => void 
}) => {
  const isCommandLine = !!server.command;
  
  return (
    <div className="flex justify-between items-center py-2 px-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 mt-1">
      <div className="truncate flex-1">
        <div className="font-medium flex items-center">
          {isCommandLine ? (
            <CommandLineIcon className="h-3.5 w-3.5 mr-1 text-green-500" />
          ) : (
            <GlobeAltIcon className="h-3.5 w-3.5 mr-1 text-blue-500" />
          )}
          <span className="mr-2">{server.name}</span>
          {server.connected && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
              已连接
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 truncate">
          {isCommandLine 
            ? `${server.command} ${server.args?.join(' ') || ''}`
            : server.url}
        </div>
      </div>
      <button
        onClick={(e) => onDelete(e, server.id)}
        className="ml-2 p-1 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
      >
        <TrashIcon className="h-4 w-4 text-red-500" />
      </button>
    </div>
  );
};

const Sidebar: React.FC = () => {
  const {
    conversations,
    currentConversationId,
    setCurrentConversationId,
    createNewConversation,
    deleteConversation,
    mcpServers,
    removeMcpServer,
    addMcpServer
  } = useAppContext();

  const [isAddServerModalOpen, setIsAddServerModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isMcpServersOpen, setIsMcpServersOpen] = useState(true);
  const [showMcpServerManager, setShowMcpServerManager] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 确保组件已挂载
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCreateConversation = () => {
    createNewConversation();
  };

  const handleConversationClick = (conversationId: string) => {
    setCurrentConversationId(conversationId);
  };

  const handleDeleteConversation = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation();
    if (window.confirm('确定要删除此对话吗？')) {
      deleteConversation(conversationId);
    }
  };

  const handleDeleteServer = (e: React.MouseEvent, serverId: string) => {
    e.stopPropagation();
    if (window.confirm('确定要删除此服务器吗？')) {
      removeMcpServer(serverId);
    }
  };

  const handleAddServer = (server: Omit<MCPServer, 'id' | 'createdAt'>) => {
    addMcpServer(server);
    setIsAddServerModalOpen(false);
  };

  if (!mounted) {
    return null; // 避免服务器端渲染错误
  }

  if (showMcpServerManager) {
    return (
      <div className="w-64 h-full flex-shrink-0 bg-gray-100 dark:bg-gray-900 flex flex-col border-r border-gray-200 dark:border-gray-800">
        <div className="p-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
          <button 
            onClick={() => setShowMcpServerManager(false)}
            className="text-primary-600 dark:text-primary-400 hover:underline flex items-center"
          >
            ← 返回
          </button>
          <h1 className="text-lg font-bold text-primary-600 dark:text-primary-400">MCP 服务器</h1>
        </div>
        <div className="flex-grow overflow-y-auto">
          <McpServerManager />
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 h-full flex-shrink-0 bg-gray-100 dark:bg-gray-900 flex flex-col border-r border-gray-200 dark:border-gray-800">
      <div className="p-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-xl font-bold text-primary-600 dark:text-primary-400">MCP Client</h1>
        <button 
          onClick={() => setIsSettingsModalOpen(true)} 
          className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800"
        >
          <Cog6ToothIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      <div className="flex-grow overflow-y-auto">
        {/* MCP 服务器列表 */}
        <div className="mt-4">
          <div 
            className="px-4 py-2 flex justify-between items-center cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800"
            onClick={() => setIsMcpServersOpen(!isMcpServersOpen)}
          >
            <div className="flex items-center">
              <ServerIcon className="h-5 w-5 mr-2 text-primary-500" />
              <span className="font-medium">MCP 服务器</span>
            </div>
            <span>{isMcpServersOpen ? '▼' : '▶'}</span>
          </div>
          
          {isMcpServersOpen && (
            <div className="pl-6 pr-2">
              {mcpServers.length === 0 ? (
                <div className="text-gray-500 text-sm py-2">暂无服务器</div>
              ) : (
                mcpServers.map(server => (
                  <McpServerItem 
                    key={server.id} 
                    server={server} 
                    onDelete={handleDeleteServer} 
                  />
                ))
              )}
              
              <button
                onClick={() => setShowMcpServerManager(true)}
                className="w-full mt-2 py-1 flex items-center justify-center text-primary-500 hover:bg-gray-200 dark:hover:bg-gray-800 rounded"
              >
                <ServerIcon className="h-4 w-4 mr-1" />
                <span>管理MCP服务器</span>
              </button>
            </div>
          )}
        </div>

        {/* 对话列表 */}
        <div className="mt-4">
          <div className="px-4 py-2 font-medium">对话列表</div>
          <div className="mt-2 space-y-1 px-2">
            {conversations.length === 0 ? (
              <div className="text-gray-500 text-sm px-2 py-2">暂无对话</div>
            ) : (
              conversations.map(conversation => (
                <div
                  key={conversation.id}
                  onClick={() => handleConversationClick(conversation.id)}
                  className={`flex justify-between items-center p-2 rounded-md cursor-pointer ${
                    currentConversationId === conversation.id
                      ? 'bg-primary-100 dark:bg-primary-900'
                      : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="truncate flex-1">{conversation.title}</div>
                  <button
                    onClick={(e) => handleDeleteConversation(e, conversation.id)}
                    className="ml-2 p-1 rounded-md hover:bg-gray-300 dark:hover:bg-gray-700"
                  >
                    <TrashIcon className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 新建对话按钮 */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <button
          onClick={handleCreateConversation}
          className="w-full py-2 px-4 bg-primary-500 hover:bg-primary-600 text-white rounded-md flex items-center justify-center"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          <span>新建对话</span>
        </button>
      </div>

      {/* 添加服务器模态框 */}
      {isAddServerModalOpen && (
        <AddServerModal
          onClose={() => setIsAddServerModalOpen(false)}
          onAddServer={handleAddServer}
        />
      )}

      {/* 设置模态框 */}
      {isSettingsModalOpen && (
        <SettingsModal
          onClose={() => setIsSettingsModalOpen(false)}
        />
      )}
    </div>
  );
};

export default Sidebar; 