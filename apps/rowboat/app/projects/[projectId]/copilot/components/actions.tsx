'use client';
import { createContext, useContext, useRef, useState } from "react";
import clsx from "clsx";
import { z } from "zod";
import { CopilotAssistantMessageActionPart } from "../../../../lib/types/copilot_types";
import { Workflow } from "../../../../lib/types/workflow_types";
import { PreviewModalProvider, usePreviewModal } from '../../workflow/preview-modal';
import { getAppliedChangeKey } from "../app";
import { AlertTriangleIcon, CheckCheckIcon, CheckIcon, ChevronsDownIcon, ChevronsUpIcon, EyeIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Spinner } from "@heroui/react";

const ActionContext = createContext<{
    msgIndex: number;
    actionIndex: number;
    action: z.infer<typeof CopilotAssistantMessageActionPart>['content'] | null;
    workflow: z.infer<typeof Workflow> | null;
    appliedFields: string[];
    stale: boolean;
}>({ msgIndex: 0, actionIndex: 0, action: null, workflow: null, appliedFields: [], stale: false });

export function Action({
    msgIndex,
    actionIndex,
    action,
    workflow,
    dispatch,
    stale,
}: {
    msgIndex: number;
    actionIndex: number;
    action: z.infer<typeof CopilotAssistantMessageActionPart>['content'];
    workflow: z.infer<typeof Workflow>;
    dispatch: (action: any) => void;
    stale: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [appliedChanges, setAppliedChanges] = useState<Record<string, boolean>>({});

    if (!action || typeof action !== 'object') {
        console.warn('Invalid action object:', action);
        return null;
    }

    const appliedFields = Object.keys(action.config_changes).filter(key => 
        appliedChanges[getAppliedChangeKey(msgIndex, actionIndex, key)]
    );
    const allApplied = Object.keys(action.config_changes).every(key => 
        appliedFields.includes(key)
    );

    // Handle applying a single field change
    const handleFieldChange = (field: string) => {
        const changes = { [field]: action.config_changes[field] };
        
        switch (action.config_type) {
            case 'agent':
                dispatch({
                    type: 'update_agent',
                    name: action.name,
                    agent: changes
                });
                break;
            case 'tool':
                dispatch({
                    type: 'update_tool',
                    name: action.name,
                    tool: changes
                });
                break;
            case 'prompt':
                dispatch({
                    type: 'update_prompt',
                    name: action.name,
                    prompt: changes
                });
                break;
            case 'workflow':
                if (field === 'startAgent') {
                    dispatch({
                        type: 'set_main_agent',
                        name: changes[field]
                    });
                }
                break;
        }

        setAppliedChanges(prev => ({
            ...prev,
            [getAppliedChangeKey(msgIndex, actionIndex, field)]: true
        }));
    };

    // Handle applying all changes
    const handleApplyAll = () => {
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
                    // Handle workflow changes
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
            acc[getAppliedChangeKey(msgIndex, actionIndex, key)] = true;
            return acc;
        }, {} as Record<string, boolean>);
        setAppliedChanges(prev => ({
            ...prev,
            ...appliedKeys
        }));
    };

    return <div className={clsx('flex flex-col rounded-sm border border-t-4', {
        'bg-gray-50 dark:bg-gray-800/50 border-gray-400 dark:border-gray-600 border-t-blue-500 shadow': !stale && !allApplied && action.action == 'create_new',
        'bg-gray-50 dark:bg-gray-800/50 border-gray-400 dark:border-gray-600 border-t-orange-500 shadow': !stale && !allApplied && action.action == 'edit',
        'bg-gray-100 dark:bg-gray-800/30 border-gray-400 dark:border-gray-600 border-t-gray-400': stale || allApplied || action.error,
    })}>
        <ActionContext.Provider value={{ msgIndex, actionIndex, action, workflow, appliedFields, stale }}>
            <ActionHeader />
            <ActionSummary />
            {expanded && <PreviewModalProvider>
                {action.error && <div className="flex flex-col gap-1 px-1 text-xs bg-red-50 dark:bg-red-900/20 rounded-sm">
                    <div className="text-red-500 dark:text-red-400 font-medium text-xs">Эта конфигурация недействительна и не может быть применена:</div>
                    <div className="text-xs font-mono dark:text-gray-300">{action.error}</div>
                </div>}
                <div className="flex flex-col gap-2 px-1">
                    {Object.entries(action.config_changes).map(([key, value]) => {
                        return <ActionField key={key} field={key} onApply={handleFieldChange} />
                    })}
                </div>
            </PreviewModalProvider>}
            <div className="flex items-center">
                {action.error && <div className="grow rounded-l-sm bg-red-100 dark:bg-red-900/20 text-red-500 dark:text-red-400 flex flex-col items-center justify-center h-8">
                    <div className="flex items-center gap-2 justify-center">
                        <AlertTriangleIcon size={16} />
                        <div className="font-medium text-xs">Ошибка</div>
                    </div>
                </div>}
                {!action.error && <button
                    className="grow rounded-l-sm bg-blue-100 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/30 disabled:bg-gray-100 dark:disabled:bg-gray-800/30 disabled:text-gray-300 dark:disabled:text-gray-600 flex flex-col items-center justify-center h-8"
                    onClick={handleApplyAll}
                    disabled={stale || allApplied}
                >
                    <div className="flex items-center gap-2 justify-center">
                        <CheckCheckIcon size={16} />
                        <div className="font-medium text-xs">{allApplied ? 'Применено' : 'Применить'}</div>
                    </div>
                </button>}
                <button
                    className="w-10 shrink-0 flex flex-col items-center h-8 rounded-r-sm bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 justify-center"
                    onClick={() => setExpanded(!expanded)}
                >
                    <div className="flex items-center gap-2 justify-center text-gray-400 dark:text-gray-500">
                        {expanded ? (
                            <ChevronsUpIcon size={16} />
                        ) : (
                            <ChevronsDownIcon size={16} />
                        )}
                    </div>
                </button>
            </div>
        </ActionContext.Provider>
    </div>;
}

