'use client';

import { Metadata } from "next";
import { Spinner, Textarea, Button, Dropdown, DropdownMenu, DropdownItem, DropdownTrigger, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, useDisclosure, Divider } from "@heroui/react";
import { ReactNode, useEffect, useState } from "react";
import { getProjectConfig, updateProjectName, updateWebhookUrl, createApiKey, deleteApiKey, listApiKeys, deleteProject, rotateSecret } from "../../../actions/project_actions";
import { CopyButton } from "../../../../components/common/copy-button";
import { EditableField } from "../../../lib/components/editable-field";
import { EyeIcon, EyeOffIcon, Settings, Plus, MoreVertical } from "lucide-react";
import { WithStringId } from "../../../lib/types/types";
import { ApiKey } from "../../../lib/types/project_types";
import { z } from "zod";
import { RelativeTime } from "@primer/react";
import { Label } from "../../../lib/components/label";
import { FormSection } from "../../../lib/components/form-section";
import { Panel } from "@/components/common/panel-common";
import { ProjectSection } from './components/project';

export const metadata: Metadata = {
    title: "Project config",
};

export function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return <div className="w-full flex flex-col gap-4 border border-border p-4 rounded-md">
        <h2 className="font-semibold pb-2 border-b border-border">{title}</h2>
        {children}
    </div>;
}

export function SectionRow({
    children,
}: {
    children: ReactNode;
}) {
    return <div className="flex flex-col gap-2">{children}</div>;
}

export function LeftLabel({
    label,
}: {
    label: string;
}) {
    return <Label label={label} />;
}

export function RightContent({
    children,
}: {
    children: React.ReactNode;
}) {
    return <div>{children}</div>;
}

export function BasicSettingsSection({
    projectId,
}: {
    projectId: string;
}) {
    const [loading, setLoading] = useState(false);
    const [projectName, setProjectName] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        getProjectConfig(projectId).then((project) => {
            setProjectName(project?.name);
            setLoading(false);
        });
    }, [projectId]);

    async function updateName(name: string) {
        setLoading(true);
        await updateProjectName(projectId, name);
        setProjectName(name);
        setLoading(false);
    }

    return <Section title="Basic settings">
        <FormSection label="Project name">
            {loading && <Spinner size="sm" />}
            {!loading && <EditableField
                value={projectName || ''}
                onChange={updateName}
                className="w-full"
            />}
        </FormSection>

        <Divider />

        <FormSection label="Project ID">
            <div className="flex flex-row gap-2 items-center">
                <div className="text-gray-600 text-sm font-mono">{projectId}</div>
                <CopyButton
                    onCopy={() => {
                        navigator.clipboard.writeText(projectId);
                    }}
                    label="Copy"
                    successLabel="Copied"
                />
            </div>
        </FormSection>
    </Section>;
}


