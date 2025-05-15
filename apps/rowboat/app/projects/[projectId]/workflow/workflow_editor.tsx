"use client";
import React, { useReducer, Reducer, useState, useCallback, useEffect, useRef, createContext, useContext } from "react";
import { MCPServer, WithStringId } from "../../../lib/types/types";
import { Workflow } from "../../../lib/types/workflow_types";
import { WorkflowTool } from "../../../lib/types/workflow_types";
import { WorkflowPrompt } from "../../../lib/types/workflow_types";
import { WorkflowAgent } from "../../../lib/types/workflow_types";
import { DataSource } from "../../../lib/types/datasource_types";
import { produce, applyPatches, enablePatches, produceWithPatches, Patch } from 'immer';
import { AgentConfig } from "../entities/agent_config";
import { ToolConfig } from "../entities/tool_config";
import { App as ChatApp } from "../playground/app";
import { z } from "zod";
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Spinner, Tooltip } from "@heroui/react";
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
import { CopyIcon, ImportIcon, Layers2Icon, RadioIcon, RedoIcon, ServerIcon, Sparkles, UndoIcon, RocketIcon, PenLine, AlertTriangle, Trash2Icon, Settings2Icon, XIcon } from "lucide-react";
import { EntityList } from "./entity_list";
import { McpImportTools } from "./mcp_imports";
import { ProductTour } from "@/components/common/product-tour";

enablePatches();

const PANEL_RATIOS = {
    entityList: 25,    // Left panel
    chatApp: 40,       // Middle panel
    copilot: 35        // Right panel
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
    type: "import_mcp_tools";
    tools: z.infer<typeof WorkflowTool>[];
};

