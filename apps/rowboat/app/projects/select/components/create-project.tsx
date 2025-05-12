'use client';

import { useEffect, useState } from "react";
import { createProject, createProjectFromPrompt } from "@/app/actions/project_actions";
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { starting_copilot_prompts } from "@/app/lib/project_templates";
import { Textarea } from "@/components/ui/textarea";
import { Submit } from "./submit-button";
import { Button } from "@/components/ui/button";
import { FolderOpenIcon } from "@heroicons/react/24/outline";
import { USE_MULTIPLE_PROJECTS } from "@/app/lib/feature_flags";
import { HorizontalDivider } from "@/components/ui/horizontal-divider";

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
    "focus:shadow-inner focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400",
    "placeholder:text-gray-400 dark:placeholder:text-gray-500",
    "transition-all duration-200"
);

interface CreateProjectProps {
    defaultName: string;
    onOpenProjectPane: () => void;
    isProjectPaneOpen: boolean;
}

// Define a type for the prompts dictionary
type PromptDict = { [key: string]: string };

// Filter and slice example prompts
const examplePrompts: PromptDict = Object.entries(starting_copilot_prompts)
    .filter(([name]) => name !== 'Blank Template')
    .slice(0, 3) // Take first 3 examples
    .reduce((acc, [name, prompt]) => {
        acc[name] = prompt;
        return acc;
    }, {} as PromptDict);

export function CreateProject({ defaultName, onOpenProjectPane, isProjectPaneOpen }: CreateProjectProps) {
    const [customPrompt, setCustomPrompt] = useState("");
    const [name, setName] = useState(defaultName);
    const router = useRouter();

    useEffect(() => {
        setName(defaultName);
    }, [defaultName]);

    const handleExampleSelect = (examplePrompt: string) => {
        setCustomPrompt(examplePrompt || '');
    };

    async function handleSubmit(formData: FormData) {
        try {
            const projectName = formData.get('name') as string || defaultName;
            const promptContent = customPrompt.trim();

            let response;

            if (promptContent) {
                const promptFormData = new FormData();
                promptFormData.append('name', projectName);
                promptFormData.append('prompt', promptContent);
                response = await createProjectFromPrompt(promptFormData);

                if (response?.id) {
                    localStorage.setItem(`project_prompt_${response.id}`, promptContent);
                }
            } else {
                const blankFormData = new FormData();
                blankFormData.append('name', projectName);
                blankFormData.append('template', 'default');
                response = await createProject(blankFormData);
            }

            if (!response?.id) {
                console.error('Project creation failed');
                // Optionally: Add user feedback (e.g., using a toast notification library)
                throw new Error('Project creation failed');
            }

            router.push(`/projects/${response.id}/workflow`);
        } catch (error) {
            console.error('Error creating project:', error);
            // Optionally: Add user feedback
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && !e.shiftKey) {
            e.preventDefault();
            const form = (e.target as HTMLElement).closest('form');
            if (form) {
                const formData = new FormData(form);
                handleSubmit(formData);
            }
        }
    };

    return (
        <div className={clsx(
            "overflow-auto h-full",
            !USE_MULTIPLE_PROJECTS && "max-w-none px-12 py-12",
            USE_MULTIPLE_PROJECTS && !isProjectPaneOpen && "col-span-full flex items-center justify-center",
            USE_MULTIPLE_PROJECTS && isProjectPaneOpen && "px-8 py-6"
        )}>
            <section className={clsx(
                "w-full",
                USE_MULTIPLE_PROJECTS && !isProjectPaneOpen ? "max-w-3xl" : "h-full",
                !USE_MULTIPLE_PROJECTS && "card px-24 py-12",
                USE_MULTIPLE_PROJECTS && isProjectPaneOpen && "card px-8 py-6",
            )}>
                {USE_MULTIPLE_PROJECTS && (
                    <>
                        <div className={clsx("px-4 pt-4 pb-6 flex justify-between items-center", isProjectPaneOpen ? "" : "mb-6")}>
                            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                                Создайте ассистента
                            </h1>
                            {!isProjectPaneOpen && (
                                <Button
                                    onClick={onOpenProjectPane}
                                    variant="primary"
                                    size="md"
                                    startContent={<FolderOpenIcon className="w-4 h-4" />}
                                >
                                    Мои проекты
                                </Button>
                            )}
                        </div>
                        {isProjectPaneOpen && <HorizontalDivider />}
                    </>
                )}
                {!USE_MULTIPLE_PROJECTS && (
                     <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-8 text-center">
                        Создайте своего ассистента
                    </h1>
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
                    className={clsx("space-y-8", isProjectPaneOpen || !USE_MULTIPLE_PROJECTS ? "pt-6 pb-16" : "pt-0 pb-0")}
                >
                    <div className="space-y-4">
                        <label htmlFor="prompt-textarea" className={largeSectionHeaderStyles}>
                            ✏️ Опишите, что должен делать ваш ассистент
                        </label>
                        <Textarea
                            id="prompt-textarea"
                            name="prompt"
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            placeholder="Например: ассистент для поддержки клиентов по доставке и возвратам, или бот для бронирования столиков в ресторане..."
                            className={clsx(
                                textareaStyles,
                                "text-base",
                                "text-gray-900 dark:text-gray-100"
                            )}
                            style={{ minHeight: "150px" }}
                            autoFocus
                            autoResize
                        />
                        <div className="text-sm text-gray-600 dark:text-gray-400 flex gap-3 items-center pt-1">
                           <span>Или начните с примера:</span>
                           <div className="flex gap-3 flex-wrap">
                            {Object.entries(examplePrompts).map(([name, prompt]) => (
                                <button
                                    key={name}
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleExampleSelect(prompt);
                                    }}
                                    className="text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1"
                                >
                                    {name}
                                </button>
                            ))}
                           </div>
                        </div>
                    </div>

                    {USE_MULTIPLE_PROJECTS && (
                        <div className="space-y-4">
                            <label htmlFor="project-name" className={largeSectionHeaderStyles}>
                                🏷️ Название проекта
                            </label>
                            <Textarea
                                id="project-name"
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
                    )}

                    <div className="pt-2 w-full flex justify-center">
                        <Submit buttonText="Создать ассистента" />
                    </div>
                </form>
            </section>
        </div>
    );
}
