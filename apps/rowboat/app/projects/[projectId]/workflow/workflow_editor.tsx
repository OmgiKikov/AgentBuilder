"use client";
import React, { useReducer, Reducer, useState, useCallback, useEffect, useRef, createContext, useContext } from "react";
import { MCPServer, WithStringId } from "../../../lib/types/types";
import { Workflow, WorkflowTool, WorkflowPrompt, WorkflowAgent } from "../../../lib/types/workflow_types";
import { DataSource } from "../../../lib/types/datasource_types";
import { produce, applyPatches, enablePatches, produceWithPatches, Patch } from 'immer';
import { AgentConfig } from "../entities/agent_config";
import { ToolConfig } from "../entities/tool_config";
import { App as ChatApp } from "../playground/app";
import { z } from "zod";
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Spinner, Tooltip, DropdownSection } from "@heroui/react";
import { PromptConfig } from "../entities/prompt_config";
import { EditableField } from "../../../lib/components/editable-field";
import { RelativeTime } from "@primer/react";
import { USE_PRODUCT_TOUR } from "@/app/lib/feature_flags";

import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Copilot } from "../copilot/app";
import { apiV1 } from "rowboat-shared";
import { publishWorkflow, renameWorkflow, saveWorkflow } from "../../../actions/workflow_actions";
import { PublishedBadge } from "./published_badge";
import { BackIcon, HamburgerIcon, WorkflowIcon } from "../../../lib/components/icons";
import { CopyIcon, ImportIcon, Layers2Icon, RadioIcon, RedoIcon, ServerIcon, Sparkles, UndoIcon, RocketIcon, PenLine, AlertTriangle } from "lucide-react";
import { EntityList } from "./entity_list";
import { ProductTour } from "@/components/common/product-tour";
import { getMcpToolsFromProject } from "@/app/actions/mcp_actions";
import clsx from "clsx";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { Settings2Icon, PlusCircleIcon, UsersIcon, WrenchIcon, FileTextIcon } from "lucide-react";

enablePatches();

const PANEL_RATIOS = {
    chatApp: 70,       // Main panel for Playground
    copilot: 30        // Right panel for Copilot
} as const;

interface StateItem {
    workflow: WithStringId<z.infer<typeof Workflow>>;
    publishedWorkflowId: string | null;
    publishing: boolean;
    selection: {
        type: "agent" | "tool" | "prompt";
        name: string;
    } | null;
    saving: boolean;
    publishError: string | null;
    publishSuccess: boolean;
    pendingChanges: boolean;
    chatKey: number;
    lastUpdatedAt: string;
}

interface State {
    present: StateItem;
    patches: Patch[][];
    inversePatches: Patch[][];
    currentIndex: number;
}

export type Action = {
    type: "update_workflow_name";
    name: string;
} | {
    type: "set_publishing";
    publishing: boolean;
} | {
    type: "set_published_workflow_id";
    workflowId: string;
} | {
    type: "add_agent";
    agent: Partial<z.infer<typeof WorkflowAgent>>;
} | {
    type: "add_tool";
    tool: Partial<z.infer<typeof WorkflowTool>>;
} | {
    type: "add_prompt";
    prompt: Partial<z.infer<typeof WorkflowPrompt>>;
} | {
    type: "select_agent";
    name: string;
} | {
    type: "select_tool";
    name: string;
} | {
    type: "delete_agent";
    name: string;
} | {
    type: "delete_tool";
    name: string;
} | {
    type: "update_agent";
    name: string;
    agent: Partial<z.infer<typeof WorkflowAgent>>;
} | {
    type: "update_tool";
    name: string;
    tool: Partial<z.infer<typeof WorkflowTool>>;
} | {
    type: "set_saving";
    saving: boolean;
} | {
    type: "unselect_agent";
} | {
    type: "unselect_tool";
} | {
    type: "undo";
} | {
    type: "redo";
} | {
    type: "select_prompt";
    name: string;
} | {
    type: "unselect_prompt";
} | {
    type: "delete_prompt";
    name: string;
} | {
    type: "update_prompt";
    name: string;
    prompt: Partial<z.infer<typeof WorkflowPrompt>>;
} | {
    type: "toggle_agent";
    name: string;
} | {
    type: "set_main_agent";
    name: string;
} | {
    type: "set_publish_error";
    error: string | null;
} | {
    type: "set_publish_success";
    success: boolean;
} | {
    type: "restore_state";
    state: StateItem;
} | {
    type: "reorder_agents";
    agents: z.infer<typeof WorkflowAgent>[];
};