export function ApiKeysSection({
    projectId,
}: {
    projectId: string;
}) {
    const [keys, setKeys] = useState<WithStringId<z.infer<typeof ApiKey>>[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{
        type: 'success' | 'error' | 'info';
        text: string;
    } | null>(null);

    useEffect(() => {
        const loadKeys = async () => {
            const keys = await listApiKeys(projectId);
            setKeys(keys);
            setLoading(false);
        };
        loadKeys();
    }, [projectId]);

    const handleCreateKey = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const key = await createApiKey(projectId);
            setLoading(false);
            setMessage({
                type: 'success',
                text: 'API ключ успешно создан',
            });
            setKeys([...keys, key]);

            setTimeout(() => {
                setMessage(null);
            }, 2000);
        } catch (error) {
            setLoading(false);
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : "Не удалось создать API ключ",
            });
        }
    };

    const handleDeleteKey = async (id: string) => {
        if (!window.confirm("Вы уверены, что хотите удалить этот API ключ? Это действие не может быть отменено.")) {
            return;
        }

        try {
            setLoading(true);
            setMessage(null);
            await deleteApiKey(projectId, id);
            setKeys(keys.filter((k) => k._id !== id));
            setLoading(false);
            setMessage({
                type: 'info',
                text: 'API ключ успешно удален',
            });
            setTimeout(() => {
                setMessage(null);
            }, 2000);
        } catch (error) {
            setLoading(false);
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : "Не удалось удалить API ключ",
            });
        }
    };

    return <Section title="API keys">
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                    API ключи используются для аутентификации запросов к API ProTo.
                </p>
                <Button
                    onPress={handleCreateKey}
                    size="sm"
                    startContent={<Plus className="h-4 w-4" />}
                    variant="flat"
                    isDisabled={loading}
                >
                    Создать API ключ
                </Button>
            </div>

            <Divider />
            {loading && <Spinner size="sm" />}
            {!loading && <div className="border border-border rounded-lg text-sm">
                <div className="flex items-center border-b border-border p-4">
                    <div className="flex-[3] font-normal">API ключ</div>
                    <div className="flex-1 font-normal">Создан</div>
                    <div className="flex-1 font-normal">Последнее использование</div>
                    <div className="w-10"></div>
                </div>
                {message?.type === 'success' && <div className="flex flex-col p-2">
                    <div className="text-sm bg-green-50 text-green-500 p-2 rounded-md">{message.text}</div>
                </div>}
                {message?.type === 'error' && <div className="flex flex-col p-2">
                    <div className="text-sm bg-red-50 text-red-500 p-2 rounded-md">{message.text}</div>
                </div>}
                {message?.type === 'info' && <div className="flex flex-col p-2">
                    <div className="text-sm bg-yellow-50 text-yellow-500 p-2 rounded-md">{message.text}</div>
                </div>}
                <div className="flex flex-col">
                    {keys.map((key) => (
                        <div key={key._id} className="flex items-start border-b border-border last:border-b-0 p-4">
                            <div className="flex-[3] p-2">
                                <ApiKeyDisplay apiKey={key.key} />
                            </div>
                            <div className="flex-1 p-2">
                                <RelativeTime date={new Date(key.createdAt)} />
                            </div>
                            <div className="flex-1 p-2">
                                {key.lastUsedAt ? <RelativeTime date={new Date(key.lastUsedAt)} /> : 'Never'}
                            </div>
                            <div className="w-10 p-2">
                                <Dropdown>
                                    <DropdownTrigger>
                                        <button className="text-muted-foreground hover:text-foreground">
                                            <MoreVertical className="h-4 w-4" />
                                        </button>
                                    </DropdownTrigger>
                                    <DropdownMenu>
                                        <DropdownItem
                                            key='delete'
                                            className="text-destructive"
                                            onPress={() => handleDeleteKey(key._id)}
                                        >
                                            Удалить
                                        </DropdownItem>
                                    </DropdownMenu>
                                </Dropdown>
                            </div>
                        </div>
                    ))}
                    {keys.length === 0 && (
                        <div className="p-4 text-center text-muted-foreground">
                            Нет созданных API ключей
                        </div>
                    )}
                </div>
            </div>}
        </div>
    </Section>;
}

