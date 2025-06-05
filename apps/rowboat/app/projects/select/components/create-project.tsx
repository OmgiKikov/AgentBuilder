'use client';

import { useEffect, useState, useRef } from "react";
import { createProject, createProjectFromPrompt } from "@/app/actions/project_actions";
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { starting_copilot_prompts } from "@/app/lib/project_templates";
import { SectionHeading } from "@/components/ui/section-heading";
import { Textarea } from "@/components/ui/textarea";
import { Submit } from "./submit-button";
import { Button } from "@/components/ui/button";
import { FolderOpenIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { USE_MULTIPLE_PROJECTS } from "@/app/lib/feature_flags";
import { HorizontalDivider } from "@/components/ui/horizontal-divider";
import { Tooltip } from "@heroui/react";

// Add glow animation styles
const glowStyles = `
    @keyframes glow {
        0% {
            border-color: rgba(99, 102, 241, 0.3);
            box-shadow: 0 0 8px 1px rgba(99, 102, 241, 0.2);
        }
        50% {
            border-color: rgba(99, 102, 241, 0.6);
            box-shadow: 0 0 12px 2px rgba(99, 102, 241, 0.4);
        }
        100% {
            border-color: rgba(99, 102, 241, 0.3);
            box-shadow: 0 0 8px 1px rgba(99, 102, 241, 0.2);
        }
    }

    @keyframes glow-dark {
        0% {
            border-color: rgba(129, 140, 248, 0.3);
            box-shadow: 0 0 8px 1px rgba(129, 140, 248, 0.2);
        }
        50% {
            border-color: rgba(129, 140, 248, 0.6);
            box-shadow: 0 0 12px 2px rgba(129, 140, 248, 0.4);
        }
        100% {
            border-color: rgba(129, 140, 248, 0.3);
            box-shadow: 0 0 8px 1px rgba(129, 140, 248, 0.2);
        }
    }

    .animate-glow {
        animation: glow 2s ease-in-out infinite;
        border-width: 2px;
    }

    .dark .animate-glow {
        animation: glow-dark 2s ease-in-out infinite;
        border-width: 2px;
    }
`;

const TabType = {
    Describe: 'describe',
    Blank: 'blank',
    Example: 'example'
} as const;

type TabState = typeof TabType[keyof typeof TabType];

const isNotBlankTemplate = (tab: TabState): boolean => tab !== 'blank';

const tabStyles = clsx(
    "px-4 py-2 text-sm font-medium",
    "rounded-lg",
    "focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20",
    "transition-colors duration-150"
);

const activeTabStyles = clsx(
    "bg-white dark:bg-gray-800",
    "text-gray-900 dark:text-gray-100",
    "shadow-sm",
    "border border-gray-200 dark:border-gray-700"
);

const inactiveTabStyles = clsx(
    "text-gray-600 dark:text-gray-400",
    "hover:bg-gray-50 dark:hover:bg-gray-750"
);

const largeSectionHeaderStyles = clsx(
    "text-lg font-medium",
    "text-gray-900 dark:text-gray-100"
);

const textareaStyles = clsx(
    "w-full",
    "rounded-lg p-3",
    "border border-gray-200 dark:border-gray-700",
    "bg-white dark:bg-gray-800",
    "hover:bg-gray-50 dark:hover:bg-gray-750",
    "focus:shadow-inner focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20",
    "placeholder:text-gray-400 dark:placeholder:text-gray-500",
    "transition-all duration-200"
);

const emptyTextareaStyles = clsx(
    "animate-glow",
    "border-indigo-500/40 dark:border-indigo-400/40",
    "shadow-[0_0_8px_1px_rgba(99,102,241,0.2)] dark:shadow-[0_0_8px_1px_rgba(129,140,248,0.2)]"
);

const tabButtonStyles = clsx(
    "border border-gray-200 dark:border-gray-700"
);

const selectedTabStyles = clsx(
    tabButtonStyles,
    "text-gray-900 dark:text-gray-100",
    "text-base"
);

const unselectedTabStyles = clsx(
    tabButtonStyles,
    "text-gray-900 dark:text-gray-100",
    "text-sm"
);

interface CreateProjectProps {
    defaultName: string;
    onOpenProjectPane: () => void;
    isProjectPaneOpen: boolean;
}

export function CreateProject({ defaultName, onOpenProjectPane, isProjectPaneOpen }: CreateProjectProps) {
    const [selectedTab, setSelectedTab] = useState<TabState>(TabType.Describe);
    const [customPrompt, setCustomPrompt] = useState("");
    const [name, setName] = useState(defaultName);
    const [promptError, setPromptError] = useState<string | null>(null);
    const router = useRouter();

    // Add this effect to update name when defaultName changes
    useEffect(() => {
        setName(defaultName);
    }, [defaultName]);

    // Inject glow animation styles
    useEffect(() => {
        const styleSheet = document.createElement("style");
        styleSheet.innerText = glowStyles;
        document.head.appendChild(styleSheet);

        return () => {
            document.head.removeChild(styleSheet);
        };
    }, []);

    const handleTabChange = (tab: TabState) => {
        setSelectedTab(tab);

        if (tab === TabType.Blank) {
            setCustomPrompt('');
        } else if (tab === TabType.Describe) {
            setCustomPrompt('');
        }
    };

    const handleBlankTemplateClick = (e: React.MouseEvent) => {
        e.preventDefault();
        handleTabChange(TabType.Blank);
    };

    async function handleSubmit(formData: FormData) {
        try {
            // Если выбрана вкладка Describe и поле пустое, создаём проект с шаблоном 'default'
            if (selectedTab === TabType.Describe && !customPrompt.trim()) {
                const newFormData = new FormData();
                newFormData.append('name', name);
                newFormData.append('template', 'default');
                const response: any = await createProject(newFormData);
                if (!response?.id) throw new Error('Project creation failed');
                router.push(`/projects/${response.id}/workflow`);
                return;
            }

            let response: any;
            if (selectedTab === TabType.Blank) {
                const newFormData = new FormData();
                newFormData.append('name', name);
                newFormData.append('template', 'default');
                response = await createProject(newFormData);
            } else {
                const newFormData = new FormData();
                newFormData.append('name', name);
                newFormData.append('prompt', customPrompt);
                response = await createProjectFromPrompt(newFormData);
                if (response?.id && customPrompt) {
                    localStorage.setItem(`project_prompt_${response.id}`, customPrompt);
                }
            }

            if (!response?.id) {
                throw new Error('Project creation failed');
            }

            router.push(`/projects/${response.id}/workflow`);
        } catch (error) {
            console.error('Error creating project:', error);
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && 
            selectedTab !== TabType.Blank && 
            (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
            const formData = new FormData();
            formData.append('name', name);
            handleSubmit(formData);
        }
    };

    return (
        <div className={clsx(
            "overflow-auto",
            !USE_MULTIPLE_PROJECTS && "max-w-none px-12 py-12",
            USE_MULTIPLE_PROJECTS && !isProjectPaneOpen && "col-span-full"
        )}>
            <section className={clsx(
                "card h-full",
                !USE_MULTIPLE_PROJECTS && "px-24",
                USE_MULTIPLE_PROJECTS && "px-8"
            )}>
                {USE_MULTIPLE_PROJECTS && (
                    <>
                        <div className="px-4 pt-4 pb-6 flex justify-between items-center">
                            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                                SberAI Lab
                            </h1>
                            {/* Маленький текст под заголовком */}
                            {!isProjectPaneOpen && (
                                <Button
                                    onClick={onOpenProjectPane}
                                    variant="primary"
                                    size="md"
                                    startContent={<FolderOpenIcon className="w-4 h-4" />}
                                >
                                    Посмотреть существующие проекты
                                </Button>
                            )}
                        </div>
                        <HorizontalDivider />
                    </>
                )}
                
                <form
                    id="create-project-form"
                    action={handleSubmit}
                    onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        handleSubmit(formData);
                    }}
                    onKeyDown={handleKeyDown}
                    className="pt-6 pb-16 space-y-12"
                >

                    {/* Custom Prompt Section - Only show when needed */}
                    {(selectedTab === TabType.Describe || selectedTab === TabType.Example) && (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-4">
                                <label className={largeSectionHeaderStyles}>
                                    {selectedTab === TabType.Describe ? '✏️ Какую задачу вы хотите решить?' : ''}
                                </label>
                                <div className="flex items-center gap-2"> 
                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                    Опишите задачу — и помощник соберет прототип. 
                                    </p>
                                    {/* <Tooltip content={<div>Если вы уже знаете, какие конкретные агенты и инструменты вам нужны, упомяните их ниже.<br /><br />Укажите &apos;внутренние агенты&apos; для агентов задач, которые не будут взаимодействовать с пользователем, и &apos;пользовательские агенты&apos; для разговорных агентов, которые будут взаимодействовать с пользователями.</div>} className="max-w-[560px]">
                                        <InformationCircleIcon className="w-4 h-4 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 cursor-help" />
                                    </Tooltip> */}
                                </div>
                                <div className="space-y-2">
                                    <Textarea
                                        value={customPrompt}
                                        onChange={(e) => {
                                            setCustomPrompt(e.target.value);
                                            setPromptError(null);
                                        }}
                                        placeholder="Сделай помощника службы поддержки, который может обрабатывать запросы клиентов о продуктах и возвратах"
                                        className={clsx(
                                            textareaStyles,
                                            "text-base",
                                            "text-gray-900 dark:text-gray-100",
                                            promptError && "border-red-500 focus:ring-red-500/20",
                                            !customPrompt && emptyTextareaStyles
                                        )}
                                        style={{ minHeight: "120px" }}
                                        autoFocus
                                        autoResize
                                        required={false}
                                    />
                                    {promptError && (
                                        <p className="text-sm text-red-500">
                                            {promptError}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {selectedTab === TabType.Blank && (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-4">
                                <p className="text-gray-600 dark:text-gray-400 text-sm">
                                    👇 Нажмите &ldquo;Создать агента&rdquo; ниже, чтобы начать
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Name Section */}
                    {/*
                    {USE_MULTIPLE_PROJECTS && (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-4">
                                <label className={largeSectionHeaderStyles}>
                                    🏷️ Назовите проект
                                </label>
                                <Textarea
                                    required
                                    name="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className={clsx(
                                        textareaStyles,
                                        "min-h-[60px]",
                                        "text-base",
                                        "text-gray-900 dark:text-gray-100"
                                    )}
                                    placeholder={defaultName}
                                />
                            </div>
                        </div>
                    )}
                    */}

                    {/* Submit Button */}
                    <div className="pt-1 w-full -mt-4">
                        <Submit />
                    </div>
                </form>
            </section>
        </div>
    );
}