export function ActionSummary() {
    const { msgIndex, actionIndex, action, workflow, appliedFields, stale } = useContext(ActionContext);
    if (!action || !workflow) return null;

    return <div className="px-1 my-1">
        <div className="bg-white dark:bg-gray-800 rounded-sm p-2 text-sm">
            {action.change_description}
        </div>
    </div>;
}

export function ActionHeader() {
    const { msgIndex, actionIndex, action, workflow, appliedFields, stale } = useContext(ActionContext);
    if (!action || !workflow) return null;

    const targetType = action.config_type === 'tool' ? 'инструмент' : action.config_type === 'agent' ? 'агент' : 'промт';
    const change = action.action === 'create_new' ? 'Создать' : 'Изменить';

    return <div className="flex gap-2 items-center py-1 px-1">
        {action.action == 'create_new' && <PlusIcon size={16} />}
        {action.action == 'edit' && <PencilIcon size={16} />}
        <div className="text-sm truncate">{`${change} ${targetType}`}: <span className="font-medium">{action.name}</span></div>
    </div>;
}

export function ActionField({
    field,
    onApply,
}: {
    field: string;
    onApply: (field: string) => void;
}) {
    const { msgIndex, actionIndex, action, workflow, appliedFields, stale } = useContext(ActionContext);
    const { showPreview } = usePreviewModal();
    if (!action || !workflow) return null;

    // determine whether this field is applied
    const applied = appliedFields.includes(field);

    const newValue = action.config_changes[field];
    // Get the old value if this is an edit action
    let oldValue = undefined;
    if (action.action === 'edit') {
        if (action.config_type === 'tool') {
            // Find the tool in the workflow
            const tool = workflow.tools.find(t => t.name === action.name);
            if (tool) {
                oldValue = tool[field as keyof typeof tool];
            }
        } else if (action.config_type === 'agent') {
            // Find the agent in the workflow
            const agent = workflow.agents.find(a => a.name === action.name);
            if (agent) {
                oldValue = agent[field as keyof typeof agent];
            }
        } else if (action.config_type === 'prompt') {
            // Find the prompt in the workflow
            const prompt = workflow.prompts.find(p => p.name === action.name);
            if (prompt) {
                oldValue = prompt[field as keyof typeof prompt];
            }
        }
    }

    // if edit type of action, preview is enabled
    const previewCondition = action.action === 'edit' ||
        (action.config_type === 'agent' && field === 'instructions');

    // enable markdown preview for some fields
    const markdownPreviewCondition = (action.config_type === 'agent' && field === 'instructions') ||
        (action.config_type === 'agent' && field === 'examples') ||
        (action.config_type === 'prompt' && field === 'prompt') ||
        (action.config_type === 'tool' && field === 'description');
    
    // generate preview modal function
    const previewModalHandler = () => {
        if (previewCondition) {
            showPreview(
                oldValue ? (typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue)) : undefined,
                (typeof newValue === 'string' ? newValue : JSON.stringify(newValue)),
                markdownPreviewCondition,
                `${action.name} - ${field}`,
                "Просмотр изменений",
                () => onApply(field)
            );
        }
    }

    return <div className="flex flex-col bg-white dark:bg-gray-800 rounded-sm">
        <div className="flex justify-between items-start">
            <div className="text-xs font-semibold px-2 py-1 text-gray-600 dark:text-gray-300">{field}</div>
            {previewCondition && <div className="flex gap-4 items-center bg-gray-50 dark:bg-gray-700 rounded-bl-sm rounded-tr-sm px-2 py-1">
                <button
                    className="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white"
                    onClick={previewModalHandler}
                >
                    <EyeIcon size={16} />
                </button>
                {action.action === 'edit' && !action.error && <button
                    className={clsx("text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white", {
                        'text-green-600 dark:text-green-400': applied,
                        'text-gray-600 dark:text-gray-400': stale,
                    })}
                    onClick={() => onApply(field)}
                    disabled={stale || applied}
                >
                    <CheckIcon size={16} />
                </button>}
            </div>}
        </div>
        <div className="px-2 pb-1">
            <div className="text-sm italic truncate dark:text-gray-300">
                {JSON.stringify(newValue)}
            </div>
        </div>
    </div>;
}

