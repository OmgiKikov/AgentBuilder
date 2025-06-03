'use client';
import { Spinner } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Workflow, WorkflowTool, WorkflowAgent, WorkflowPrompt } from "@/app/lib/types/workflow_types";
import MarkdownContent from "@/app/lib/components/markdown-content";
import { MessageSquareIcon, EllipsisIcon, XIcon, CheckCheckIcon } from "lucide-react";
import { CopilotMessage, CopilotAssistantMessage, CopilotAssistantMessageActionPart } from "@/app/lib/types/copilot_types";
import { Action, StreamingAction } from './actions';
import { useParsedBlocks } from "../use-parsed-blocks";
import { validateConfigChanges } from "@/app/lib/client_utils";
import { getAppliedChangeKey } from "../app";

const CopilotResponsePart = z.union([
    z.object({
        type: z.literal('text'),
        content: z.string(),
    }),
    z.object({
        type: z.literal('streaming_action'),
        action: CopilotAssistantMessageActionPart.shape.content.partial(),
    }),
    z.object({
        type: z.literal('action'),
        action: CopilotAssistantMessageActionPart.shape.content,
    }),
]);

function enrich(response: string): z.infer<typeof CopilotResponsePart> {
    // If it's not a code block, return as text
    if (!response.trim().startsWith('//')) {
        return {
            type: 'text',
            content: response
        };
    }

    // Parse the metadata from comments
    const lines = response.trim().split('\n');
    const metadata: Record<string, string> = {};
    let jsonStartIndex = 0;

    // Parse metadata from comment lines
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('//')) {
            jsonStartIndex = i;
            break;
        }
        const [key, value] = line.substring(2).trim().split(':').map(s => s.trim());
        if (key && value) {
            metadata[key] = value;
        }
    }

    // Try to parse the JSON part
    try {
        const jsonContent = lines.slice(jsonStartIndex).join('\n');
        const jsonData = JSON.parse(jsonContent);

        // If we have all required metadata, validate the config changes
        if (metadata.action && metadata.config_type && metadata.name) {
            const result = validateConfigChanges(
                metadata.config_type,
                jsonData.config_changes || {},
                metadata.name
            );

            if ('error' in result) {
                return {
                    type: 'action',
                    action: {
                        action: metadata.action as 'create_new' | 'edit',
                        config_type: metadata.config_type as 'tool' | 'agent' | 'prompt',
                        name: metadata.name,
                        change_description: jsonData.change_description || '',
                        config_changes: {},
                        error: result.error
                    }
                };
            }

            return {
                type: 'action',
                action: {
                    action: metadata.action as 'create_new' | 'edit',
                    config_type: metadata.config_type as 'tool' | 'agent' | 'prompt',
                    name: metadata.name,
                    change_description: jsonData.change_description || '',
                    config_changes: result.changes
                }
            };
        }
    } catch (e) {
        // JSON parsing failed - this is likely a streaming block
    }

    // Return as streaming action with whatever metadata we have
    return {
        type: 'streaming_action',
        action: {
            action: (metadata.action as 'create_new' | 'edit') || undefined,
            config_type: (metadata.config_type as 'tool' | 'agent' | 'prompt') || undefined,
            name: metadata.name
        }
    };
}

function UserMessage({ content }: { content: string }) {
    return (
        <div className="w-full">
            <div className="bg-blue-50 dark:bg-[#1e2023] px-4 py-2.5 
                rounded-lg text-sm leading-relaxed
                text-gray-700 dark:text-gray-200 
                border border-blue-100 dark:border-[#2a2d31]
                shadow-sm animate-[slideUpAndFade_150ms_ease-out]">
                <div className="text-left">
                    <MarkdownContent content={content} />
                </div>
            </div>
        </div>
    );
}

function InternalAssistantMessage({ content }: { content: string }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="w-full">
            {!expanded ? (
                <button className="flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 gap-1 group"
                    onClick={() => setExpanded(true)}>
                    <MessageSquareIcon size={16} />
                    <EllipsisIcon size={16} />
                    <span className="text-xs">Показать отладочное сообщение</span>
                </button>
            ) : (
                <div className="w-full">
                    <div className="border border-gray-200 dark:border-gray-700 border-dashed 
                        px-4 py-2.5 rounded-lg text-sm
                        text-gray-700 dark:text-gray-200 shadow-sm">
                        <div className="flex justify-end mb-2">
                            <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                onClick={() => setExpanded(false)}>
                                <XIcon size={16} />
                            </button>
                        </div>
                        <pre className="whitespace-pre-wrap">{content}</pre>
                    </div>
                </div>
            )}
        </div>
    );
}

