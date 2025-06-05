'use client';
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem, DropdownMenu, DropdownSection, DropdownTrigger, Spinner, Tooltip } from "@heroui/react";
import { useRef, useState, createContext, useContext, useCallback, forwardRef, useImperativeHandle, useEffect, Ref } from "react";
import { CopilotChatContext } from "../../../lib/types/copilot_types";
import { CopilotMessage } from "../../../lib/types/copilot_types";
import { Workflow } from "@/app/lib/types/workflow_types";
import { DataSource } from "@/app/lib/types/datasource_types";
import { z } from "zod";
import { Action as WorkflowDispatch } from "../workflow/workflow_editor";
import { Panel } from "@/components/common/panel-common";
import { ComposeBoxCopilot } from "@/components/common/compose-box-copilot";
import { Messages } from "./components/messages";
import { CopyIcon, CheckIcon, PlusIcon, XIcon, InfoIcon } from "lucide-react";
import { useCopilot } from "./use-copilot";
import { getDataSource, listDataSources } from '@/app/actions/datasource_actions';

const CopilotContext = createContext<{
    workflow: z.infer<typeof Workflow> | null;
    dispatch: (action: any) => void;
}>({ workflow: null, dispatch: () => { } });

export function getAppliedChangeKey(messageIndex: number, actionIndex: number, field: string) {
    return `${messageIndex}-${actionIndex}-${field}`;
}

interface AppProps {
    projectId: string;
    workflow: z.infer<typeof Workflow>;
    dispatch: (action: any) => void;
    chatContext?: any;
    onCopyJson?: (data: { messages: any[] }) => void;
    onMessagesChange?: (messages: z.infer<typeof CopilotMessage>[]) => void;
    isInitialState?: boolean;
    dataSources?: z.infer<typeof DataSource>[];
}