export function StreamingAction({
    action,
    loading,
}: {
    action: {
        action?: 'create_new' | 'edit';
        config_type?: 'tool' | 'agent' | 'prompt' | 'workflow';
        name?: string;
    };
    loading: boolean;
}) {
    return <div className={clsx('flex flex-col rounded-sm border border-t-4', {
        'bg-gray-50 dark:bg-gray-800/50 border-gray-400 dark:border-gray-600 border-t-blue-500 shadow': action.action == 'create_new',
        'bg-gray-50 dark:bg-gray-800/50 border-gray-400 dark:border-gray-600 border-t-orange-500 shadow': action.action == 'edit',
    })}>
        <div className="flex gap-2 items-center py-1 px-1">
            {action.action == 'create_new' && <PlusIcon size={16} />}
            {action.action == 'edit' && <PencilIcon size={16} />}
            <div className="text-sm truncate">
                {action.config_type && `${action.action === 'create_new' ? 'Создать' : 'Изменить'} ${action.config_type === 'tool' ? 'инструмент' : action.config_type === 'agent' ? 'агент' : action.config_type === 'prompt' ? 'промт' : 'workflow'}`}
                {action.name && <span className="font-medium ml-1">{action.name}</span>}
            </div>
        </div>
        <div className="px-1 my-1">
            <div className="bg-white dark:bg-gray-800 rounded-sm p-2 text-sm flex items-center gap-2">
                {loading && <Spinner size="sm" />}
                {!loading && <div className="text-gray-400">Отменено</div>}
            </div>
        </div>
    </div>;
}