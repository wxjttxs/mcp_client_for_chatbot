'use client';

import React from 'react';
import Sidebar from './Sidebar';
import ChatInterface from './ChatInterface';

const Layout: React.FC = () => {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-gray-900">
      <Sidebar className="flex-shrink-0" />
      <div className="flex-1 flex flex-col overflow-hidden">
        <ChatInterface />
      </div>
    </div>
  );
};

export default Layout; 