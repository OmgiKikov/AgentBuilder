import { Suspense } from 'react';
import { ToolsConfig } from './components/ToolsConfig';
import { PageHeader } from '@/components/ui/page-header';

export default function ToolsPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Инструменты"
        description="Настройка и управление интеграциями инструментов в вашем проекте"
      />
      <div className="flex-1 p-6">
        <Suspense fallback={<div>Загрузка...</div>}>
          <ToolsConfig />
        </Suspense>
      </div>
    </div>
  );
}
