'use client';
import { ReactNode, useState } from 'react';
import Sidebar from './sidebar';
import { usePathname } from 'next/navigation';

interface AppLayoutProps {
  children: ReactNode;
  useRag?: boolean;
  useAuth?: boolean;
}

export default function AppLayout({ children, useRag = false, useAuth = false }: AppLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const pathname = usePathname();
  const projectId = pathname.split('/')[2];

  // For invalid projectId, return just the children
  if (!projectId && !pathname.startsWith('/projects')) {
    return children;
  }

  // Layout with sidebar for all routes
  return (
    <div className="h-screen flex gap-5 p-5 bg-zinc-50 dark:bg-zinc-900">
      {/* Sidebar with improved shadow and blur */}
      <div className="overflow-hidden rounded-xl bg-white/70 dark:bg-zinc-800/70 shadow-sm backdrop-blur-sm">
        <Sidebar 
          projectId={projectId} 
          useRag={useRag} 
          useAuth={useAuth}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>
      
      {/* Main content area */}
      <main className="flex-1 min-h-0 flex flex-col rounded-xl bg-white dark:bg-zinc-800 shadow-sm p-4">
        {children}
      </main>
    </div>
  );
} 