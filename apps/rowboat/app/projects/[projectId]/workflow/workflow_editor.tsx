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
import { CopyIcon, ImportIcon, Layers2Icon, RadioIcon, RedoIcon, ServerIcon, Sparkles, UndoIcon, RocketIcon, PenLine, AlertTriangle, Trash2Icon } from "lucide-react";
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

    // Placeholder for the new top bar content
    const TopBar = () => (
        <div className="shrink-0 flex justify-between items-center p-3 border-b dark:border-gray-700 bg-white dark:bg-gray-800">
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
                            <span className="mr-1.5"><BackIcon size={16} /></span> Versions
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
                        {state.present.publishing ? <Spinner size="sm" /> : "Publish Changes"}
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
        <div className="p-4 border-l dark:border-gray-700 h-full overflow-y-auto bg-gray-50 dark:bg-gray-800/30 w-full">
            <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Tools</h3>
                    <Button variant="ghost" size="sm" className="text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50" onPress={() => handleAddTool()}>+ Add tool</Button>
                </div>
                 {state.present.workflow.tools.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">Add tools to give your agents the ability to perform actions or connect with integrations.</p>}
                {state.present.workflow.tools.map(tool => (
                    <div key={tool.name} className={`p-2 mb-1.5 border dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${state.present.selection?.type === 'tool' && state.present.selection.name === tool.name ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-500 dark:border-indigo-500' : 'bg-white dark:bg-gray-700/50'}`}
                         onClick={() => handleSelectTool(tool.name)}>
                        <p className="font-medium text-sm text-gray-700 dark:text-gray-200">{tool.name}</p>
                        <button
                            onClick={(e) => {
                                e.stopPropagation(); // Prevent selecting the tool when clicking delete
                                handleDeleteTool(tool.name);
                            }}
                            className="absolute top-1 right-1 p-0.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            title={`Delete tool ${tool.name}`}
                        >
                            <Trash2Icon size={14} />
                        </button>
                    </div>
                ))}
            </div>

            <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Knowledge</h3>
                    {/* <Button variant="outline" size="sm" className="text-indigo-600 border-indigo-600 hover:bg-indigo-50">+ Add knowledge</Button> */}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {useRag ? "Configure RAG data sources for context-relevant responses." : "RAG is not enabled for this project."}
                </p>
                {/* Knowledge content (e.g., list of data sources, RAG settings) will go here */}
                 {useRag && dataSources.map(ds => (
                    <div key={ds._id} className="p-2 mt-1.5 border dark:border-gray-600 rounded-md bg-white dark:bg-gray-700/50">
                        <p className="font-medium text-sm text-gray-700 dark:text-gray-200">{ds.name}</p>
                        {ds.data?.type === 'urls' && <p className="text-xs text-gray-500 dark:text-gray-400">URL Source</p>}
                        {ds.data?.type === 'files' && <p className="text-xs text-gray-500 dark:text-gray-400">File Source</p>}
                        {/* Add more specific descriptions based on ds.data or if a general description field is available elsewhere */}
                    </div>
                 ))}
            </div>

            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Variables</h3>
                     <Button variant="ghost" size="sm" className="text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50" onPress={() => handleAddPrompt()}>+ Add variable</Button>
                </div>
                 {state.present.workflow.prompts.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">Turn reusable values into variables (prompts) that you can access with {`{{variable_name}}`}.</p>}
                {state.present.workflow.prompts.map(prompt => (
                    <div key={prompt.name} className={`p-2 mb-1.5 border dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${state.present.selection?.type === 'prompt' && state.present.selection.name === prompt.name ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-500 dark:border-indigo-500' : 'bg-white dark:bg-gray-700/50'}`}
                         onClick={() => handleSelectPrompt(prompt.name)}>
                        <p className="font-medium text-sm text-gray-700 dark:text-gray-200">{prompt.name}</p>
                        <button
                            onClick={(e) => {
                                e.stopPropagation(); // Prevent selecting the prompt when clicking delete
                                handleDeletePrompt(prompt.name);
                            }}
                            className="absolute top-1 right-1 p-0.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            title={`Delete variable ${prompt.name}`}
                        >
                            <Trash2Icon size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );

    return <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
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
                <ResizablePanelGroup direction="horizontal" className="grow flex overflow-auto gap-0">
                    {/* Left Panel for Agents List */}
                    <ResizablePanel minSize={15} defaultSize={20} className="bg-white dark:bg-gray-800 border-r dark:border-gray-700 p-4 overflow-y-auto">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Agents</h3>
                            <Button variant="ghost" size="sm" className="text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50" onPress={() => handleAddAgent()}>+ Add agent</Button>
                        </div>
                        {state.present.workflow.agents.map(agent => (
                            <div key={agent.name}
                                 className={`p-3 mb-2 border dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer 
                                            ${state.present.selection?.type === 'agent' && state.present.selection.name === agent.name ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-500 dark:border-indigo-500' : 'bg-white dark:bg-gray-700/50'}
                                            ${state.present.workflow.startAgent === agent.name ? 'ring-2 ring-green-500 dark:ring-green-400' : ''}`}
                                 onClick={() => handleSelectAgent(agent.name)}>
                                <div className="flex justify-between items-center">
                                    <p className={`font-medium text-sm ${agent.disabled ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-200'}`}>{agent.name}</p>
                                    {state.present.workflow.startAgent === agent.name && (
                                        <Tooltip content="Main Agent">
                                            <RocketIcon size={14} className="text-green-600 dark:text-green-500" />
                                        </Tooltip>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{agent.type} model</p>
                                {/* Add more agent details or actions if needed */}
                            </div>
                        ))}
                    </ResizablePanel>
                    <ResizableHandle className="w-[3px] bg-gray-200 dark:bg-gray-700 hover:bg-indigo-500 dark:hover:bg-indigo-600 transition-colors" />
                    {/* Central Configuration Panel */}
                    <ResizablePanel minSize={30} defaultSize={55} className="overflow-y-auto p-6 bg-white dark:bg-gray-800">
                        {state.present.selection?.type === "agent" && <AgentConfig
                            key={state.present.selection.name + state.present.workflow._id}
                            projectId={state.present.workflow.projectId}
                            workflow={state.present.workflow}
                            agent={state.present.workflow.agents.find((agent) => agent.name === state.present.selection!.name)!}
                            usedAgentNames={new Set(state.present.workflow.agents.filter((agent) => agent.name !== state.present.selection!.name).map((agent) => agent.name))}
                            agents={state.present.workflow.agents}
                            tools={state.present.workflow.tools}
                            prompts={state.present.workflow.prompts}
                            dataSources={dataSources}
                            handleUpdate={handleUpdateAgent.bind(null, state.present.selection.name)}
                            handleClose={handleUnselectAgent}
                            useRag={useRag}
                        />}
                        {state.present.selection?.type === "tool" && <ToolConfig
                            key={state.present.selection.name + state.present.workflow._id}
                            tool={state.present.workflow.tools.find((tool) => tool.name === state.present.selection!.name)!}
                            usedToolNames={new Set(state.present.workflow.tools.filter((tool) => tool.name !== state.present.selection!.name).map((tool) => tool.name))}
                            handleUpdate={handleUpdateTool.bind(null, state.present.selection.name)}
                            handleClose={handleUnselectTool}
                        />}
                        {state.present.selection?.type === "prompt" && <PromptConfig
                            key={state.present.selection.name + state.present.workflow._id}
                            prompt={state.present.workflow.prompts.find((prompt) => prompt.name === state.present.selection!.name)!}
                            agents={state.present.workflow.agents}
                            tools={state.present.workflow.tools}
                            prompts={state.present.workflow.prompts}
                            usedPromptNames={new Set(state.present.workflow.prompts.filter((prompt) => prompt.name !== state.present.selection!.name).map((prompt) => prompt.name))}
                            handleUpdate={handleUpdatePrompt.bind(null, state.present.selection.name)}
                            handleClose={handleUnselectPrompt}
                        />}
                        {!state.present.selection && (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <Layers2Icon size={64} className="text-gray-300 dark:text-gray-600 mb-4" />
                                <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-2">Build Your Workflow</h2>
                                <p className="text-gray-500 dark:text-gray-400 max-w-md">
                                    Select an agent from the left panel to configure its instructions, model, and associated tools/knowledge.
                                    You can also add new tools or variables using the right panel.
                                </p>
                                 <div className="mt-8">
                                    <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white" onPress={() => handleAddAgent()}>
                                        <span className="mr-2"><Sparkles size={20} /></span> Create First Agent
                                    </Button>
                                 </div>
                            </div>
                        )}
                    </ResizablePanel>
                    <ResizableHandle className="w-[3px] bg-gray-200 dark:bg-gray-700 hover:bg-indigo-500 dark:hover:bg-indigo-600 transition-colors" />
                    {/* Right Sidebar for Tools, Knowledge, Variables */}
                    <ResizablePanel minSize={15} defaultSize={25}>
                        <BuildRightSidebar />
                    </ResizablePanel>
                </ResizablePanelGroup>
            )}
        </div>

        {/* Modals and Product Tour */}
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