const App = forwardRef<{ handleCopyChat: () => void; handleUserMessage: (message: string) => void }, AppProps>(function App({
    projectId,
    workflow,
    dispatch,
    chatContext = undefined,
    onCopyJson,
    onMessagesChange,
    isInitialState = false,
    dataSources,
}, ref) {
    const [messages, setMessages] = useState<z.infer<typeof CopilotMessage>[]>([]);
    const [isFileUploading, setIsFileUploading] = useState(false);
    const [discardContext, setDiscardContext] = useState(false);
    const [isLastInteracted, setIsLastInteracted] = useState(isInitialState);
    const workflowRef = useRef(workflow);
    const startRef = useRef<any>(null);
    const cancelRef = useRef<any>(null);
    const [pendingSource, setPendingSource] = useState<{ sourceId: string, name: string } | null>(null);
    const [dataSourcesState, setDataSourcesState] = useState<z.infer<typeof DataSource>[]>(dataSources || []);

    // Keep workflow ref up to date
    workflowRef.current = workflow;

    // Get the effective context based on user preference
    const effectiveContext = discardContext ? null : chatContext;

    console.log("dataSourcesState before useCopilot", dataSourcesState); // DEBUG

    const {
        streamingResponse,
        loading: loadingResponse,
        error: responseError,
        start,
        cancel
    } = useCopilot({
        projectId,
        workflow: workflowRef.current,
        context: effectiveContext,
        dataSources: dataSourcesState
    });

    // Store latest start/cancel functions in refs
    startRef.current = start;
    cancelRef.current = cancel;

    // Notify parent of message changes
    useEffect(() => {
        onMessagesChange?.(messages);
    }, [messages, onMessagesChange]);

    // Загрузка истории сообщений при инициализации
    useEffect(() => {
        const messagesKey = `copilot_messages_${projectId}`;
        const savedMessages = localStorage.getItem(messagesKey);
        if (savedMessages && messages.length === 0) {
            try {
                const parsedMessages = JSON.parse(savedMessages);
                setMessages(parsedMessages);
            } catch (error) {
                console.error('Ошибка при загрузке истории сообщений copilot:', error);
            }
        }
    }, [projectId, messages.length]);
    
    // Сохранение сообщений при их изменении
    useEffect(() => {
        const messagesKey = `copilot_messages_${projectId}`;
        if (messages.length > 0) {
            localStorage.setItem(messagesKey, JSON.stringify(messages));
        }
    }, [messages, projectId]);

    // Check for initial prompt in local storage and send it
    useEffect(() => {
        const prompt = localStorage.getItem(`project_prompt_${projectId}`);
        if (prompt && messages.length === 0) {
            localStorage.removeItem(`project_prompt_${projectId}`);
            setMessages([{
                role: 'user',
                content: prompt
            }]);
        }
    }, [projectId, messages.length]);

    // Reset discardContext when chatContext changes
    useEffect(() => {
        setDiscardContext(false);
    }, [chatContext]);

    function isValidUrl(str: string) {
        try {
            new URL(str);
            return true;
        } catch {
            return false;
        }
    }

    function extractUrls(text: string): string[] {
        // Простая регулярка для поиска ссылок
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.match(urlRegex) || [];
    }

    async function refreshDataSources() {
        const updated = await listDataSources(projectId);
        setDataSourcesState(updated);
    }

    function handleUserMessage(prompt: string) {
        const urls = extractUrls(prompt);
        if (urls.length > 0) {
            setPendingSource(null);
            (async () => {
                try {
                    const response = await fetch(`/api/v1/projects/${projectId}/copilot_upload_url`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ urls }),
                    });
                    if (!response.ok) {
                        setMessages(prev => prev.map(msg =>
                            msg.content === `Загрузка ссылок: ${urls.join(', ')}...`
                            ? { ...msg, content: `Ошибка при загрузке ссылок: ${urls.join(', ')}` }
                            : msg
                        ));
                        throw new Error('URL upload failed');
                    }
                    const result = await response.json();
                    if (result.dataSourceId) {
                        setPendingSource({ sourceId: result.dataSourceId, name: urls.join(', ') });
                        await refreshDataSources();
                    }
                } catch (error) {
                    setMessages(prev => prev.map(msg =>
                        msg.content === `Загрузка ссылок: ${urls.join(', ')}...`
                        ? { ...msg, content: `Ошибка при загрузке ссылок: ${urls.join(', ')}` }
                        : msg
                    ));
                }
            })();
            return;
        }
        setMessages(currentMessages => [...currentMessages, {
            role: 'user',
            content: prompt
        }]);
        setIsLastInteracted(true);
    }

    // Effect for getting copilot response
    useEffect(() => {
        if (!messages.length || messages.at(-1)?.role !== 'user') return;

        const currentStart = startRef.current;
        const currentCancel = cancelRef.current;

        currentStart(messages, (finalResponse: string) => {
            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: finalResponse
                }
            ]);
        });

        return () => currentCancel();
    }, [messages, dataSourcesState]); // <--- добавили dataSourcesState

    const handleCopyChat = useCallback(() => {
        if (onCopyJson) {
            onCopyJson({
                messages,
            });
        }
    }, [messages, onCopyJson]);

    // Handler for file upload from ComposeBoxCopilot
    async function handleFileUploadInCopilot(file: File) {
        if (!projectId) {
            console.error("Project ID is not available for file upload.");
            setMessages(prev => [...prev, {
                role: 'system',
                content: "Ошибка: Не удалось загрузить файл. ID проекта не найден."
            }]);
            return;
        }

        // Показываем карточку сразу
        setPendingSource(null); // сбрасываем предыдущий статус
        setIsFileUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const response = await fetch(`/api/v1/projects/${projectId}/copilot_upload_file`, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                setMessages(prev => prev.map(msg => 
                    msg.content === `Загрузка файла: ${file.name}...` 
                    ? { ...msg, content: `Ошибка при загрузке файла ${file.name}.` } 
                    : msg
                ));
                throw new Error('File upload failed');
            }
            const result = await response.json();
            // Показываем карточку статуса сразу после успешного ответа
            if (result.dataSourceId) {
                setPendingSource({ sourceId: result.dataSourceId, name: file.name });
                await refreshDataSources();
            }
        } catch (error) {
            console.error("File upload error:", error);
            setMessages(prev => prev.map(msg => 
                msg.content === `Загрузка файла: ${file.name}...` 
                ? { ...msg, content: `Ошибка при загрузке файла ${file.name}.` } 
                : msg
            ));
        } finally {
            setIsFileUploading(false);
        }
    }

    useImperativeHandle(ref, () => ({
        handleCopyChat,
        handleUserMessage
    }), [handleCopyChat]);

    return (
        <CopilotContext.Provider value={{ workflow: workflowRef.current, dispatch }}>
            <div className="h-full flex flex-col">
                {/* Карточка статуса источника — всегда сверху */}
                {pendingSource && (
                    <CopilotSourceStatus
                        projectId={projectId}
                        sourceId={pendingSource.sourceId}
                        fileOrUrlName={pendingSource.name}
                        onReady={() => {
                            // Обновить карточку (статус станет ready), затем скрыть через 2.5 сек
                            setTimeout(() => setPendingSource(null), 2500);
                        }}
                    />
                )}
                <div className="flex-1 overflow-auto">
                    <Messages
                        messages={messages}
                        streamingResponse={streamingResponse}
                        loadingResponse={loadingResponse}
                        workflow={workflowRef.current}
                        dispatch={dispatch}
                    />
                </div>
                <div className="shrink-0 px-1 pb-6">
                    {responseError && (
                        <div className="mb-4 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex gap-2 justify-between items-center text-sm">
                            <p className="text-red-600 dark:text-red-400">{responseError}</p>
                            <Button
                                size="sm"
                                color="danger"
                                onClick={() => {
                                    setMessages(prev => [...prev.slice(0, -1)]); // remove last assistant if needed
                                }}
                            >
                                Retry
                            </Button>
                        </div>
                    )}
                    {effectiveContext && <div className="flex items-start mb-2">
                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-sm px-2 py-1 rounded-sm shadow-sm">
                            <div>
                                {effectiveContext.type === 'chat' && "Chat"}
                                {effectiveContext.type === 'agent' && `Agent: ${effectiveContext.name}`}
                                {effectiveContext.type === 'tool' && `Tool: ${effectiveContext.name}`}
                                {effectiveContext.type === 'prompt' && `Prompt: ${effectiveContext.name}`}
                            </div>
                            <button
                                className="text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
                                onClick={() => setDiscardContext(true)}
                            >
                                <XIcon size={16} />
                            </button>
                        </div>
                    </div>}
                    <ComposeBoxCopilot
                        messages={messages}
                        loading={loadingResponse || isFileUploading}
                        handleUserMessage={handleUserMessage}
                        handleFileUpload={handleFileUploadInCopilot}
                        onCancel={cancel}
                        initialFocus={isInitialState}
                        shouldAutoFocus={isLastInteracted}
                        onFocus={() => setIsLastInteracted(true)}
                    />
                </div>
            </div>
        </CopilotContext.Provider>
    );
});

