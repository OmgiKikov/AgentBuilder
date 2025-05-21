import { z } from "zod";
import { AgenticAPITool } from "../../../lib/types/agents_api_types";
import { WorkflowPrompt, WorkflowAgent, WorkflowTool } from "../../../lib/types/workflow_types";
import { Dropdown, DropdownItem, DropdownTrigger, DropdownMenu } from "@heroui/react";
import { useRef, useEffect, useState } from "react";
import { EllipsisVerticalIcon, ImportIcon, PlusIcon, Brain, Wrench, PenLine, Library, ChevronDown, ChevronRight, ServerIcon, DownloadIcon, FolderDownIcon, LibraryIcon } from "lucide-react";
import { Panel } from "@/components/common/panel-common";
import { Button } from "@/components/ui/button";
import { clsx } from "clsx";
import { MCPServer } from "@/app/lib/types/types";
import { getMcpToolsFromProject } from "@/app/actions/mcp_actions";

const GAP_SIZE = 24; // 6 units * 4px (tailwind's default spacing unit)

interface EntityListProps {
    agents: z.infer<typeof WorkflowAgent>[];
    tools: z.infer<typeof WorkflowTool>[];
    projectTools: z.infer<typeof WorkflowTool>[];
    prompts: z.infer<typeof WorkflowPrompt>[];
    selectedEntity: {
        type: "agent" | "tool" | "prompt";
        name: string;
    } | null;
    startAgentName: string | null;
    onSelectAgent: (name: string) => void;
    onSelectTool: (name: string) => void;
    onSelectPrompt: (name: string) => void;
    onAddAgent: (agent: Partial<z.infer<typeof WorkflowAgent>>) => void;
    onAddTool: (tool: Partial<z.infer<typeof WorkflowTool>>) => void;
    onAddPrompt: (prompt: Partial<z.infer<typeof WorkflowPrompt>>) => void;
    onToggleAgent: (name: string) => void;
    onSetMainAgent: (name: string) => void;
    onDeleteAgent: (name: string) => void;
    onDeleteTool: (name: string) => void;
    onDeletePrompt: (name: string) => void;
}