function SystemMessage({ content }: { content: string }) {
    return (
        <div className="w-full">
            <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2.5 rounded-lg text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><circle cx="12" cy="16" r="1" /></svg>
                {content}
            </div>
        </div>
    );
}

function AssistantMessage({
    content,
    workflow,
    dispatch,
    messageIndex,
    loading
}: {
    content: z.infer<typeof CopilotAssistantMessage>['content'],
    workflow: z.infer<typeof Workflow>,
    dispatch: (action: any) => void,
    messageIndex: number,
    loading: boolean
}) {
    const blocks = useParsedBlocks(content);
    const [appliedChanges, setAppliedChanges] = useState<Record<string, boolean>>({});

    // parse actions from parts
    let parsed: z.infer<typeof CopilotResponsePart>[] = [];
    for (const block of blocks) {
        if (block.type === 'text') {
            parsed.push({
                type: 'text',
                content: block.content,
            });
        } else {
            parsed.push(enrich(block.content));
        }
    }

    // Collect all actions with their indices
    const actionsWithIndices: Array<{action: z.infer<typeof CopilotAssistantMessageActionPart>['content'], index: number}> = [];
    let actionCounter = 0;
    parsed.forEach((part, index) => {
        if (part.type === 'action') {
            actionsWithIndices.push({ action: part.action, index: actionCounter });
            actionCounter++;
        }
    });
    
    const hasMultipleActions = actionsWithIndices.length > 1;
    
    // Check if all actions are applied
    const allActionsApplied = actionsWithIndices.every(({ action, index }) => {
        if (!action || action.error) return true;
        return Object.keys(action.config_changes).every(key => 
            appliedChanges[getAppliedChangeKey(messageIndex, index, key)]
        );
    });

    // Handle applying all actions
    const handleApplyAll = () => {
        actionsWithIndices.forEach(({ action, index }) => {
            if (!action || action.error) return;
            
            if (action.action === 'create_new') {
                switch (action.config_type) {
                    case 'agent':
                        dispatch({
                            type: 'add_agent',
                            agent: {
                                name: action.name,
                                ...action.config_changes
                            }
                        });
                        break;
                    case 'tool':
                        dispatch({
                            type: 'add_tool',
                            tool: {
                                name: action.name,
                                ...action.config_changes
                            }
                        });
                        break;
                    case 'prompt':
                        dispatch({
                            type: 'add_prompt',
                            prompt: {
                                name: action.name,
                                ...action.config_changes
                            }
                        });
                        break;
                }
            } else if (action.action === 'edit') {
                switch (action.config_type) {
                    case 'agent':
                        dispatch({
                            type: 'update_agent',
                            name: action.name,
                            agent: action.config_changes
                        });
                        break;
                    case 'tool':
                        dispatch({
                            type: 'update_tool',
                            name: action.name,
                            tool: action.config_changes
                        });
                        break;
                    case 'prompt':
                        dispatch({
                            type: 'update_prompt',
                            name: action.name,
                            prompt: action.config_changes
                        });
                        break;
                    case 'workflow':
                        Object.entries(action.config_changes).forEach(([field, value]) => {
                            if (field === 'startAgent') {
                                dispatch({
                                    type: 'set_main_agent',
                                    name: value as string
                                });
                            }
                        });
                        break;
                }
            }

            // Mark all fields as applied
            const appliedKeys = Object.keys(action.config_changes).reduce((acc, key) => {
                acc[getAppliedChangeKey(messageIndex, index, key)] = true;
                return acc;
            }, {} as Record<string, boolean>);
            setAppliedChanges(prev => ({
                ...prev,
                ...appliedKeys
            }));
        });
    };

    // split the content into parts 
    let actionRenderIndex = 0;
    return (
        <div className="w-full">
            <div className="px-4 py-2.5 text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                <div className="flex flex-col gap-4">
                    <div className="text-left flex flex-col gap-4">
                        {parsed.map((part, index) => {
                            if (part.type === 'text') {
                                return <MarkdownContent
                                    key={index}
                                    content={part.content}
                                />;
                            }
                            if (part.type === 'streaming_action') {
                                return <StreamingAction
                                    key={index}
                                    action={part.action}
                                    loading={loading}
                                />;
                            }
                            if (part.type === 'action') {
                                const currentActionIndex = actionRenderIndex;
                                actionRenderIndex++;
                                return <Action
                                    key={index}
                                    msgIndex={messageIndex}
                                    actionIndex={currentActionIndex}
                                    action={part.action}
                                    workflow={workflow}
                                    dispatch={dispatch}
                                    stale={false}
                                    appliedChanges={appliedChanges}
                                    setAppliedChanges={setAppliedChanges}
                                />;
                            }
                        })}
                    </div>
                    {hasMultipleActions && !loading && (
                        <div className="flex justify-end mt-2">
                            <button
                                className="px-4 py-2 rounded-md bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/30 disabled:bg-gray-100 dark:disabled:bg-gray-800/30 disabled:text-gray-400 dark:disabled:text-gray-600 flex items-center gap-2 text-sm font-medium transition-colors"
                                onClick={handleApplyAll}
                                disabled={allActionsApplied}
                            >
                                <CheckCheckIcon size={16} />
                                {allActionsApplied ? 'Все применено' : 'Применить все'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function AssistantMessageLoading({ currentStatus }: { currentStatus: 'thinking' | 'planning' | 'generating' }) {
    const statusText = {
        thinking: "Размышляю...",
        planning: "Планирую...",
        generating: "Генерирую..."
    };

    return (
        <div className="w-full">
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2.5 
                rounded-lg
                border border-gray-200 dark:border-gray-700
                shadow-sm dark:shadow-gray-950/20 animate-pulse min-h-[2.5rem] flex items-center gap-2">
                <Spinner size="sm" className="ml-2" />
                <span className="text-sm text-gray-600 dark:text-gray-400">{statusText[currentStatus]}</span>
            </div>
        </div>
    );
}

export function Messages({
    messages,
    streamingResponse,
    loadingResponse,
    workflow,
    dispatch
}: {
    messages: z.infer<typeof CopilotMessage>[];
    streamingResponse: string;
    loadingResponse: boolean;
    workflow: z.infer<typeof Workflow>;
    dispatch: (action: any) => void;
}) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [displayMessages, setDisplayMessages] = useState(messages);

    useEffect(() => {
        if (loadingResponse) {
            setDisplayMessages([...messages, {
                role: 'assistant',
                content: streamingResponse
            }]);
        } else {
            setDisplayMessages(messages);
        }
    }, [messages, loadingResponse, streamingResponse]);

    useEffect(() => {
        // Small delay to ensure content is rendered
        const timeoutId = setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "end",
                inline: "nearest"
            });
        }, 100);

        return () => clearTimeout(timeoutId);
    }, [messages, loadingResponse]);

    const renderMessage = (message: z.infer<typeof CopilotMessage>, messageIndex: number) => {
        if (message.role === 'assistant') {
            return (
                <AssistantMessage
                    key={messageIndex}
                    content={message.content}
                    workflow={workflow}
                    dispatch={dispatch}
                    messageIndex={messageIndex}
                    loading={loadingResponse}
                />
            );
        }

        if (message.role === 'user' && typeof message.content === 'string') {
            return <UserMessage key={messageIndex} content={message.content} />;
        }

        if (message.role === 'system' && typeof message.content === 'string') {
            return <SystemMessage key={messageIndex} content={message.content} />;
        }

        return null;
    };

    return (
        <div className="h-full">
            <div className="flex flex-col mb-4">
                {displayMessages.map((message, index) => (
                    <div key={index} className="mb-4">
                        {renderMessage(message, index)}
                    </div>
                ))}
                {loadingResponse && (
                    <div className="text-xs text-gray-500">
                        <Spinner size="sm" className="ml-2" />
                    </div>
                )}
            </div>
            <div ref={messagesEndRef} />
        </div>
    );
}