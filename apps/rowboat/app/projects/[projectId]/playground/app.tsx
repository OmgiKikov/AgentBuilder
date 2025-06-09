'use client';
import { useState, useCallback, useRef, useEffect } from "react";
import { z } from "zod";
import { MCPServer, PlaygroundChat } from "@/app/lib/types/types";
import { Workflow, WorkflowTool } from "@/app/lib/types/workflow_types";
import { Chat } from "./components/chat";
import { Panel } from "@/components/common/panel-common";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@heroui/react";
import { apiV1 } from "rowboat-shared";
import { TestProfile } from "@/app/lib/types/testing_types";
import { WithStringId } from "@/app/lib/types/types";
import { ProfileSelector } from "@/app/projects/[projectId]/test/[[...slug]]/components/selectors/profile-selector";
import { CheckIcon, CopyIcon, PlusIcon, UserIcon, InfoIcon, BugIcon, BugOffIcon } from "lucide-react";
import { USE_TESTING_FEATURE } from "@/app/lib/feature_flags";
import { clsx } from "clsx";

const defaultSystemMessage = '';

function loadChat(projectId: string) {
    const savedChat = localStorage.getItem(`playground_chat_${projectId}`);
    if (savedChat) {
        try {
            return JSON.parse(savedChat);
        } catch (error) {
            console.error('Ошибка при загрузке истории сообщений:', error);
        }
    }
}

export function App({
    hidden = false,
    projectId,
    workflow,
    messageSubscriber,
    mcpServerUrls,
    toolWebhookUrl,
    isInitialState = false,
    onPanelClick,
    projectTools,
}: {
    hidden?: boolean;
    projectId: string;
    workflow: z.infer<typeof Workflow>;
    messageSubscriber?: (messages: z.infer<typeof apiV1.ChatMessage>[]) => void;
    mcpServerUrls: Array<z.infer<typeof MCPServer>>;
    toolWebhookUrl: string;
    isInitialState?: boolean;
    onPanelClick?: () => void;
    projectTools: z.infer<typeof WorkflowTool>[];
}) {
    const [counter, setCounter] = useState<number>(0);
    const [testProfile, setTestProfile] = useState<WithStringId<z.infer<typeof TestProfile>> | null>(null);
    const [systemMessage, setSystemMessage] = useState<string>(loadChat(projectId)?.systemMessage || defaultSystemMessage);
    const [showDebugMessages, setShowDebugMessages] = useState<boolean>(true);
    const [chat, setChat] = useState<z.infer<typeof PlaygroundChat>>(loadChat(projectId) || {
        projectId,
        createdAt: new Date().toISOString(),
        messages: [],
        simulated: false,
        systemMessage: defaultSystemMessage,
    });
    const [isProfileSelectorOpen, setIsProfileSelectorOpen] = useState(false);
    const [showCopySuccess, setShowCopySuccess] = useState(false);
    const getCopyContentRef = useRef<(() => string) | null>(null);

    // Загрузка сохраненных сообщений при инициализации
    useEffect(() => {
        const loadedChat = loadChat(projectId);
        if (loadedChat) {
            setChat(loadedChat)
            if (loadedChat.systemMessage) {
                setSystemMessage(loadedChat.systemMessage)
            }
        }
    }, [projectId, counter]);

    // Сохранение сообщений при их изменении
    useEffect(() => {
        if (chat.messages.length > 0) {
            localStorage.setItem(`playground_chat_${projectId}`, JSON.stringify({
                ...chat,
                systemMessage
            }));
        }
    }, [chat.messages, projectId, systemMessage, counter]);

    const onUpdateChatMessages = useCallback((messages: z.infer<typeof apiV1.ChatMessage>[]) => {
        setChat(prevChat => ({
            ...prevChat,
            messages: messages
        }));
        if (messageSubscriber) {
            messageSubscriber(messages)
        }
    }, [messageSubscriber])

    function handleSystemMessageChange(message: string) {
        setSystemMessage(message);
        setCounter(counter + 1);
    }

    function handleTestProfileChange(profile: WithStringId<z.infer<typeof TestProfile>> | null) {
        setTestProfile(profile);
        setCounter(counter + 1);
    }

    function handleNewChatButtonClick() {
        setCounter(counter + 1);
        setChat({
            projectId,
            createdAt: new Date().toISOString(),
            messages: [],
            simulated: false,
            systemMessage: defaultSystemMessage,
        });
        setSystemMessage(defaultSystemMessage);

        // Очистка сохраненной истории сообщений
        localStorage.removeItem(`playground_chat_${projectId}`);
    }

    const handleCopyJson = useCallback(() => {
        if (getCopyContentRef.current) {
            try {
                const data = getCopyContentRef.current();
                navigator.clipboard.writeText(data);
                setShowCopySuccess(true);
                setTimeout(() => {
                    setShowCopySuccess(false);
                }, 2000);
            } catch (error) {
                console.error('Error copying:', error);
            }
        }
    }, []);

    if (hidden) {
        return <></>;
    }

    return (
        <>
            <Panel
                variant="playground"
                tourTarget="playground"
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                ПЕСОЧНИЦА 
                            </div>
                            <Tooltip content="Тестируйте ваших агентов прямо сейчас">
                                <InfoIcon className="w-4 h-4 text-gray-400 cursor-help" />
                            </Tooltip>
                        </div>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleNewChatButtonClick}
                            className="bg-blue-50 text-blue-700 hover:bg-blue-100"
                            showHoverContent={true}
                            hoverContent="Новый чат"
                        >
                            <PlusIcon className="w-4 h-4" />
                        </Button>
                        {/* <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setShowDebugMessages(!showDebugMessages)}
                            className={showDebugMessages ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}
                            showHoverContent={true}
                            // hoverContent={showDebugMessages ? "Скрыть отладочные сообщения" : "Показать отладочные сообщения"}
                        >
                            {showDebugMessages ? (
                                <BugIcon className="w-4 h-4" />
                            ) : (
                                <BugOffIcon className="w-4 h-4" />
                            )}
                        </Button> */}
                    </div>
                }
                rightActions={
                    <div className="flex items-center gap-3">
                        {USE_TESTING_FEATURE && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setIsProfileSelectorOpen(true)}
                                showHoverContent={true}
                                hoverContent={testProfile?.name || 'Выберите профиль тестирования'}
                            >
                                <UserIcon className="w-4 h-4" />
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleCopyJson}
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
                onClick={onPanelClick}
            >
                <ProfileSelector
                    projectId={projectId}
                    isOpen={isProfileSelectorOpen}
                    onOpenChange={setIsProfileSelectorOpen}
                    onSelect={handleTestProfileChange}
                    selectedProfileId={testProfile?._id}
                />
                <div className="h-full overflow-auto px-4 py-4">
                    <Chat
                        key={`chat-${counter}`}
                        chat={chat}
                        projectId={projectId}
                        workflow={workflow}
                        testProfile={testProfile}
                        messageSubscriber={onUpdateChatMessages}
                        onTestProfileChange={handleTestProfileChange}
                        systemMessage={systemMessage}
                        onSystemMessageChange={handleSystemMessageChange}
                        mcpServerUrls={mcpServerUrls}
                        toolWebhookUrl={toolWebhookUrl}
                        onCopyClick={(fn) => { getCopyContentRef.current = fn; }}
                        showDebugMessages={showDebugMessages}
                        projectTools={projectTools}
                    />
                </div>
            </Panel>
        </>
    );
}