function reducer(state: State, action: Action): State {
    let newState: State;

    if (action.type === "restore_state") {
        return {
            present: action.state,
            patches: [],
            inversePatches: [],
            currentIndex: 0
        };
    }

    const isLive = state.present.workflow._id == state.present.publishedWorkflowId;

    switch (action.type) {
        case "undo": {
            if (state.currentIndex <= 0) return state;
            newState = produce(state, draft => {
                const inverse = state.inversePatches[state.currentIndex - 1];
                draft.present = applyPatches(state.present, inverse);
                draft.currentIndex--;
                draft.present.pendingChanges = true;
                draft.present.chatKey++;
            });
            break;
        }
        case "redo": {
            if (state.currentIndex >= state.patches.length) return state;
            newState = produce(state, draft => {
                const patch = state.patches[state.currentIndex];
                draft.present = applyPatches(state.present, patch);
                draft.currentIndex++;
                draft.present.pendingChanges = true;
                draft.present.chatKey++;
            });
            break;
        }
        case "update_workflow_name": {
            newState = produce(state, draft => {
                draft.present.workflow.name = action.name;
            });
            break;
        }
        case "set_publishing": {
            newState = produce(state, draft => {
                draft.present.publishing = action.publishing;
            });
            break;
        }
        case "set_published_workflow_id": {
            newState = produce(state, draft => {
                draft.present.publishedWorkflowId = action.workflowId;
            });
            break;
        }
        case "set_publish_error": {
            newState = produce(state, draft => {
                draft.present.publishError = action.error;
            });
            break;
        }
        case "set_publish_success": {
            newState = produce(state, draft => {
                draft.present.publishSuccess = action.success;
            });
            break;
        }
        case "set_saving": {
            newState = produce(state, draft => {
                draft.present.saving = action.saving;
                draft.present.pendingChanges = action.saving;
                draft.present.lastUpdatedAt = !action.saving ? new Date().toISOString() : state.present.workflow.lastUpdatedAt;
            });
            break;
        }
        case "reorder_agents": {
            const newState = produce(state.present, draft => {
                draft.workflow.agents = action.agents;
                draft.lastUpdatedAt = new Date().toISOString();
            });
            const [nextState, patches, inversePatches] = produceWithPatches(state.present, draft => {
                draft.workflow.agents = action.agents;
                draft.lastUpdatedAt = new Date().toISOString();
            });
            return {
                ...state,
                present: nextState,
                patches: [...state.patches.slice(0, state.currentIndex), patches],
                inversePatches: [...state.inversePatches.slice(0, state.currentIndex), inversePatches],
                currentIndex: state.currentIndex + 1,
            };
        }
        default: {
            const [nextState, patches, inversePatches] = produceWithPatches(
                state.present,
                (draft) => {
                    switch (action.type) {
                        case "select_agent":
                            draft.selection = {
                                type: "agent",
                                name: action.name
                            };
                            break;
                        case "select_tool":
                            draft.selection = {
                                type: "tool",
                                name: action.name
                            };
                            break;
                        case "select_prompt":
                            draft.selection = {
                                type: "prompt",
                                name: action.name
                            };
                            break;
                        case "unselect_agent":
                        case "unselect_tool":
                        case "unselect_prompt":
                            draft.selection = null;
                            break;
                        case "add_agent": {
                            if (isLive) {
                                break;
                            }
                            let newAgentName = "New agent";
                            if (draft.workflow?.agents.some((agent) => agent.name === newAgentName)) {
                                newAgentName = `New agent ${draft.workflow.agents.filter((agent) =>
                                    agent.name.startsWith("New agent")).length + 1}`;
                            }
                            draft.workflow?.agents.push({
                                name: newAgentName,
                                type: "conversation",
                                description: "",
                                disabled: false,
                                instructions: "",
                                model: "",
                                locked: false,
                                toggleAble: true,
                                ragReturnType: "chunks",
                                ragK: 3,
                                controlType: "retain",
                                outputVisibility: "user_facing",
                                maxCallsPerParentAgent: 3,
                                ...action.agent
                            });
                            draft.selection = null;
                            draft.pendingChanges = true;
                            draft.chatKey++;
                            break;
                        }
                        case "add_tool": {
                            if (isLive) {
                                break;
                            }
                            let newToolName = "new_tool";
                            if (draft.workflow?.tools.some((tool) => tool.name === newToolName)) {
                                newToolName = `new_tool_${draft.workflow.tools.filter((tool) =>
                                    tool.name.startsWith("new_tool")).length + 1}`;
                            }
                            draft.workflow?.tools.push({
                                name: newToolName,
                                description: "",
                                parameters: {
                                    type: 'object',
                                    properties: {},
                                    required: []
                                },
                                mockTool: true,
                                autoSubmitMockedResponse: true,
                                ...action.tool
                            });
                            draft.selection = {
                                type: "tool",
                                name: action.tool.name || newToolName
                            };
                            draft.pendingChanges = true;
                            draft.chatKey++;
                            break;
                        }
                        case "add_prompt": {
                            if (isLive) {
                                break;
                            }
                            let newPromptName = "New prompt";
                            if (draft.workflow?.prompts.some((prompt) => prompt.name === newPromptName)) {
                                newPromptName = `New prompt ${draft.workflow?.prompts.filter((prompt) =>
                                    prompt.name.startsWith("New prompt")).length + 1}`;
                            }
                            draft.workflow?.prompts.push({
                                name: newPromptName,
                                type: "base_prompt",
                                prompt: "",
                                ...action.prompt
                            });
                            draft.selection = {
                                type: "prompt",
                                name: action.prompt.name || newPromptName
                            };
                            draft.pendingChanges = true;
                            draft.chatKey++;
                            break;
                        }
                        case "delete_agent":
                            if (isLive) {
                                break;
                            }
                            draft.workflow.agents = draft.workflow.agents.filter(
                                (agent) => agent.name !== action.name
                            );
                            draft.selection = null;
                            draft.pendingChanges = true;
                            draft.chatKey++;
                            break;
                        case "delete_tool":
                            if (isLive) {
                                break;
                            }
                            draft.workflow.tools = draft.workflow.tools.filter(
                                (tool) => tool.name !== action.name
                            );
                            draft.selection = null;
                            draft.pendingChanges = true;
                            draft.chatKey++;
                            break;
                        case "delete_prompt":
                            if (isLive) {
                                break;
                            }
                            draft.workflow.prompts = draft.workflow.prompts.filter(
                                (prompt) => prompt.name !== action.name
                            );
                            draft.selection = null;
                            draft.pendingChanges = true;
                            draft.chatKey++;
                            break;
                        case "update_agent":
                            if (isLive) {
                                break;
                            }

                            // update agent data
                            draft.workflow.agents = draft.workflow.agents.map((agent) =>
                                agent.name === action.name ? { ...agent, ...action.agent } : agent
                            );

                            // if the agent is renamed
                            if (action.agent.name && action.agent.name !== action.name) {
                                // update start agent pointer if this is the start agent
                                if (action.agent.name && draft.workflow.startAgent === action.name) {
                                    draft.workflow.startAgent = action.agent.name;
                                }

                                // update this agents references in other agents / prompts
                                draft.workflow.agents = draft.workflow.agents.map(agent => ({
                                    ...agent,
                                    instructions: agent.instructions.replace(
                                        `[@agent:${action.name}](#mention)`,
                                        `[@agent:${action.agent.name}](#mention)`
                                    )
                                }));
                                draft.workflow.prompts = draft.workflow.prompts.map(prompt => ({
                                    ...prompt,
                                    prompt: prompt.prompt.replace(
                                        `[@agent:${action.name}](#mention)`,
                                        `[@agent:${action.agent.name}](#mention)`
                                    )
                                }));

                                // update the selection pointer if this is the selected agent
                                if (draft.selection?.type === "agent" && draft.selection.name === action.name) {
                                    draft.selection = null;
                                }
                            }

                            // Не выбираем агента после обновления
                            draft.selection = null;
                            draft.pendingChanges = true;
                            draft.chatKey++;
                            break;
                        case "update_tool":
                            if (isLive) {
                                break;
                            }

                            // update tool data
                            draft.workflow.tools = draft.workflow.tools.map((tool) =>
                                tool.name === action.name ? { ...tool, ...action.tool } : tool
                            );

                            // if the tool is renamed
                            if (action.tool.name && action.tool.name !== action.name) {
                                // update this tools references in other agents / prompts
                                draft.workflow.agents = draft.workflow.agents.map(agent => ({
                                    ...agent,
                                    instructions: agent.instructions.replace(
                                        `[@tool:${action.name}](#mention)`,
                                        `[@tool:${action.tool.name}](#mention)`
                                    )
                                }));
                                draft.workflow.prompts = draft.workflow.prompts.map(prompt => ({
                                    ...prompt,
                                    prompt: prompt.prompt.replace(
                                        `[@tool:${action.name}](#mention)`,
                                        `[@tool:${action.tool.name}](#mention)`
                                    )
                                }));

                                // if this is the selected tool, update the selection
                                if (draft.selection?.type === "tool" && draft.selection.name === action.name) {
                                    draft.selection = {
                                        type: "tool",
                                        name: action.tool.name
                                    };
                                }
                            }

                            // select this tool
                            draft.selection = {
                                type: "tool",
                                name: action.tool.name || action.name,
                            };
                            draft.pendingChanges = true;
                            draft.chatKey++;
                            break;
                        case "update_prompt":
                            if (isLive) {
                                break;
                            }

                            // update prompt data
                            draft.workflow.prompts = draft.workflow.prompts.map((prompt) =>
                                prompt.name === action.name ? { ...prompt, ...action.prompt } : prompt
                            );

                            // if the prompt is renamed
                            if (action.prompt.name && action.prompt.name !== action.name) {
                                // update this prompts references in other agents / prompts
                                draft.workflow.agents = draft.workflow.agents.map(agent => ({
                                    ...agent,
                                    instructions: agent.instructions.replace(
                                        `[@prompt:${action.name}](#mention)`,
                                        `[@prompt:${action.prompt.name}](#mention)`
                                    )
                                }));
                                draft.workflow.prompts = draft.workflow.prompts.map(prompt => ({
                                    ...prompt,
                                    prompt: prompt.prompt.replace(
                                        `[@prompt:${action.name}](#mention)`,
                                        `[@prompt:${action.prompt.name}](#mention)`
                                    )
                                }));

                                // if this is the selected prompt, update the selection
                                if (draft.selection?.type === "prompt" && draft.selection.name === action.name) {
                                    draft.selection = {
                                        type: "prompt",
                                        name: action.prompt.name
                                    };
                                }
                            }

                            // select this prompt
                            draft.selection = {
                                type: "prompt",
                                name: action.prompt.name || action.name,
                            };
                            draft.pendingChanges = true;
                            draft.chatKey++;
                            break;
                        case "toggle_agent":
                            if (isLive) {
                                break;
                            }
                            draft.workflow.agents = draft.workflow.agents.map(agent =>
                                agent.name === action.name ? { ...agent, disabled: !agent.disabled } : agent
                            );
                            draft.chatKey++;
                            break;
                        case "set_main_agent":
                            if (isLive) {
                                break;
                            }
                            draft.workflow.startAgent = action.name;
                            draft.chatKey++;
                            break;


                    }
                }
            );

            newState = produce(state, draft => {
                draft.patches.splice(state.currentIndex);
                draft.inversePatches.splice(state.currentIndex);
                draft.patches.push(patches);
                draft.inversePatches.push(inversePatches);
                draft.currentIndex++;
                draft.present = nextState;
            });
        }
    }

    return newState;
}