App.displayName = 'App';

export const Copilot = forwardRef<{ handleUserMessage: (message: string) => void }, {
    projectId: string;
    workflow: z.infer<typeof Workflow>;
    chatContext?: z.infer<typeof CopilotChatContext>;
    dispatch: (action: WorkflowDispatch) => void;
    isInitialState?: boolean;
    dataSources?: z.infer<typeof DataSource>[];
}>(({
    projectId,
    workflow,
    chatContext = undefined,
    dispatch,
    isInitialState = false,
    dataSources,
}, ref) => {
    const [copilotKey, setCopilotKey] = useState(0);
    const [showCopySuccess, setShowCopySuccess] = useState(false);
    const [messages, setMessages] = useState<z.infer<typeof CopilotMessage>[]>([]);
    const appRef = useRef<{ handleCopyChat: () => void; handleUserMessage: (message: string) => void }>(null);

    function handleNewChat() {
        setCopilotKey(prev => prev + 1);
        setMessages([]);
        
        // Очистка сохраненной истории сообщений
        const messagesKey = `copilot_messages_${projectId}`;
        localStorage.removeItem(messagesKey);
    }

    function handleCopyJson(data: { messages: any[] }) {
        const jsonString = JSON.stringify(data, null, 2);
        navigator.clipboard.writeText(jsonString);
        setShowCopySuccess(true);
        setTimeout(() => {
            setShowCopySuccess(false);
        }, 2000);
    }

    // Expose handleUserMessage through ref
    useImperativeHandle(ref, () => ({
        handleUserMessage: (message: string) => {
            const app = appRef.current as any;
            if (app?.handleUserMessage) {
                app.handleUserMessage(message);
            }
        }
    }), []);

    return (
        <Panel variant="copilot"
            tourTarget="copilot"
            showWelcome={messages.length === 0}
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            ПОМОЩНИК
                        </div>
                        <Tooltip content="Ставьте задачи помощнику, чтобы получить нужный результат">
                            <InfoIcon className="w-4 h-4 text-gray-400 cursor-help" />
                        </Tooltip>
                    </div>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={handleNewChat}
                        className="bg-blue-50 text-blue-700 hover:bg-blue-100"
                        showHoverContent={true}
                        hoverContent="Новый чат"
                    >
                        <PlusIcon className="w-4 h-4" />
                    </Button>
                </div>
            }
            rightActions={
                <div className="flex items-center gap-3">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => appRef.current?.handleCopyChat()}
                        showHoverContent={true}
                        hoverContent={showCopySuccess ? "Скопировано" : "Скопировать JSON"}
                    >
                        {showCopySuccess ? (
                            <CheckIcon className="w-4 h-4" />
                        ) : (
                            <CopyIcon className="w-4 h-4" />
                        )}
                    </Button>
                </div>
            }
        >
            <div className="h-full overflow-auto px-3 pt-4">
                <App
                    key={copilotKey}
                    ref={appRef}
                    projectId={projectId}
                    workflow={workflow}
                    dispatch={dispatch}
                    chatContext={chatContext}
                    onCopyJson={handleCopyJson}
                    onMessagesChange={setMessages}
                    isInitialState={isInitialState}
                    dataSources={dataSources}
                />
            </div>
        </Panel>
    );
});

