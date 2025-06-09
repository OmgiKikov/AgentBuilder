'use client';

import { useState } from 'react';
import { Tabs, Tab } from '@/components/ui/tabs';
import { HostedServers } from './HostedServers';
import { CustomServers } from './CustomServers';
import { WebhookConfig } from './WebhookConfig';
import { NoCodeMCPBuilder } from './NoCodeMCPBuilder';
import type { Key } from 'react';

export function ToolsConfig() {
  const [activeTab, setActiveTab] = useState('hosted');

  const handleTabChange = (key: Key) => {
    setActiveTab(key.toString());
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs 
        selectedKey={activeTab}
        onSelectionChange={handleTabChange}
        aria-label="Настройки инструментов"
        className="w-full"
        fullWidth
      >
        <Tab key="hosted" title="Библиотека инструментов">
          <div className="mt-4 p-6">
            <HostedServers />
          </div>
        </Tab>
        <Tab key="custom" title="Собственные MCP серверы">
          <div className="mt-4 p-6">
            <CustomServers />
          </div>
        </Tab>
        <Tab key="no-code" title="Создать MCP инструмент">
          <div className="mt-4 p-6">
            <NoCodeMCPBuilder />
          </div>
        </Tab>
        <Tab key="webhook" title="Webhook инструменты">
          <div className="mt-4 p-6">
            <WebhookConfig />
          </div>
        </Tab>
      </Tabs>
    </div>
  );
} 