interface EmptyStateProps {
    entity: string;
    hasFilteredItems: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({ entity, hasFilteredItems }) => (
    <div className="flex items-center justify-center h-24 text-sm text-zinc-400 dark:text-zinc-500">
        {hasFilteredItems ? "No tools to show" : `No ${entity} created`}
    </div>
);

const ListItemWithMenu = ({ 
    name, 
    isSelected, 
    onClick, 
    disabled, 
    selectedRef,
    menuContent,
    statusLabel,
    icon,
    iconClassName,
}: {
    name: string;
    isSelected?: boolean;
    onClick?: () => void;
    disabled?: boolean;
    selectedRef?: React.RefObject<HTMLButtonElement>;
    menuContent: React.ReactNode;
    statusLabel?: React.ReactNode;
    icon?: React.ReactNode;
    iconClassName?: string;
}) => {
    return (
        <div className={clsx(
            "group flex items-center gap-2 px-2 py-1.5 rounded-md",
            {
                "bg-indigo-50 dark:bg-indigo-950/30": isSelected,
                "hover:bg-zinc-50 dark:hover:bg-zinc-800": !isSelected
            }
        )}>
            <button
                ref={selectedRef}
                className={clsx(
                    "flex-1 flex items-center gap-2 text-sm text-left",
                    {
                        "text-zinc-900 dark:text-zinc-100": !disabled,
                        "text-zinc-400 dark:text-zinc-600": disabled,
                    }
                )}
                onClick={() => {
                    onClick?.();
                }}
                disabled={disabled}
            >
                {icon && (
                    <div className={clsx("flex-shrink-0", iconClassName)}>
                        {icon}
                    </div>
                )}
                {name}
            </button>
            <div className="flex items-center gap-2">
                {statusLabel}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {menuContent}
                </div>
            </div>
        </div>
    );
};

const StartLabel = () => (
    <div className="text-xs text-indigo-500 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded">
        Начать
    </div>
);

interface ServerCardProps {
    serverName: string;
    tools: z.infer<typeof WorkflowTool>[];
    selectedEntity: {
        type: "agent" | "tool" | "prompt";
        name: string;
    } | null;
    onSelectTool: (name: string) => void;
    onDeleteTool: (name: string) => void;
    selectedRef: React.RefObject<HTMLButtonElement>;
}

const ServerCard = ({
    serverName,
    tools,
    selectedEntity,
    onSelectTool,
    onDeleteTool,
    selectedRef,
}: ServerCardProps) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="mb-2">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md text-sm text-left"
            >
                {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
                <div className="flex items-center gap-1">
                    <ImportIcon className="w-4 h-4 text-blue-600 dark:text-blue-500" />
                    <span>{serverName}</span>
                </div>
            </button>
            {isExpanded && (
                <div className="ml-6 mt-1 space-y-1">
                    {tools.map((tool, index) => (
                        <ListItemWithMenu
                            key={`tool-${index}`}
                            name={tool.name}
                            isSelected={selectedEntity?.type === "tool" && selectedEntity.name === tool.name}
                            onClick={() => onSelectTool(tool.name)}
                            selectedRef={selectedEntity?.type === "tool" && selectedEntity.name === tool.name ? selectedRef : undefined}
                            icon={<Wrench className="w-4 h-4 text-gray-600 dark:text-gray-500" />}
                            menuContent={
                                <EntityDropdown 
                                    name={tool.name} 
                                    onDelete={onDeleteTool}
                                    isLocked={tool.isMcp || tool.isLibrary}
                                />
                            }
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export function EntityList({
    agents,
    tools,
    projectTools,
    prompts,
    selectedEntity,
    startAgentName,
    onSelectAgent,
    onSelectTool,
    onSelectPrompt,
    onAddAgent,
    onAddTool,
    onAddPrompt,
    onToggleAgent,
    onSetMainAgent,
    onDeleteAgent,
    onDeleteTool,
    onDeletePrompt,
    projectId
}: EntityListProps & { projectId: string }) {
    // Merge workflow tools with project tools
    const mergedTools = [...tools, ...projectTools];
    const [filters, setFilters] = useState({
        mcp: true,
        webhook: true,
        library: true
    });
    const [expandedSection, setExpandedSection] = useState<'agents' | 'tools' | 'prompts'>('agents');
    const [isLibraryExpanded, setIsLibraryExpanded] = useState(false);
    const [isWebhookExpanded, setIsWebhookExpanded] = useState(false);
    
    const selectedRef = useRef<HTMLButtonElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [containerHeight, setContainerHeight] = useState<number>(0);
    const headerClasses = "font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between w-full";
    const buttonClasses = "text-sm px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-400";

    // Single source of truth for panel dimensions
    const PANEL_HEADER_HEIGHT = 53;

    useEffect(() => {
        const updateHeight = () => {
            if (containerRef.current) {
                setContainerHeight(containerRef.current.clientHeight);
            }
        };

        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, []);

    useEffect(() => {
        if (selectedEntity && selectedRef.current) {
            selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [selectedEntity]);


    // Fetch and merge MCP tools from project settings
    useEffect(() => {
        async function fetchAndMergeTools() {
            try {
                // Get MCP tools from server action
                const mcpTools = await getMcpToolsFromProject(projectId);
                
                console.log('[EntityList] Fetched MCP tools:', mcpTools.map(t => t.name));
                console.log('[EntityList] Current tools:', tools.map(t => t.name));
                
                // Создаем набор имен текущих инструментов для проверки на дубликаты
                const existingToolNames = new Set(tools.map(t => t.name));
                
                // Фильтруем MCP инструменты, чтобы избежать дублирования
                const newMcpTools = mcpTools.filter(tool => !existingToolNames.has(tool.name));
                
                console.log('[EntityList] New unique MCP tools to add:', newMcpTools.map(t => t.name));
                
                // Создаем Map для устранения дубликатов среди всех инструментов
                const uniqueToolsMap = new Map();
                
                // Добавляем сначала обычные инструменты
                tools.forEach(tool => {
                    uniqueToolsMap.set(tool.name, tool);
                });
                
                // Затем добавляем инструменты MCP, предпочитая их, если есть конфликт имен
                mcpTools.forEach(tool => {
                    uniqueToolsMap.set(tool.name, tool);
                });
                
                const mergedUniqueTools = Array.from(uniqueToolsMap.values());
                console.log('[EntityList] Total unique tools after merge:', mergedUniqueTools.length);
                
                setMergedTools(mergedUniqueTools);
            } catch (error) {
                console.error('[EntityList] Error merging MCP tools:', error);
            }
        }

        fetchAndMergeTools();
    }, [projectId, tools]);

    const calculateExpandedHeight = () => {
        if (!containerHeight) return '0px';
        const collapsedSectionsHeight = PANEL_HEADER_HEIGHT * 2; // Two sections will be collapsed
        const gapHeight = GAP_SIZE * 2; // Total gap height
        return `${containerHeight - collapsedSectionsHeight - gapHeight}px`;
    };

    function handleToolSelection(name: string) {
        onSelectTool(name);
    }

    const filteredTools = mergedTools.filter(tool => {
        if (tool.isMcp) {
            return filters.mcp;
        }
        if (tool.isLibrary) {
            return filters.library;
        }
        return filters.webhook;
    });

    // *** Поиск и рендеринг инструментов ***
    // Перед отрисовкой инструментов, создам уникальный список,
    // чтобы избежать дублирования в UI
    
    // Для инструментов MCP сервера
    const renderMcpTools = () => {
        if (!filters.mcp) return null;
        
        // Создаем Map для отслеживания уникальных инструментов
        const uniqueToolsMap = new Map();
        
        // Фильтруем только MCP инструменты и добавляем их в Map
        filteredTools.filter(tool => tool.isMcp).forEach(tool => {
            // Используем имя инструмента как ключ для уникальности
            uniqueToolsMap.set(tool.name, tool);
        });
        
        // Преобразуем Map обратно в массив
        const uniqueMcpTools = Array.from(uniqueToolsMap.values());
        
        // Логируем для отладки
        console.log('[EntityList] Уникальные MCP инструменты:', 
            uniqueMcpTools.map(t => t.name));
        
        // Группируем инструменты по serverName
        const toolsByServer: Record<string, Array<typeof uniqueMcpTools[0]>> = {};
        
        uniqueMcpTools.forEach(tool => {
            const serverName = tool.mcpServerName || 'unknown';
            if (!toolsByServer[serverName]) {
                toolsByServer[serverName] = [];
            }
            toolsByServer[serverName].push(tool);
        });
        
        // Отрисовываем группы инструментов по серверам,
        // используя компонент ServerCard для каждого сервера
        return Object.entries(toolsByServer).map(([serverName, serverTools]) => (
            <ServerCard 
                key={serverName}
                serverName={serverName}
                tools={serverTools}
                selectedEntity={selectedEntity}
                onSelectTool={handleToolSelection}
                onDeleteTool={onDeleteTool}
                selectedRef={selectedRef}
            />
        ));
    };
    
    // Для библиотечных инструментов
    const renderLibraryTools = () => {
        if (!filters.library) return null;
        
        const libraryTools = filteredTools.filter(tool => tool.isLibrary);
        
        if (libraryTools.length === 0) {
            return (
                <div className="px-3 py-4 text-gray-500 text-sm">
                    Нет доступных библиотечных инструментов
                </div>
            );
        }
        
        return (
            <div key="library-group" className="mb-2">
                <button
                    onClick={() => setIsLibraryExpanded(!isLibraryExpanded)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md text-sm text-left"
                >
                    {isLibraryExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                    <div className="flex items-center gap-1">
                        <Library className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <span>Библиотека</span>
                    </div>
                </button>
                
                {isLibraryExpanded && (
                    <div className="ml-6 mt-1 space-y-1">
                        {libraryTools.map((tool, index) => (
                            <ListItemWithMenu
                                key={`${tool.name}-library-${index}`}
                                name={tool.name}
                                isSelected={selectedEntity?.type === 'tool' && selectedEntity.name === tool.name}
                                onClick={() => handleToolSelection(tool.name)}
                                selectedRef={selectedEntity?.type === 'tool' && selectedEntity.name === tool.name ? selectedRef : undefined}
                                icon={<Wrench className="w-4 h-4 text-gray-600 dark:text-gray-500" />}
                                menuContent={
                                    <EntityDropdown 
                                        name={tool.name} 
                                        onDelete={onDeleteTool}
                                        isLocked={tool.isLibrary}
                                    />
                                }
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    };
    
    // Для обычных инструментов (не MCP, не библиотечных)
    const renderRegularTools = () => {
        const regularTools = filteredTools.filter(tool => !tool.isMcp && !tool.isLibrary);
        
        if (regularTools.length === 0) {
            return null;
        }
        
        return (
            <div key="webhook-tools" className="mb-2">
                <button
                    onClick={() => setIsWebhookExpanded(!isWebhookExpanded)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md text-sm text-left"
                >
                    {isWebhookExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                    <div className="flex items-center gap-1">
                        <Wrench className="w-4 h-4 text-gray-600" />
                        <span>Webhook</span>
                    </div>
                </button>
                
                {isWebhookExpanded && (
                    <div className="ml-6 mt-1 space-y-1">
                        {regularTools.map((tool, index) => (
                            <ListItemWithMenu
                                key={`${tool.name}-regular-${index}`}
                                name={tool.name}
                                isSelected={selectedEntity?.type === 'tool' && selectedEntity.name === tool.name}
                                onClick={() => handleToolSelection(tool.name)}
                                selectedRef={selectedEntity?.type === 'tool' && selectedEntity.name === tool.name ? selectedRef : undefined}
                                icon={<Wrench className="w-4 h-4 text-gray-600 dark:text-gray-500" />}
                                menuContent={
                                    <EntityDropdown 
                                        name={tool.name} 
                                        onDelete={onDeleteTool}
                                        isLocked={tool.isLibrary}
                                    />
                                }
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div ref={containerRef} className="flex flex-col h-full">
            <div className="flex flex-col gap-6 h-full flex-1">
                {/* Agents Panel */}
                <Panel variant="entity-list"
                    tourTarget="entity-agents"
                    title={
                        <button 
                            onClick={() => setExpandedSection('agents')}
                            className={`${headerClasses} hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md transition-colors h-full`}
                        >
                            <div className="flex items-center gap-2 h-full">
                                {expandedSection === 'agents' ? (
                                    <ChevronDown className="w-4 h-4" />
                                ) : (
                                    <ChevronRight className="w-4 h-4" />
                                )}
                                <Brain className="w-4 h-4" />
                                <span>Агенты</span>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedSection('agents');
                                    onAddAgent({});
                                }}
                                className={`group ${buttonClasses}`}
                                showHoverContent={true}
                                hoverContent="Добавить агента"
                            >
                                <PlusIcon className="w-4 h-4" />
                            </Button>
                        </button>
                    }
                    maxHeight={expandedSection === 'agents' ? calculateExpandedHeight() : `${PANEL_HEADER_HEIGHT}px`}
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                >
                    {expandedSection === 'agents' && (
                        <div className="flex flex-col h-full overflow-y-auto py-2">
                            {agents.length > 0 ? (
                                <div className="space-y-1">
                                    {agents.map((agent, index) => (
                                        <ListItemWithMenu
                                            key={`agent-${index}`}
                                            name={agent.name}
                                            isSelected={selectedEntity?.type === "agent" && selectedEntity.name === agent.name}
                                            onClick={() => onSelectAgent(agent.name)}
                                            disabled={agent.disabled}
                                            selectedRef={selectedEntity?.type === "agent" && selectedEntity.name === agent.name ? selectedRef : undefined}
                                            statusLabel={startAgentName === agent.name ? <StartLabel /> : null}
                                            menuContent={
                                                <AgentDropdown
                                                    agent={agent}
                                                    isStartAgent={startAgentName === agent.name}
                                                    onToggle={onToggleAgent}
                                                    onSetMainAgent={onSetMainAgent}
                                                    onDelete={onDeleteAgent}
                                                />
                                            }
                                        />
                                    ))}
                                </div>
                            ) : (
                                <EmptyState entity="agents" hasFilteredItems={false} />
                            )}
                        </div>
                    )}
                </Panel>

                {/* Tools Panel */}
                <Panel variant="entity-list"
                    tourTarget="entity-tools"
                    title={
                        <button 
                            onClick={() => setExpandedSection('tools')}
                            className={`${headerClasses} hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md transition-colors h-full`}
                        >
                            <div className="flex items-center gap-2 h-full">
                                {expandedSection === 'tools' ? (
                                    <ChevronDown className="w-4 h-4" />
                                ) : (
                                    <ChevronRight className="w-4 h-4" />
                                )}
                                <Wrench className="w-4 h-4" />
                                <span>Инструменты</span>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedSection('tools');
                                    onAddTool({});
                                }}
                                className={`group ${buttonClasses}`}
                                showHoverContent={true}
                                hoverContent="Добавить инструмент"
                            >
                                <PlusIcon className="w-4 h-4" />
                            </Button>
                        </button>
                    }
                    maxHeight={expandedSection === 'tools' ? calculateExpandedHeight() : `${PANEL_HEADER_HEIGHT}px`}
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                >
                    {expandedSection === 'tools' && (
                        <div className="flex flex-col h-full">
                            {/* Filter checkboxes - Made sticky */}
                            <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                                    <div className="flex items-center gap-1.5">
                                        <label className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={filters.mcp}
                                                onChange={(e) => setFilters(prev => ({ ...prev, mcp: e.target.checked }))}
                                                className="h-3 w-3 rounded border-gray-300 text-indigo-600 focus:ring-0"
                                            />
                                            <div className="flex items-center gap-1">
                                                <ImportIcon className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                                <span>MCP</span>
                                            </div>
                                        </label>
                                        <label className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={filters.library}
                                                onChange={(e) => setFilters(prev => ({ ...prev, library: e.target.checked }))}
                                                className="h-3 w-3 rounded border-gray-300 text-indigo-600 focus:ring-0"
                                            />
                                            <div className="flex items-center gap-1">
                                                <Library className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                                                <span>Библиотека</span>
                                            </div>
                                        </label>
                                        <label className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={filters.webhook}
                                                onChange={(e) => setFilters(prev => ({ ...prev, webhook: e.target.checked }))}
                                                className="h-3 w-3 rounded border-gray-300 text-indigo-600 focus:ring-0"
                                            />
                                            <span>Webhook</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Tools list - Scrollable content */}
                            <div className="flex-1 overflow-y-auto">
                                {renderMcpTools()}
                                {renderLibraryTools()}
                                {renderRegularTools()}
                            </div>
                        </div>
                    )}
                </Panel>

                {/* Prompts Panel */}
                <Panel variant="entity-list"
                    tourTarget="entity-prompts"
                    title={
                        <button 
                            onClick={() => setExpandedSection('prompts')}
                            className={`${headerClasses} hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md transition-colors h-full`}
                        >
                            <div className="flex items-center gap-2 h-full">
                                {expandedSection === 'prompts' ? (
                                    <ChevronDown className="w-4 h-4" />
                                ) : (
                                    <ChevronRight className="w-4 h-4" />
                                )}
                                <PenLine className="w-4 h-4" />
                                <span>Промпты</span>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedSection('prompts');
                                    onAddPrompt({});
                                }}
                                className={`group ${buttonClasses}`}
                                showHoverContent={true}
                                hoverContent="Добавить промпт"
                            >
                                <PlusIcon className="w-4 h-4" />
                            </Button>
                        </button>
                    }
                    maxHeight={expandedSection === 'prompts' ? calculateExpandedHeight() : `${PANEL_HEADER_HEIGHT}px`}
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                >
                    {expandedSection === 'prompts' && (
                        <div className="flex flex-col h-full overflow-y-auto py-2">
                            {prompts.length > 0 ? (
                                <div className="space-y-1">
                                    {prompts.map((prompt, index) => (
                                        <ListItemWithMenu
                                            key={`prompt-${index}`}
                                            name={prompt.name}
                                            isSelected={selectedEntity?.type === "prompt" && selectedEntity.name === prompt.name}
                                            onClick={() => onSelectPrompt(prompt.name)}
                                            selectedRef={selectedEntity?.type === "prompt" && selectedEntity.name === prompt.name ? selectedRef : undefined}
                                            menuContent={
                                                <EntityDropdown 
                                                    name={prompt.name} 
                                                    onDelete={onDeletePrompt} 
                                                />
                                            }
                                        />
                                    ))}
                                </div>
                            ) : (
                                <EmptyState entity="prompts" hasFilteredItems={false} />
                            )}
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
}

function AgentDropdown({
    agent,
    isStartAgent,
    onToggle,
    onSetMainAgent,
    onDelete
}: {
    agent: z.infer<typeof WorkflowAgent>;
    isStartAgent: boolean;
    onToggle: (name: string) => void;
    onSetMainAgent: (name: string) => void;
    onDelete: (name: string) => void;
}) {
    return (
        <Dropdown>
            <DropdownTrigger>
                <EllipsisVerticalIcon size={16} />
            </DropdownTrigger>
            <DropdownMenu
                disabledKeys={[
                    ...(!agent.toggleAble ? ['toggle'] : []),
                    ...(agent.locked ? ['delete', 'set-main-agent'] : []),
                    ...(isStartAgent ? ['set-main-agent', 'delete', 'toggle'] : []),
                ]}
                onAction={(key) => {
                    switch (key) {
                        case 'set-main-agent':
                            onSetMainAgent(agent.name);
                            break;
                        case 'delete':
                            onDelete(agent.name);
                            break;
                        case 'toggle':
                            onToggle(agent.name);
                            break;
                    }
                }}
            >
                <DropdownItem key="set-main-agent">Установить как стартовый агент</DropdownItem>
                <DropdownItem key="toggle">{agent.disabled ? 'Включить' : 'Выключить'}</DropdownItem>
                <DropdownItem key="delete" className="text-danger">Удалить</DropdownItem>
            </DropdownMenu>
        </Dropdown>
    );
}

function EntityDropdown({
    name,
    onDelete,
    isLocked,
}: {
    name: string;
    onDelete: (name: string) => void;
    isLocked?: boolean;
}) {
    return (
        <Dropdown>
            <DropdownTrigger>
                <EllipsisVerticalIcon size={16} />
            </DropdownTrigger>
            <DropdownMenu
                disabledKeys={isLocked ? ['delete'] : []}
                onAction={(key) => {
                    if (key === 'delete') {
                        onDelete(name);
                    }
                }}
            >
                <DropdownItem key="delete" className="text-danger">Удалить</DropdownItem>
            </DropdownMenu>
        </Dropdown>
    );
} 