export function SecretSection({
    projectId,
}: {
    projectId: string;
}) {
    const [loading, setLoading] = useState(false);
    const [hidden, setHidden] = useState(true);
    const [secret, setSecret] = useState<string | null>(null);

    const formattedSecret = hidden ? `${secret?.slice(0, 2)}${'•'.repeat(5)}${secret?.slice(-2)}` : secret;

    useEffect(() => {
        setLoading(true);
        getProjectConfig(projectId).then((project) => {
            setSecret(project.secret);
            setLoading(false);
        });
    }, [projectId]);

    const handleRotateSecret = async () => {
        if (!confirm("Вы уверены, что хотите обновить secret key? Все существующие подписи станут недействительными.")) {
            return;
        }
        setLoading(true);
        try {
            const newSecret = await rotateSecret(projectId);
            setSecret(newSecret);
        } catch (error) {
            console.error('Failed to rotate secret:', error);
        } finally {
            setLoading(false);
        }
    };

    return <Section title="Secret">
        <p className="text-sm">
            Secret ключ проекта используется для подписи запросов инструментов, отправляемых в ваш webhook
        </p>
        <Divider />
        <SectionRow>
            <LeftLabel label="Secret ключ проекта" />
            <RightContent>
                <div className="flex flex-row gap-2 items-center">
                    {loading && <Spinner size="sm" />}
                    {!loading && secret && <div className="flex flex-row gap-2 items-center">
                        <div className="text-gray-600 text-sm font-mono break-all">
                            {formattedSecret}
                        </div>
                        <button
                            onClick={() => setHidden(!hidden)}
                            className="text-gray-300 hover:text-gray-700 flex items-center gap-1 group"
                        >
                            {hidden ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
                        </button>
                        <CopyButton
                            onCopy={() => {
                                navigator.clipboard.writeText(secret);
                            }}
                            label="Копировать"
                            successLabel="Скопировано"
                        />
                        <Button
                            size="sm"
                            variant="flat"
                            color="warning"
                            onPress={handleRotateSecret}
                            isDisabled={loading}
                        >
                            Обновить
                        </Button>
                    </div>}
                </div>
            </RightContent>
        </SectionRow>
    </Section>;
}

export function WebhookUrlSection({
    projectId,
}: {
    projectId: string;
}) {
    const [loading, setLoading] = useState(false);
    const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        getProjectConfig(projectId).then((project) => {
            setWebhookUrl(project.webhookUrl || null);
            setLoading(false);
        });
    }, [projectId]);

    async function update(url: string) {
        setLoading(true);
        await updateWebhookUrl(projectId, url);
        setWebhookUrl(url);
        setLoading(false);
    }

    function validate(url: string) {
        try {
            new URL(url);
            return { valid: true };
        } catch {
            return { valid: false, errorMessage: 'Пожалуйста, введите корректный URL' };
        }
    }

    return <Section title="Webhook URL">
        <p className="text-sm">
            В редакторе рабочих процессов, вызовы инструментов будут отправляться на этот URL, если они не мокаются.
        </p>
        <Divider />
        <FormSection label="Webhook URL">
            {loading && <Spinner size="sm" />}
            {!loading && <EditableField
                value={webhookUrl || ''}
                onChange={update}
                validate={validate}
                className="w-full"
            />}
        </FormSection>
    </Section>;
}

export function ChatWidgetSection({
    projectId,
    chatWidgetHost,
}: {
    projectId: string;
    chatWidgetHost: string;
}) {
    const [loading, setLoading] = useState(false);
    const [chatClientId, setChatClientId] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        getProjectConfig(projectId).then((project) => {
            setChatClientId(project.chatClientId);
            setLoading(false);
        });
    }, [projectId]);

    const code = `<!-- RowBoat Chat Widget -->
<script>
    window.ProTo_CONFIG = {
        clientId: '${chatClientId}'
    };
    (function(d) {
        var s = d.createElement('script');
        s.src = '${chatWidgetHost}/api/bootstrap.js';
        s.async = true;
        d.getElementsByTagName('head')[0].appendChild(s);
    })(document);
</script>`;

    return <Section title="Chat widget">
        <p className="text-sm">
            Чтобы использовать чат виджет, скопируйте и вставьте этот код сниппет прямо перед закрывающим тегом &lt;/body&gt; вашего сайта:
        </p>
        {loading && <Spinner size="sm" />}
        {!loading && <Textarea
            variant="bordered"
            size="sm"
            defaultValue={code}
            className="max-w-full cursor-pointer font-mono"
            readOnly
            endContent={<CopyButton
                onCopy={() => {
                    navigator.clipboard.writeText(code);
                }}
                label="Копировать"
                successLabel="Скопировано"
            />}
        />}
    </Section>;
}

