import { z } from "zod";
import { AgenticAPITool } from "../../../lib/types/agents_api_types";
import { WorkflowPrompt, WorkflowAgent, WorkflowTool } from "../../../lib/types/workflow_types";
import { Dropdown, DropdownItem, DropdownTrigger, DropdownMenu } from "@heroui/react";
import { useRef, useEffect, useState } from "react";
import { EllipsisVerticalIcon, ImportIcon, PlusIcon, Brain, Wrench, PenLine, Library, ChevronDown, ChevronRight, ServerIcon } from "lucide-react";
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
        Start
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
    const selectedRef = useRef<HTMLButtonElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
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
                                <span>Agents</span>
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
                                hoverContent="Add Agent"
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
                                <span>Tools</span>
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
                                hoverContent="Add Tool"
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
                                    <span>Show:</span>
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
                                                <span>Library</span>
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
                                {filteredTools.length > 0 ? (
                                    <div className="space-y-1 p-2">
                                        {/* Group tools by server */}
                                        {(() => {
                                            // Get custom tools (non-MCP tools)
                                            const customTools = filteredTools.filter(tool => !tool.isMcp);
                                            
                                            // Group MCP tools by server
                                            const serverTools = filteredTools.reduce((acc, tool) => {
                                                if (tool.isMcp && tool.mcpServerName) {
                                                    if (!acc[tool.mcpServerName]) {
                                                        acc[tool.mcpServerName] = [];
                                                    }
                                                    acc[tool.mcpServerName].push(tool);
                                                }
                                                return acc;
                                            }, {} as Record<string, typeof filteredTools>);

                                            return (
                                                <>
                                                    {/* Show MCP server cards first */}
                                                    {Object.entries(serverTools).map(([serverName, tools]) => (
                                                        <ServerCard
                                                            key={serverName}
                                                            serverName={serverName}
                                                            tools={tools}
                                                            selectedEntity={selectedEntity}
                                                            onSelectTool={handleToolSelection}
                                                            onDeleteTool={onDeleteTool}
                                                            selectedRef={selectedRef}
                                                        />
                                                    ))}

                                                    {/* Show custom tools */}
                                                    {customTools.length > 0 && (
                                                        <div className="mt-2">
                                                            {customTools.map((tool, index) => (
                                                                <ListItemWithMenu
                                                                    key={`custom-tool-${index}`}
                                                                    name={tool.name}
                                                                    isSelected={selectedEntity?.type === "tool" && selectedEntity.name === tool.name}
                                                                    onClick={() => handleToolSelection(tool.name)}
                                                                    selectedRef={selectedEntity?.type === "tool" && selectedEntity.name === tool.name ? selectedRef : undefined}
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
                                                </>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <EmptyState 
                                        entity="tools" 
                                        hasFilteredItems={mergedTools.length > 0}
                                    />
                                )}
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
                                <span>Prompts</span>
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
                                hoverContent="Add Prompt"
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
                <DropdownItem key="set-main-agent">Set as start agent</DropdownItem>
                <DropdownItem key="toggle">{agent.disabled ? 'Enable' : 'Disable'}</DropdownItem>
                <DropdownItem key="delete" className="text-danger">Delete</DropdownItem>
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
                <DropdownItem key="delete" className="text-danger">Delete</DropdownItem>
            </DropdownMenu>
        </Dropdown>
    );
} 