export function WorkflowEditor({
    dataSources,
    workflow,
    publishedWorkflowId,
    handleShowSelector,
    handleCloneVersion,
    useRag,
    mcpServerUrls,
    toolWebhookUrl,
    defaultModel,
    projectTools,
}: {
    dataSources: WithStringId<z.infer<typeof DataSource>>[];
    workflow: WithStringId<z.infer<typeof Workflow>>;
    publishedWorkflowId: string | null;
    handleShowSelector: () => void;
    handleCloneVersion: (workflowId: string) => void;
    useRag: boolean;
    mcpServerUrls: Array<z.infer<typeof MCPServer>>;
    toolWebhookUrl: string;
    defaultModel: string;
    projectTools: z.infer<typeof WorkflowTool>[];
}) {

    const [state, dispatch] = useReducer<Reducer<State, Action>>(reducer, {
        patches: [],
        inversePatches: [],
        currentIndex: 0,
        present: {
            publishing: false,
            selection: null,
            workflow: workflow,
            publishedWorkflowId: publishedWorkflowId,
            saving: false,
            publishError: null,
            publishSuccess: false,
            pendingChanges: false,
            chatKey: 0,
            lastUpdatedAt: workflow.lastUpdatedAt,
        }
    });
    const [chatMessages, setChatMessages] = useState<z.infer<typeof apiV1.ChatMessage>[]>([]);
    const updateChatMessages = useCallback((messages: z.infer<typeof apiV1.ChatMessage>[]) => {
        setChatMessages(messages);
    }, []);
    const saveQueue = useRef<z.infer<typeof Workflow>[]>([]);
    const saving = useRef(false);
    const isLive = state.present.workflow._id == state.present.publishedWorkflowId;
    const [showCopySuccess, setShowCopySuccess] = useState(false);
    const [showCopilot, setShowCopilot] = useState(true);
    const [copilotWidth, setCopilotWidth] = useState<number>(PANEL_RATIOS.copilot);
    const [isInitialState, setIsInitialState] = useState(true);
    const [showTour, setShowTour] = useState(true);
    const copilotRef = useRef<{ handleUserMessage: (message: string) => void }>(null);
    const [showEntityModal, setShowEntityModal] = useState(false);
    const [entityModalTab, setEntityModalTab] = useState<'agents' | 'tools' | 'prompts'>('agents');

    // Load agent order from localStorage on mount
    useEffect(() => {
        const storedOrder = localStorage.getItem(`workflow_${workflow._id}_agent_order`);
        if (storedOrder) {
            try {
                const orderMap = JSON.parse(storedOrder);
                const orderedAgents = [...workflow.agents].sort((a, b) => {
                    const orderA = orderMap[a.name] ?? Number.MAX_SAFE_INTEGER;
                    const orderB = orderMap[b.name] ?? Number.MAX_SAFE_INTEGER;
                    return orderA - orderB;
                });
                if (JSON.stringify(orderedAgents) !== JSON.stringify(workflow.agents)) {
                    dispatch({ type: "reorder_agents", agents: orderedAgents });
                }
            } catch (e) {
                console.error("Error loading agent order:", e);
            }
        }
    }, [workflow._id, workflow.agents]);

    // Function to trigger copilot chat
    const triggerCopilotChat = useCallback((message: string) => {
        setShowCopilot(true);
        // Small delay to ensure copilot is mounted
        setTimeout(() => {
            copilotRef.current?.handleUserMessage(message);
        }, 100);
    }, []);

    console.log(`workflow editor chat key: ${state.present.chatKey}`);

    // Auto-show copilot and increment key when prompt is present
    useEffect(() => {
        const prompt = localStorage.getItem(`project_prompt_${state.present.workflow.projectId}`);
        console.log('init project prompt', prompt);
        if (prompt) {
            setShowCopilot(true);
        }
    }, [state.present.workflow.projectId]);

    // Reset initial state when user interacts with copilot or opens other menus
    useEffect(() => {
        if (state.present.selection !== null) {
            setIsInitialState(false);
        }
    }, [state.present.selection]);

    // Track copilot actions
    useEffect(() => {
        if (state.present.pendingChanges && state.present.workflow) {
            setIsInitialState(false);
        }
    }, [state.present.workflow, state.present.pendingChanges]);


    // Отслеживаем изменения в списке MCP серверов
    const prevMcpServersRef = useRef<Array<z.infer<typeof MCPServer>>>([]);
    const initialToolsImported = useRef<boolean>(false);



    function handleSelectAgent(name: string) {
        dispatch({ type: "select_agent", name });
    }

    function handleSelectTool(name: string) {
        dispatch({ type: "select_tool", name });
    }

    function handleSelectPrompt(name: string) {
        dispatch({ type: "select_prompt", name });
    }

    function handleUnselectAgent() {
        dispatch({ type: "unselect_agent" });
    }

    function handleUnselectTool() {
        dispatch({ type: "unselect_tool" });
    }

    function handleUnselectPrompt() {
        dispatch({ type: "unselect_prompt" });
    }

    function handleAddAgent(agent: Partial<z.infer<typeof WorkflowAgent>> = {}) {
        const agentWithModel = {
            ...agent,
            model: agent.model || defaultModel || "gpt-4o"
        };
        dispatch({ type: "add_agent", agent: agentWithModel });
    }

    function handleAddTool(tool: Partial<z.infer<typeof WorkflowTool>> = {}) {
        dispatch({ type: "add_tool", tool });
    }

    function handleAddPrompt(prompt: Partial<z.infer<typeof WorkflowPrompt>> = {}) {
        dispatch({ type: "add_prompt", prompt });
    }

    function handleUpdateAgent(name: string, agent: Partial<z.infer<typeof WorkflowAgent>>) {
        dispatch({ type: "update_agent", name, agent });
    }

    function handleDeleteAgent(name: string) {
        if (window.confirm(`Вы уверены, что хотите удалить агента "${name}"?`)) {
            dispatch({ type: "delete_agent", name });
        }
    }

    function handleUpdateTool(name: string, tool: Partial<z.infer<typeof WorkflowTool>>) {
        dispatch({ type: "update_tool", name, tool });
    }

    function handleDeleteTool(name: string) {
        if (window.confirm(`Вы уверены, что хотите удалить инструмент "${name}"?`)) {
            dispatch({ type: "delete_tool", name });
        }
    }

    function handleUpdatePrompt(name: string, prompt: Partial<z.infer<typeof WorkflowPrompt>>) {
        dispatch({ type: "update_prompt", name, prompt });
    }

    function handleDeletePrompt(name: string) {
        if (window.confirm(`Вы уверены, что хотите удалить промпт "${name}"?`)) {
            dispatch({ type: "delete_prompt", name });
        }
    }

    function handleToggleAgent(name: string) {
        dispatch({ type: "toggle_agent", name });
    }

    function handleSetMainAgent(name: string) {
        dispatch({ type: "set_main_agent", name });
        // Принудительное сохранение сразу после установки стартового агента
        dispatch({ type: "set_saving", saving: true });
        processQueue(state, dispatch);
    }

    function handleReorderAgents(agents: z.infer<typeof WorkflowAgent>[]) {
        // Save order to localStorage
        const orderMap = agents.reduce((acc, agent, index) => {
            acc[agent.name] = index;
            return acc;
        }, {} as Record<string, number>);
        localStorage.setItem(`workflow_${workflow._id}_agent_order`, JSON.stringify(orderMap));
        
        dispatch({ type: "reorder_agents", agents });
    }

    async function handleRenameWorkflow(name: string) {
        await renameWorkflow(state.present.workflow.projectId, state.present.workflow._id, name);
        dispatch({ type: "update_workflow_name", name });
    }

    async function handlePublishWorkflow() {
        dispatch({ type: "set_publishing", publishing: true });
        await publishWorkflow(state.present.workflow.projectId, state.present.workflow._id);
        dispatch({ type: "set_publishing", publishing: false });
        dispatch({ type: "set_published_workflow_id", workflowId: state.present.workflow._id });
    }

    function handleCopyJSON() {
        const { _id, projectId, ...workflow } = state.present.workflow;
        const json = JSON.stringify(workflow, null, 2);
        navigator.clipboard.writeText(json);
        setShowCopySuccess(true);
        setTimeout(() => {
            setShowCopySuccess(false);
        }, 1500);
    }

    const processQueue = useCallback(async (state: State, dispatch: React.Dispatch<Action>) => {
        if (saving.current || saveQueue.current.length === 0) return;

        saving.current = true;
        const workflowToSave = saveQueue.current[saveQueue.current.length - 1];
        saveQueue.current = [];

        try {
            if (isLive) {
                return;
            } else {
                await saveWorkflow(state.present.workflow.projectId, state.present.workflow._id, workflowToSave);
            }
        } finally {
            saving.current = false;
            if (saveQueue.current.length > 0) {
                processQueue(state, dispatch);
            } else {
                dispatch({ type: "set_saving", saving: false });
            }
        }
    }, [isLive]);

    useEffect(() => {
        if (state.present.pendingChanges && state.present.workflow) {
            saveQueue.current.push(state.present.workflow);
            const timeoutId = setTimeout(() => {
                dispatch({ type: "set_saving", saving: true });
                processQueue(state, dispatch);
            }, 2000);

            return () => clearTimeout(timeoutId);
        }
    }, [state.present.workflow, state.present.pendingChanges, processQueue, state]);

    function handlePlaygroundClick() {
        setIsInitialState(false);
    }

    function pluralize(n: number, one: string, few: string, many: string) {
        if (n % 10 === 1 && n % 100 !== 11) return one;
        if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return few;
        return many;
    }

    function getRelativeTime(date: Date) {
        const now = new Date();
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000); // разница в секундах

        if (diff < 60) return 'только что';
        if (diff < 3600) {
            const mins = Math.floor(diff / 60);
            return mins + ' ' + pluralize(mins, 'минуту', 'минуты', 'минут') + ' назад';
        }
        if (diff < 86400) {
            const hours = Math.floor(diff / 3600);
            return hours + ' ' + pluralize(hours, 'час', 'часа', 'часов') + ' назад';
        }
        const days = Math.floor(diff / 86400);
        return days + ' ' + pluralize(days, 'день', 'дня', 'дней') + ' назад';
    }

    return <div className="flex flex-col h-full relative">
        <div className="shrink-0 flex justify-between items-center pb-6">
            <div className="text-lg font-bold text-black dark:text-white mb-2 ml-2">
                ProTo — ИИ-помощник построения агентов
            </div>
            {/* Левая часть (селектор версии, название, статус, меню версий) скрыта */}
            {/*
            <div className="workflow-version-selector flex items-center gap-4 px-2 text-gray-800 dark:text-gray-100">
                <WorkflowIcon size={16} />
                <Tooltip content="Нажмите для редактирования">
                    <div>
                        <EditableField
                            key={state.present.workflow._id}
                            value={state.present.workflow?.name || ''}
                            onChange={handleRenameWorkflow}
                            placeholder="Назовите эту версию"
                            className="text-sm font-semibold"
                            inline={true}
                        />
                    </div>
                </Tooltip>
                <div className="flex items-center gap-2">
                    {state.present.publishing && <Spinner size="sm" />}
                    {isLive && <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2">
                        <RadioIcon size={16} />
                        Live
                    </div>}
                    {!isLive && <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2">
                        <PenLine size={16} />
                        Draft
                    </div>}
                </div>
                <Dropdown>
                    <DropdownTrigger>
                        <div>
                            <Tooltip content="Меню версий">
                                <button className="p-1.5 text-gray-500 hover:text-gray-800 transition-colors">
                                    <HamburgerIcon size={20} />
                                </button>
                            </Tooltip>
                        </div>
                    </DropdownTrigger>
                    <DropdownMenu
                        disabledKeys={[
                            ...(state.present.pendingChanges ? ['switch', 'clone'] : []),
                            ...(isLive ? ['mcp'] : []),
                        ]}
                        onAction={(key) => {
                            if (key === 'switch') {
                                handleShowSelector();
                            }
                            if (key === 'clone') {
                                handleCloneVersion(state.present.workflow._id);
                            }
                            if (key === 'clipboard') {
                                handleCopyJSON();
                            }
                        }}
                    >
                        <DropdownItem
                            key="switch"
                            startContent={<div className="text-gray-500"><BackIcon size={16} /></div>}
                            className="gap-x-2"
                        >
                            Просмотр версий
                        </DropdownItem>
                        <DropdownItem
                            key="clone"
                            startContent={<div className="text-gray-500"><Layers2Icon size={16} /></div>}
                            className="gap-x-2"
                        >
                            Клонировать эту версию
                        </DropdownItem>
                        <DropdownItem
                            key="clipboard"
                            startContent={<div className="text-gray-500"><CopyIcon size={16} /></div>}
                            className="gap-x-2"
                        >
                            Экспорт в JSON
                        </DropdownItem>
                    </DropdownMenu>
                </Dropdown>
            </div>
            */}
            {/* Правая часть (кнопки, время, конфигурация) сдвинута вправо */}
            <div className="flex justify-end w-full">
                <div className="flex items-center gap-2">
                    {isLive && <div className="flex items-center gap-2">
                        <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2">
                            <AlertTriangle size={16} />
                            Эта версия заблокирована. Вы не можете вносить изменения. Изменения, примененные через Copilot, <b>не</b> будут отражены.
                        </div>
                        <Button
                            variant="solid"
                            size="md"
                            onPress={() => handleCloneVersion(state.present.workflow._id)}
                            className="gap-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm"
                            startContent={<Layers2Icon size={16} />}
                        >
                            Клонировать эту версию
                        </Button>
                        <Button
                            variant="solid"
                            size="md"
                            onPress={() => setShowCopilot(!showCopilot)}
                            className="gap-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm"
                        >
                        </Button>
                    </div>}
                    {!isLive && <div className="text-xs text-gray-400">
                        {state.present.saving && <div className="flex items-center gap-1">
                            <Spinner size="sm" />
                            <div>Сохранение...</div>
                        </div>}
                        {!state.present.saving && state.present.workflow && <div>
                            Обновлено {getRelativeTime(new Date(state.present.lastUpdatedAt))}
                        </div>}
                    </div>}
                    {!isLive && <>
                        <button
                            className="p-1 text-gray-400 hover:text-black hover:cursor-pointer"
                            title="Отменить"
                            disabled={state.currentIndex <= 0}
                            onClick={() => dispatch({ type: "undo" })}
                        >
                            <UndoIcon size={16} />
                        </button>
                        <button
                            className="p-1 text-gray-400 hover:text-black hover:cursor-pointer"
                            title="Повторить"
                            disabled={state.currentIndex >= state.patches.length}
                            onClick={() => dispatch({ type: "redo" })}
                        >
                            <RedoIcon size={16} />
                        </button>
                        {/* <Button
                            variant="solid"
                            size="md"
                            onPress={handlePublishWorkflow}
                            className="gap-2 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm"
                            startContent={<RocketIcon size={16} />}
                            data-tour-target="deploy"
                        >
                            Развернуть
                        </Button> */}
                        <Dropdown>
                            <DropdownTrigger>
                                <Button
                                    variant="solid"
                                    size="md"
                                    className="gap-2 px-4 bg-gray-600 hover:bg-gray-700 text-white font-semibold text-sm"
                                    startContent={<Settings2Icon size={16} />}
                                    data-tour-target="config-modal"
                                >
                                    Конфигурация
                                </Button>
                            </DropdownTrigger>
                            <DropdownMenu
                                onAction={(key) => {
                                    if (key === 'agents' || key === 'tools' || key === 'prompts') {
                                        setEntityModalTab(key as 'agents' | 'tools' | 'prompts');
                                        setShowEntityModal(true);
                                    }
                                }}
                            >
                                <DropdownSection title="Управление сущностями">
                                    <DropdownItem
                                        key="agents"
                                        startContent={<UsersIcon size={16} className="text-blue-500" />}
                                        description={`${state.present.workflow.agents.length} агентов`}
                                        className="gap-x-2"
                                    >
                                        Агенты
                                    </DropdownItem>
                                    <DropdownItem
                                        key="tools"
                                        startContent={<WrenchIcon size={16} className="text-green-500" />}
                                        description={`${state.present.workflow.tools.length + projectTools.length} инструментов`}
                                        className="gap-x-2"
                                    >
                                        Инструменты
                                    </DropdownItem>
                                    <DropdownItem
                                        key="prompts"
                                        startContent={<FileTextIcon size={16} className="text-purple-500" />}
                                        description={`${state.present.workflow.prompts.length} промптов`}
                                        className="gap-x-2"
                                    >
                                        Промпты
                                    </DropdownItem>
                                </DropdownSection>
                            </DropdownMenu>
                        </Dropdown>
                    </>}
                </div>
            </div>
        </div>
        <ResizablePanelGroup direction="horizontal" className="grow flex overflow-auto gap-1">
            <ResizablePanel
                minSize={30} // Adjusted minSize
                defaultSize={showCopilot ? PANEL_RATIOS.chatApp : 100} // Occupy full width if copilot is hidden
                className="overflow-auto"
            >
                <ChatApp
                    key={'' + state.present.chatKey}
                    hidden={state.present.selection !== null}
                    projectId={state.present.workflow.projectId}
                    workflow={state.present.workflow}
                    messageSubscriber={updateChatMessages}
                    mcpServerUrls={mcpServerUrls}
                    toolWebhookUrl={toolWebhookUrl}
                    isInitialState={isInitialState}
                    onPanelClick={() => {
                        // If we need to unselect agent/tool/prompt when clicking playground
                        if (state.present.selection) {
                            if (state.present.selection.type === 'agent') handleUnselectAgent();
                            if (state.present.selection.type === 'tool') handleUnselectTool();
                            if (state.present.selection.type === 'prompt') handleUnselectPrompt();
                        }
                        handlePlaygroundClick();
                    }}
                    projectTools={projectTools}
                />
                {/* Conditional rendering of AgentConfig, ToolConfig, PromptConfig can be moved to a modal or an "Advanced" section later */}
                {state.present.selection?.type === "agent" && <AgentConfig
                    key={state.present.selection.name}
                    projectId={state.present.workflow.projectId}
                    workflow={state.present.workflow}
                    agent={state.present.workflow.agents.find((agent) => agent.name === state.present.selection!.name)!}
                    usedAgentNames={new Set(state.present.workflow.agents.filter((agent) => agent.name !== state.present.selection!.name).map((agent) => agent.name))}
                    agents={state.present.workflow.agents}
                    tools={state.present.workflow.tools}
                    projectTools={projectTools}
                    prompts={state.present.workflow.prompts}
                    dataSources={dataSources}
                    handleUpdate={handleUpdateAgent.bind(null, state.present.selection.name)}
                    handleClose={handleUnselectAgent}
                    useRag={useRag}
                    triggerCopilotChat={triggerCopilotChat}
                />}
                {state.present.selection?.type === "tool" && (() => {
                    const selectedTool = state.present.workflow.tools.find(
                        (tool) => tool.name === state.present.selection!.name
                    ) || projectTools.find(
                        (tool) => tool.name === state.present.selection!.name
                    );
                    return <ToolConfig
                        key={state.present.selection.name}
                        tool={selectedTool!}
                        usedToolNames={new Set([
                            ...state.present.workflow.tools.filter((tool) => tool.name !== state.present.selection!.name).map((tool) => tool.name),
                            ...projectTools.filter((tool) => tool.name !== state.present.selection!.name).map((tool) => tool.name)
                        ])}
                        handleUpdate={handleUpdateTool.bind(null, state.present.selection.name)}
                        handleClose={handleUnselectTool}
                    />;
                })()}
                {state.present.selection?.type === "prompt" && <PromptConfig
                    key={state.present.selection.name}
                    prompt={state.present.workflow.prompts.find((prompt) => prompt.name === state.present.selection!.name)!}
                    agents={state.present.workflow.agents}
                    tools={state.present.workflow.tools}
                    prompts={state.present.workflow.prompts}
                    usedPromptNames={new Set(state.present.workflow.prompts.filter((prompt) => prompt.name !== state.present.selection!.name).map((prompt) => prompt.name))}
                    handleUpdate={handleUpdatePrompt.bind(null, state.present.selection.name)}
                    handleClose={handleUnselectPrompt}
                />}
            </ResizablePanel>
            {showCopilot && (
                <>
                    <ResizableHandle withHandle className="w-[3px] bg-transparent" />
                    <ResizablePanel
                        minSize={20} // Adjusted minSize
                        defaultSize={PANEL_RATIOS.copilot}
                        onResize={(size) => setCopilotWidth(size)}
                    >
                        <Copilot
                            ref={copilotRef}
                            projectId={state.present.workflow.projectId}
                            workflow={state.present.workflow}
                            dispatch={dispatch}
                            chatContext={
                                // chatMessages are now for the main ChatApp, Copilot context might need adjustment
                                // For now, let's keep it simple, or remove if it's too coupled with EntityList selection
                                chatMessages.length > 0 ? { 
                                    type: 'chat',
                                    messages: chatMessages // This might need to be Copilot specific messages
                                } : undefined
                            }
                            isInitialState={isInitialState}
                            dataSources={dataSources}
                        />
                    </ResizablePanel>
                </>
            )}
        </ResizablePanelGroup>
        {USE_PRODUCT_TOUR && showTour && (
            <ProductTour
                projectId={state.present.workflow.projectId}
                onComplete={() => setShowTour(false)}
            />
        )}
        <Modal 
            isOpen={showEntityModal} 
            onClose={() => setShowEntityModal(false)}
            size="4xl"
            className="max-h-[90vh]"
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex flex-col gap-1">
                            <div className="flex items-center justify-between w-full">
                                <h3 className="text-lg font-semibold">Конфигурация рабочего процесса</h3>
                                <div className="flex items-center gap-2">
                                    {entityModalTab === 'agents' && (
                                        <Button
                                            size="sm"
                                            variant="flat"
                                            onPress={() => {
                                                handleAddAgent({});
                                                onClose();
                                            }}
                                            startContent={<PlusCircleIcon size={16} />}
                                            className="bg-blue-100 hover:bg-blue-200 text-blue-700"
                                        >
                                            Добавить агента
                                        </Button>
                                    )}
                                    {entityModalTab === 'tools' && (
                                        <Button
                                            size="sm"
                                            variant="flat"
                                            onPress={() => {
                                                handleAddTool({});
                                                onClose();
                                            }}
                                            startContent={<PlusCircleIcon size={16} />}
                                            className="bg-green-100 hover:bg-green-200 text-green-700"
                                        >
                                            Добавить инструмент
                                        </Button>
                                    )}
                                    {entityModalTab === 'prompts' && (
                                        <Button
                                            size="sm"
                                            variant="flat"
                                            onPress={() => {
                                                handleAddPrompt({});
                                                onClose();
                                            }}
                                            startContent={<PlusCircleIcon size={16} />}
                                            className="bg-purple-100 hover:bg-purple-200 text-purple-700"
                                        >
                                            Добавить промпт
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <Button
                                    size="sm"
                                    variant={entityModalTab === 'agents' ? 'solid' : 'light'}
                                    onPress={() => setEntityModalTab('agents')}
                                    startContent={<UsersIcon size={16} />}
                                    className={entityModalTab === 'agents' ? 'bg-blue-600 text-white' : ''}
                                >
                                    Агенты ({state.present.workflow.agents.length})
                                </Button>
                                <Button
                                    size="sm"
                                    variant={entityModalTab === 'tools' ? 'solid' : 'light'}
                                    onPress={() => setEntityModalTab('tools')}
                                    startContent={<WrenchIcon size={16} />}
                                    className={entityModalTab === 'tools' ? 'bg-green-600 text-white' : ''}
                                >
                                    Инструменты ({state.present.workflow.tools.length + projectTools.length})
                                </Button>
                                <Button
                                    size="sm"
                                    variant={entityModalTab === 'prompts' ? 'solid' : 'light'}
                                    onPress={() => setEntityModalTab('prompts')}
                                    startContent={<FileTextIcon size={16} />}
                                    className={entityModalTab === 'prompts' ? 'bg-purple-600 text-white' : ''}
                                >
                                    Промпты ({state.present.workflow.prompts.length})
                                </Button>
                            </div>
                        </ModalHeader>
                        <ModalBody className="px-4 py-2">
                            <div className="h-[60vh] overflow-hidden">
                                <EntityList
                                    agents={state.present.workflow.agents}
                                    tools={state.present.workflow.tools}
                                    projectTools={projectTools}
                                    prompts={state.present.workflow.prompts}
                                    selectedEntity={state.present.selection}
                                    startAgentName={state.present.workflow.startAgent}
                                    onSelectAgent={(name) => {
                                        handleSelectAgent(name);
                                        onClose();
                                    }}
                                    onSelectTool={(name) => {
                                        handleSelectTool(name);
                                        onClose();
                                    }}
                                    onSelectPrompt={(name) => {
                                        handleSelectPrompt(name);
                                        onClose();
                                    }}
                                    onAddAgent={handleAddAgent}
                                    onAddTool={handleAddTool}
                                    onAddPrompt={handleAddPrompt}
                                    onToggleAgent={handleToggleAgent}
                                    onSetMainAgent={handleSetMainAgent}
                                    onDeleteAgent={handleDeleteAgent}
                                    onDeleteTool={handleDeleteTool}
                                    onDeletePrompt={handleDeletePrompt}
                                    projectId={state.present.workflow.projectId}
                                    onReorderAgents={handleReorderAgents}
                                    mode="modal"
                                    activeTab={entityModalTab}
                                />
                            </div>
                        </ModalBody>
                        <ModalFooter>
                            <Button variant="light" onPress={onClose}>
                                Закрыть
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    </div>;
}