Copilot.displayName = 'Copilot';

function CopilotSourceStatus({ projectId, sourceId, fileOrUrlName, onReady }: { projectId: string, sourceId: string, fileOrUrlName: string, onReady?: () => void }) {
    const [status, setStatus] = useState<'pending' | 'ready' | 'error' | 'deleted'>('pending');
    const [error, setError] = useState<string | null>(null);
    const [show, setShow] = useState(true);
    useEffect(() => {
        let ignore = false;
        let timeoutId: NodeJS.Timeout | null = null;
        async function check() {
            if (ignore) return;
            try {
                const source = await getDataSource(projectId, sourceId);
                setStatus((source.status as ('pending' | 'ready' | 'error' | 'deleted')) || 'pending');
                if (source.status === 'error') setError(source.error || '');
                if (source.status === 'ready' && onReady) onReady();
                if (source.status === 'pending') timeoutId = setTimeout(check, 5000);
            } catch (e) {
                setError('Ошибка при получении статуса источника');
            }
        }
        check();
        return () => {
            ignore = true;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [projectId, sourceId, onReady]);
    if (!show) return null;
    let cardColor = '';
    let icon = null;
    let title = '';
    let subtitle = '';
    if (status === 'pending') {
        cardColor = 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700';
        icon = <svg className="w-8 h-8 text-blue-400 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><circle cx="12" cy="16" r="1" /></svg>;
        title = 'Идёт индексация источника';
        subtitle = `${fileOrUrlName} — источник обрабатывается, это может занять несколько минут.`;
    } else if (status === 'ready') {
        cardColor = 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700';
        icon = <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M9 12l2 2l4-4" /></svg>;
        title = 'Источник готов к использованию!';
        subtitle = `${fileOrUrlName} успешно проиндексирован.`;
    } else if (status === 'error') {
        cardColor = 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700';
        icon = <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><circle cx="12" cy="16" r="1" /></svg>;
        title = 'Ошибка при индексации источника';
        subtitle = `${fileOrUrlName}. ${error}`;
    }
    return (
        <div className={`w-full flex justify-center fade-in`} style={{animation: 'fadeIn 0.5s'}}>
            <div className={`relative max-w-md w-full rounded-xl border p-5 shadow-lg flex items-center gap-4 ${cardColor}`}>
                <div className="flex-shrink-0">{icon}</div>
                <div className="flex flex-col gap-1">
                    <div className="font-semibold text-base">{title}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300">{subtitle}</div>
                </div>
                {(status === 'ready' || status === 'error') && (
                    <button
                        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                        onClick={() => setShow(false)}
                        aria-label="Закрыть"
                    >
                        <XIcon size={18} />
                    </button>
                )}
            </div>
            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}