export function DeleteProjectSection({
    projectId,
}: {
    projectId: string;
}) {
    const [loading, setLoading] = useState(false);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [projectName, setProjectName] = useState("");
    const [projectNameInput, setProjectNameInput] = useState("");
    const [confirmationInput, setConfirmationInput] = useState("");
    
    const isValid = projectNameInput === projectName && confirmationInput === "delete project";

    useEffect(() => {
        setLoading(true);
        getProjectConfig(projectId).then((project) => {
            setProjectName(project.name);
            setLoading(false);
        });
    }, [projectId]);

    const handleDelete = async () => {
        if (!isValid) return;
        setLoading(true);
        await deleteProject(projectId);
        setLoading(false);
    };

    return (
        <Section title="Delete project">
            {loading && <Spinner size="sm" />}
            {!loading && <div className="flex flex-col gap-4">
                <p className="text-sm">
                    Удаление проекта приведет к постоянному удалению всех связанных данных, включая рабочие процессы, источники и API ключи.
                    Это действие не может быть отменено.
                </p>
                <div>
                    <Button 
                        color="danger" 
                        size="sm"
                        onPress={onOpen}
                        isDisabled={loading}
                        isLoading={loading}
                    >
                        Удалить проект
                    </Button>
                </div>

                <Modal isOpen={isOpen} onClose={onClose}>
                    <ModalContent>
                        <ModalHeader>Удалить проект</ModalHeader>
                        <ModalBody>
                            <div className="flex flex-col gap-4">
                                <p>
                                    Это действие не может быть отменено. Пожалуйста, введите следующее для подтверждения:
                                </p>
                                <Input
                                    label="Project name"
                                    placeholder={projectName}
                                    value={projectNameInput}
                                    onChange={(e) => setProjectNameInput(e.target.value)}
                                />
                                <Input
                                    label='Введите "delete project" для подтверждения'
                                    placeholder="delete project"
                                    value={confirmationInput}
                                    onChange={(e) => setConfirmationInput(e.target.value)}
                                />
                            </div>
                        </ModalBody>
                        <ModalFooter>
                            <Button variant="light" onPress={onClose}>
                                Отмена
                            </Button>
                            <Button 
                                color="danger" 
                                onPress={handleDelete}
                                isDisabled={!isValid}
                            >
                                Удалить проект
                            </Button>
                        </ModalFooter>
                    </ModalContent>
                </Modal>
            </div>}
        </Section>
    );
}

function ApiKeyDisplay({ apiKey }: { apiKey: string }) {
    const [isVisible, setIsVisible] = useState(false);

    const formattedKey = isVisible ? apiKey : `${apiKey.slice(0, 2)}${'•'.repeat(5)}${apiKey.slice(-2)}`;

    return (
        <div className="flex flex-col gap-1">
            <div className="text-sm font-mono break-all">{formattedKey}</div>
            <div className="flex flex-row gap-2 items-center">
                <button
                    onClick={() => setIsVisible(!isVisible)}
                    className="text-gray-300 hover:text-gray-700"
                >
                    {isVisible ? (
                        <EyeOffIcon className="w-4 h-4" />
                    ) : (
                        <EyeIcon className="w-4 h-4" />
                    )}
                </button>
                <CopyButton
                    onCopy={() => {
                        navigator.clipboard.writeText(apiKey);
                    }}
                    label="Copy"
                    successLabel="Copied"
                />
            </div>
        </div>
    );
}

export function ConfigApp({
    projectId,
    useChatWidget,
    chatWidgetHost,
}: {
    projectId: string;
    useChatWidget: boolean;
    chatWidgetHost: string;
}) {
    return (
        <div className="h-full overflow-auto p-6">
            <Panel
                variant="projects"
                title={
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        <span>Project Settings</span>
                    </div>
                }
            >
                <div className="space-y-6">
                    <ProjectSection 
                        projectId={projectId} 
                        useChatWidget={useChatWidget} 
                        chatWidgetHost={chatWidgetHost} 
                    />
                </div>
            </Panel>
        </div>
    );
}

// Add default export
export default ConfigApp;