function reducer(state: State, action: Action): State {
    console.log('running reducer', action);
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
                            draft.selection = {
                                type: "agent",
                                name: action.agent.name || newAgentName
                            };
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
                            // If the deleted agent was the startAgent, reset startAgent
                            if (draft.workflow.startAgent === action.name) {
                                draft.workflow.startAgent = draft.workflow.agents.length > 0 ? draft.workflow.agents[0].name : "";
                            }
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
                                    draft.selection = {
                                        type: "agent",
                                        name: action.agent.name
                                    };
                                }
                            }

                            // select this agent
                            draft.selection = {
                                type: "agent",
                                name: action.agent.name || action.name,
                            };
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
                        case "import_mcp_tools":
                            if (isLive) {
                                break;
                            }
                            // Process each tool one by one
                            action.tools.forEach(newTool => {
                                const existingToolIndex = draft.workflow.tools.findIndex(
                                    tool => tool.name === newTool.name
                                );

                                if (existingToolIndex !== -1) {
                                    // Replace existing tool
                                    draft.workflow.tools[existingToolIndex] = newTool;
                                } else {
                                    // Add new tool
                                    draft.workflow.tools.push(newTool);
                                }
                            });
                            draft.pendingChanges = true;
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
    const [isMcpImportModalOpen, setIsMcpImportModalOpen] = useState(false);
    const [isInitialState, setIsInitialState] = useState(true);
    const [showTour, setShowTour] = useState(true);
    const [viewMode, setViewMode] = useState<'run' | 'build'>('build');

    // State for configuration modal
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [configModalEntityType, setConfigModalEntityType] = useState<'agent' | 'tool' | 'prompt' | null>(null);
    const [configModalEntityName, setConfigModalEntityName] = useState<string | null>(null);

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
        if (window.confirm(`Are you sure you want to delete the agent "${name}"?`)) {
            dispatch({ type: "delete_agent", name });
        }
    }

    function handleUpdateTool(name: string, tool: Partial<z.infer<typeof WorkflowTool>>) {
        dispatch({ type: "update_tool", name, tool });
    }

    function handleDeleteTool(name: string) {
        if (window.confirm(`Are you sure you want to delete the tool "${name}"?`)) {
            dispatch({ type: "delete_tool", name });
        }
    }

    function handleUpdatePrompt(name: string, prompt: Partial<z.infer<typeof WorkflowPrompt>>) {
        dispatch({ type: "update_prompt", name, prompt });
    }

    function handleDeletePrompt(name: string) {
        if (window.confirm(`Are you sure you want to delete the prompt "${name}"?`)) {
            dispatch({ type: "delete_prompt", name });
        }
    }

    function handleToggleAgent(name: string) {
        dispatch({ type: "toggle_agent", name });
    }

    function handleSetMainAgent(name: string) {
        dispatch({ type: "set_main_agent", name });
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

    function triggerMcpImport() {
        setIsMcpImportModalOpen(true);
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

    function handleImportMcpTools(tools: z.infer<typeof WorkflowTool>[]) {
        dispatch({ type: "import_mcp_tools", tools });
    }

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

    // Functions to control the configuration modal
    const handleOpenConfigModal = (type: 'agent' | 'tool' | 'prompt', name: string) => {
        setConfigModalEntityType(type);
        setConfigModalEntityName(name);
        setConfigModalOpen(true);
        // dispatch({ type: type === 'agent' ? 'select_agent' : type === 'tool' ? 'select_tool' : 'select_prompt', name }); // Optionally select entity when opening modal
    };

    const handleCloseConfigModal = () => {
        setConfigModalOpen(false);
        setConfigModalEntityType(null);
        setConfigModalEntityName(null);
        // dispatch({ type: 'unselect_agent' }); // Optionally unselect when closing, or keep selection for copilot context
    };

    const TopBar = () => (
        <div className="shrink-0 flex justify-between items-center p-3 border-b dark:border-gray-700 bg-white dark:bg-gray-800 w-full">
            {/* Left side: Run/Build Toggle */}
            <div className="flex gap-2">
                <Button
                    variant={viewMode === 'run' ? 'solid' : 'ghost'}
                    onPress={() => setViewMode('run')}
                    className={`px-4 py-2 text-sm font-medium rounded-md ${viewMode === 'run' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                    <ServerIcon size={16} className="mr-2" /> Run
                </Button>
                <Button
                    variant={viewMode === 'build' ? 'solid' : 'ghost'}
                    onPress={() => setViewMode('build')}
                    className={`px-4 py-2 text-sm font-medium rounded-md ${viewMode === 'build' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                    <Layers2Icon size={16} className="mr-2" /> Build
                </Button>
            </div>

            {/* Center: Workflow Name and Status (Simplified) */}
            <div className="flex-grow flex justify-center items-center gap-2 text-sm">
                <Tooltip content="Click to edit workflow name">
                    <div>
                        <EditableField
                            key={state.present.workflow._id + "_name"}
                            value={state.present.workflow?.name || ''}
                            onChange={handleRenameWorkflow}
                            placeholder="Untitled Workflow"
                            className="font-semibold text-gray-800 dark:text-gray-100"
                            inline={true}
                        />
                    </div>
                </Tooltip>
                {isLive && <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1">
                    <RadioIcon size={12} />
                    Live
                </div>}
                {!isLive && <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1">
                    <PenLine size={12} />
                    Draft
                </div>}
            </div>

            {/* Right side: Versions, Publish (Moved and simplified) */}
            <div className="flex items-center gap-3">
                <Dropdown>
                    <DropdownTrigger>
                        <Button variant="ghost" className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <span className="mr-1.5"><BackIcon size={16} /></span> Версии
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                        disabledKeys={[
                            ...(state.present.pendingChanges ? ['switch', 'clone'] : []),
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
                        <DropdownItem key="switch" startContent={<BackIcon size={16} />} className="text-sm">View Other Versions</DropdownItem>
                        <DropdownItem key="clone" startContent={<Layers2Icon size={16} />} className="text-sm">Clone This Version</DropdownItem>
                        <DropdownItem key="clipboard" startContent={<CopyIcon size={16} />} className="text-sm">Export to JSON</DropdownItem>
                    </DropdownMenu>
                </Dropdown>

                {!isLive && (
                    <Button
                        variant="solid"
                        size="md"
                        onPress={handlePublishWorkflow}
                        className="gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm rounded-md"
                        startContent={<RocketIcon size={16} />}
                        disabled={state.present.publishing}
                        data-tour-target="deploy"
                    >
                        {state.present.publishing ? <Spinner size="sm" /> : "Опубликовать"}
                    </Button>
                )}
                 {isLive && (
                     <Button
                        variant="solid"
                        size="md"
                        onPress={() => handleCloneVersion(state.present.workflow._id)}
                        className="gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-md"
                        startContent={<Layers2Icon size={16} />}
                    >
                        Clone to Edit
                    </Button>
                 )}
            </div>
        </div>
    );

    // Placeholder for the "Build" mode's right sidebar
    const BuildRightSidebar = () => (
        <div className="h-full w-full border-l dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 flex flex-col overflow-hidden">
            <div className="p-4 overflow-y-auto flex-1">
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Tools</h3>
                        <Button variant="ghost" size="sm" className="text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50" onPress={() => handleAddTool()}>+ Add tool</Button>
                    </div>
                     {state.present.workflow.tools.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">Add tools to give your agents the ability to perform actions or connect with integrations.</p>}
                    {state.present.workflow.tools.map(tool => (
                        <div key={tool.name} 
                             className={`relative group p-2 mb-1.5 border dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${state.present.selection?.type === 'tool' && state.present.selection.name === tool.name ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-500 dark:border-indigo-500' : 'bg-white dark:bg-gray-700/50'}`}>
                            <div onClick={() => dispatch({type: "select_tool", name: tool.name})}> {/* Select on click */} 
                              <p className="font-medium text-sm text-gray-700 dark:text-gray-200 pr-10">{tool.name}</p>
                            </div>
                            <div className="absolute top-1/2 right-1 transform -translate-y-1/2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation(); 
                                        handleOpenConfigModal('tool', tool.name);
                                    }}
                                    className="p-1 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    title={`Configure tool ${tool.name}`}
                                >
                                    <Settings2Icon size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteTool(tool.name);
                                    }}
                                    className="p-1 text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    title={`Delete tool ${tool.name}`}
                                >
                                    <Trash2Icon size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Knowledge</h3>
                        {/* <Button variant="ghost" size="sm" className="text-indigo-600 border-indigo-600 hover:bg-indigo-50">+ Add knowledge</Button> */}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {useRag ? "Настройте источники данных RAG для получения ответов, соответствующих контексту." : "RAG is not enabled for this project."}
                    </p>
                     {useRag && dataSources.map(ds => (
                        <div key={ds._id} className="relative group p-2 mt-1.5 border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700/50">
                            <p className="font-medium text-sm text-gray-700 dark:text-gray-200">{ds.name}</p>
                            {ds.data?.type === 'urls' && <p className="text-xs text-gray-500 dark:text-gray-400">URL Source</p>}
                            {ds.data?.type === 'files' && <p className="text-xs text-gray-500 dark:text-gray-400">File Source</p>}
                             {/* Placeholder for settings button if needed for data sources */}
                             {/* <button className="absolute top-1 right-1 p-0.5 text-gray-400 hover:text-indigo-500 rounded-full opacity-0 group-hover:opacity-100"><Settings2Icon size={14}/></button> */}
                        </div>
                     ))}
                </div>

                <div>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Variables</h3>
                         <Button variant="ghost" size="sm" className="text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50" onPress={() => handleAddPrompt()}>+ Add variable</Button>
                    </div>
                     {state.present.workflow.prompts.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">Превратите многократно используемые значения в переменные (prompts) к которым можно обратиться с помощью {`{{variable_name}}`}.</p>}
                    {state.present.workflow.prompts.map(prompt => (
                        <div key={prompt.name} 
                             className={`relative group p-2 mb-1.5 border dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${state.present.selection?.type === 'prompt' && state.present.selection.name === prompt.name ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-500 dark:border-indigo-500' : 'bg-white dark:bg-gray-700/50'}`}>
                            <div onClick={() => dispatch({type: "select_prompt", name: prompt.name})}> {/* Select on click */} 
                               <p className="font-medium text-sm text-gray-700 dark:text-gray-200 pr-10">{prompt.name}</p>
                            </div>
                            <div className="absolute top-1/2 right-1 transform -translate-y-1/2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation(); 
                                        handleOpenConfigModal('prompt', prompt.name);
                                    }}
                                    className="p-1 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    title={`Configure variable ${prompt.name}`}
                                >
                                    <Settings2Icon size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation(); 
                                        handleDeletePrompt(prompt.name);
                                    }}
                                    className="p-1 text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    title={`Delete variable ${prompt.name}`}
                                >
                                    <Trash2Icon size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return <div className="flex flex-col h-full w-full bg-gray-100 dark:bg-gray-900">
        <TopBar />

        <div className="grow flex overflow-hidden">
            {viewMode === 'run' && (
                <div className="w-full h-full overflow-y-auto p-1 md:p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                    <ChatApp
                        key={'run_mode_' + state.present.chatKey + '_' + state.present.workflow._id}
                        projectId={state.present.workflow.projectId}
                        workflow={state.present.workflow}
                        messageSubscriber={updateChatMessages}
                        mcpServerUrls={mcpServerUrls}
                        toolWebhookUrl={toolWebhookUrl}
                        isInitialState={isInitialState}
                        onPanelClick={handlePlaygroundClick}
                    />
                </div>
            )}

            {viewMode === 'build' && (
                <ResizablePanelGroup direction="horizontal" className="grow flex overflow-hidden gap-0 max-h-full">
                    {/* Left Panel for Agents List */}
                    <ResizablePanel minSize={15} defaultSize={20} className="bg-white dark:bg-gray-800 border-r dark:border-gray-700 overflow-hidden flex flex-col max-h-full">
                        <div className="flex justify-between items-center mb-2 px-4 pt-4">
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Agents</h3>
                            <Button variant="ghost" size="sm" className="text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50" onPress={() => handleAddAgent()}>+ Add agent</Button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
                            {state.present.workflow.agents.map(agent => (
                                <div 
                                    key={agent.name}
                                    className={`relative group mb-2 border dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer max-w-full
                                               ${state.present.selection?.type === 'agent' && state.present.selection.name === agent.name ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-500 dark:border-indigo-500' : 'bg-white dark:bg-gray-700/50'}
                                               ${state.present.workflow.startAgent === agent.name ? 'ring-2 ring-green-500 dark:ring-green-400' : ''}`}
                                    onClick={() => dispatch({type: "select_agent", name: agent.name})}
                                >
                                    <div className="p-3 pr-16"> {/* Added fixed right padding for actions */}
                                        <div className="flex flex-col">
                                            <p className={`font-medium text-sm truncate ${agent.disabled ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-200'}`}>
                                                {agent.name}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{agent.type} model</p>
                                        </div>
                                    </div>
                                    <div className="absolute top-0 right-0 h-full flex items-center pr-2">
                                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            {/* Main agent button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (state.present.workflow.startAgent !== agent.name) {
                                                        handleSetMainAgent(agent.name);
                                                    }
                                                }}
                                                className={`p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors 
                                                            ${state.present.workflow.startAgent === agent.name ? 'text-green-500 dark:text-green-400 cursor-default' : 'text-gray-400 hover:text-green-500 dark:hover:text-green-400'}`}
                                                title={state.present.workflow.startAgent === agent.name ? "Main Agent" : "Set as Main Agent"}
                                            >
                                                <RocketIcon size={14} />
                                            </button>
                                            {/* Configure button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation(); 
                                                    handleOpenConfigModal('agent', agent.name);
                                                }}
                                                className="p-1 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                            >
                                                <Settings2Icon size={14} />
                                            </button>
                                            {/* Delete button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation(); 
                                                    if (window.confirm(`Are you sure you want to delete the agent "${agent.name}"?`)) {
                                                        handleDeleteAgent(agent.name);
                                                    }
                                                }}
                                                className="p-1 text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                            >
                                                <Trash2Icon size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ResizablePanel>
                    <ResizableHandle className="w-[3px] bg-gray-200 dark:bg-gray-700 hover:bg-indigo-500 dark:hover:bg-indigo-600 transition-colors" />
                    {/* Central Configuration Panel - Now ONLY Copilot */}
                    <ResizablePanel minSize={30} defaultSize={55} className="overflow-y-auto p-1 md:p-0 bg-white dark:bg-gray-800 flex flex-col max-h-full">
                        <Copilot
                            projectId={state.present.workflow.projectId}
                            workflow={state.present.workflow}
                            dispatch={dispatch}
                            chatContext={ // Pass selection to Copilot for context
                                state.present.selection ? {
                                    type: state.present.selection.type,
                                    name: state.present.selection.name
                                } : chatMessages.length > 0 && !state.present.selection ? { // If no direct selection, but chat has messages, pass chat context
                                    type: 'chat',
                                    messages: chatMessages
                                } : undefined
                            }
                            isInitialState={isInitialState && !state.present.selection}
                        />
                        {/* Configuration components (AgentConfig, ToolConfig, PromptConfig) are now removed from here */}
                        {/* They will be rendered in a modal */}
                    </ResizablePanel>
                    <ResizableHandle className="w-[3px] bg-gray-200 dark:bg-gray-700 hover:bg-indigo-500 dark:hover:bg-indigo-600 transition-colors" />
                    {/* Right Sidebar for Tools, Knowledge, Variables */}
                    <ResizablePanel minSize={15} defaultSize={25} className="max-h-full">
                        <BuildRightSidebar />
                    </ResizablePanel>
                </ResizablePanelGroup>
            )}
        </div>

        {/* MODAL for Configuration */}
        {configModalOpen && configModalEntityType && configModalEntityName && (
            <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                    <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
                        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                            Configure {configModalEntityType.charAt(0).toUpperCase() + configModalEntityType.slice(1)}: <span className="text-indigo-600 dark:text-indigo-400">{configModalEntityName}</span>
                        </h3>
                        <Button variant="ghost" size="sm" onPress={handleCloseConfigModal} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                            <XIcon size={20} />
                        </Button>
                    </div>
                    <div className="p-6 overflow-y-auto grow">
                        {configModalEntityType === 'agent' && state.present.workflow.agents.find(a => a.name === configModalEntityName) && (
                            <AgentConfig
                                key={`modal_agent_${configModalEntityName}`}
                                projectId={state.present.workflow.projectId}
                                workflow={state.present.workflow}
                                agent={state.present.workflow.agents.find(a => a.name === configModalEntityName)!}
                                usedAgentNames={new Set(state.present.workflow.agents.filter(a => a.name !== configModalEntityName).map(a => a.name))}
                                agents={state.present.workflow.agents}
                                tools={state.present.workflow.tools}
                                prompts={state.present.workflow.prompts}
                                dataSources={dataSources}
                                handleUpdate={(agentUpdate) => {
                                    const currentName = configModalEntityName!;
                                    handleUpdateAgent(currentName, agentUpdate);
                                    if (agentUpdate.name && agentUpdate.name !== currentName) {
                                        handleCloseConfigModal();
                                    }
                                }}
                                handleClose={handleCloseConfigModal}
                                useRag={useRag}
                            />
                        )}
                        {configModalEntityType === 'tool' && state.present.workflow.tools.find(t => t.name === configModalEntityName) && (
                            <ToolConfig
                                key={`modal_tool_${configModalEntityName}`}
                                tool={state.present.workflow.tools.find(t => t.name === configModalEntityName)!}
                                usedToolNames={new Set(state.present.workflow.tools.filter(t => t.name !== configModalEntityName).map(t => t.name))}
                                handleUpdate={(toolUpdate) => {
                                    const currentName = configModalEntityName!;
                                    handleUpdateTool(currentName, toolUpdate);
                                    if (toolUpdate.name && toolUpdate.name !== currentName) {
                                        handleCloseConfigModal();
                                    }
                                }}
                                handleClose={handleCloseConfigModal}
                            />
                        )}
                        {configModalEntityType === 'prompt' && state.present.workflow.prompts.find(p => p.name === configModalEntityName) && (
                            <PromptConfig
                                key={`modal_prompt_${configModalEntityName}`}
                                prompt={state.present.workflow.prompts.find(p => p.name === configModalEntityName)!}
                                agents={state.present.workflow.agents}
                                tools={state.present.workflow.tools}
                                prompts={state.present.workflow.prompts}
                                usedPromptNames={new Set(state.present.workflow.prompts.filter(p => p.name !== configModalEntityName).map(p => p.name))}
                                handleUpdate={(promptUpdate) => {
                                    const currentName = configModalEntityName!;
                                    handleUpdatePrompt(currentName, promptUpdate);
                                    if (promptUpdate.name && promptUpdate.name !== currentName) {
                                        handleCloseConfigModal();
                                    }
                                }}
                                handleClose={handleCloseConfigModal}
                            />
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Other Modals and Product Tour */}
        {USE_PRODUCT_TOUR && showTour && (
            <ProductTour
                projectId={state.present.workflow.projectId}
                onComplete={() => setShowTour(false)}
            />
        )}
        <McpImportTools
            projectId={state.present.workflow.projectId}
            isOpen={isMcpImportModalOpen}
            onOpenChange={setIsMcpImportModalOpen}
            onImport={handleImportMcpTools}
        />
    </div>;
}
