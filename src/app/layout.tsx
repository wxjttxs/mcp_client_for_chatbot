import '../styles/globals.scss';
import { AppProvider } from '@/context/AppContext';
import React from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MCP Client - 大模型工具调用平台',
  description: '类似Claude的大模型工具调用平台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
} 