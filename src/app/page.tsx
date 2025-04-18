'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// 使用动态导入确保只在客户端渲染
const Layout = dynamic(() => import('@/components/Layout'), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="min-h-screen">
      <Layout />
    </main>
  );
} 