'use client';
import { Input, Select, SelectItem } from "@heroui/react"
import { Textarea } from "@/components/ui/textarea"
import { useState } from "react";
import { createDataSource, addDocsToDataSource } from "../../../../actions/datasource_actions";
import { FormStatusButton } from "../../../../lib/components/form-status-button";
import { DataSourceIcon } from "../../../../lib/components/datasource-icon";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/dropdown";
import { Panel } from "@/components/common/panel-common";

export function Form({
    projectId,
    useRagUploads,
    useRagS3Uploads,
    useRagScraping,
}: {
    projectId: string;
    useRagUploads: boolean;
    useRagS3Uploads: boolean;
    useRagScraping: boolean;
}) {
    const [sourceType, setSourceType] = useState("");
    const router = useRouter();

    let dropdownOptions = [
        {
            key: "text",
            label: "Text",
            startContent: <DataSourceIcon type="text" />
        },
    ];
    if (useRagUploads) {
        dropdownOptions.push({
            key: "files_local",
            label: "Upload files (Local)",
            startContent: <DataSourceIcon type="files" />
        });
    }
    if (useRagS3Uploads) {
        dropdownOptions.push({
            key: "files_s3",
            label: "Upload files (S3)",
            startContent: <DataSourceIcon type="files" />
        });
    }
    if (useRagScraping) {
        dropdownOptions.push({
            key: "urls",
            label: "Scrape URLs",
            startContent: <DataSourceIcon type="urls" />
        });
    }

    async function createUrlsDataSource(formData: FormData) {
        const source = await createDataSource({
            projectId,
            name: formData.get('name') as string,
            description: formData.get('description') as string,
            data: {
                type: 'urls',
            },
            status: 'pending',
        });

        const urls = formData.get('urls') as string;
        const urlsArray = urls.split('\n').map(url => url.trim()).filter(url => url.length > 0);
        // pick first 100
        const first100Urls = urlsArray.slice(0, 100);
        await addDocsToDataSource({
            projectId,
            sourceId: source._id,
            docData: first100Urls.map(url => ({
                name: url,
                data: {
                    type: 'url',
                    url,
                },
            })),
        });
        router.push(`/projects/${projectId}/sources/${source._id}`);
    }

    async function createFilesDataSource(formData: FormData) {
        const source = await createDataSource({
            projectId,
            name: formData.get('name') as string,
            description: formData.get('description') as string,
            data: {
                type: formData.get('type') as 'files_local' | 'files_s3',
            },
        });

        router.push(`/projects/${projectId}/sources/${source._id}`);
    }

    async function createTextDataSource(formData: FormData) {
        const source = await createDataSource({
            projectId,
            name: formData.get('name') as string,
            description: formData.get('description') as string,
            data: {
                type: 'text',
            },
            status: 'pending',
        });

        const content = formData.get('content') as string;
        await addDocsToDataSource({
            projectId,
            sourceId: source._id,
            docData: [{
                name: 'text',
                data: {
                    type: 'text',
                    content,
                },
            }],
        });

        router.push(`/projects/${projectId}/sources/${source._id}`);
    }

    return (
        <Panel
            title={
                <div className="flex items-center gap-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        NEW DATA SOURCE
                    </div>
                </div>
            }
        >
            <div className="h-full overflow-auto px-4 py-4">
                <div className="max-w-[768px] mx-auto flex flex-col gap-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-start gap-3">
                            <svg 
                                className="w-5 h-5 text-blue-500 mt-0.5" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                            >
                                <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={2} 
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                                />
                            </svg>
                            <div className="text-sm text-blue-700 dark:text-blue-300">
                                После создания источников данных, перейдите на вкладку RAG внутри настроек отдельного агента, чтобы подключить их к агентам.
                            </div>
                        </div>
                    </div>
                    <Dropdown
                        label="Выберите тип"
                        value={sourceType}
                        onChange={setSourceType}
                        options={dropdownOptions}
                    />

                    {sourceType === "urls" && <form
                        action={createUrlsDataSource}
                        className="flex flex-col gap-4"
                    >
                        <div className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Укажите URL-адреса (по одному на строку)
                            </label>
                            <Textarea
                                required
                                name="urls"
                                placeholder="https://example.com"
                                rows={5}
                                className="rounded-lg p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 focus:shadow-inner focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Имя
                            </label>
                            <Textarea
                                required
                                name="name"
                                placeholder="Например, статьи о помощи"
                                rows={1}
                                className="rounded-lg p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 focus:shadow-inner focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Описание
                            </label>
                            <Textarea
                                name="description"
                                placeholder="Например, коллекция статей о помощи из нашей документации"
                                rows={2}
                                className="rounded-lg p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 focus:shadow-inner focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-2 text-gray-700 dark:text-gray-300">
                                <svg 
                                    className="w-5 h-5 text-blue-500" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                >
                                    <path 
                                        strokeLinecap="round" 
                                        strokeLinejoin="round" 
                                        strokeWidth={2} 
                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                                    />
                                </svg>
                                <span className="font-medium">Примечание</span>
                            </div>
                            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 ml-7">
                                <li className="flex items-start">
                                    <span className="mr-2">•</span>
                                    <span>Ожидайте около 5-10 минут для скрапинга 100 страниц</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="mr-2">•</span>
                                    <span>Будут скрапиться только первые 100 (корректных) URL-адресов</span>
                                </li>
                            </ul>
                        </div>
                        <FormStatusButton
                            props={{
                                type: "submit",
                                children: "Добавить источник данных",
                                className: "self-start",
                                startContent: <PlusIcon className="w-4 h-4" />
                            }}
                        />
                    </form>}

                    {(sourceType === "files_local" || sourceType === "files_s3") && <form
                        action={createFilesDataSource}
                        className="flex flex-col gap-4"
                    >
                        <input type="hidden" name="type" value={sourceType} />
                        <div className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Имя
                            </label>
                            <Textarea
                                required
                                name="name"
                                placeholder="Например, файлы документации"
                                rows={1}
                                className="rounded-lg p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 focus:shadow-inner focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Описание
                            </label>
                            <Textarea
                                name="description"
                                placeholder="Например, коллекция файлов документации"
                                rows={2}
                                className="rounded-lg p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 focus:shadow-inner focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-2 text-gray-700 dark:text-gray-300">
                                <svg 
                                    className="w-5 h-5 text-blue-500" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    viewBox="0 0 24 24"
                                >
                                    <path 
                                        strokeLinecap="round" 
                                        strokeLinejoin="round" 
                                        strokeWidth={2} 
                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                                    />
                                </svg>
                                <span className="font-medium">Примечание</span>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 ml-7">
                                Вы сможете загрузить файлы в следующем шаге
                            </div>
                        </div>
                        <FormStatusButton
                            props={{
                                type: "submit",
                                children: "Добавить источник данных",
                                className: "self-start",
                                startContent: <PlusIcon className="w-[24px] h-[24px]" />
                            }}
                        />
                    </form>}

                    {sourceType === "text" && <form
                        action={createTextDataSource}
                        className="flex flex-col gap-4"
                    >
                        <div className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Содержимое
                            </label>
                            <Textarea
                                required
                                name="content"
                                placeholder="Введите ваше текстовое содержимое здесь"
                                rows={10}
                                className="rounded-lg p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 focus:shadow-inner focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Имя
                            </label>
                            <Textarea
                                required
                                name="name"
                                placeholder="Например, документация продукта"
                                rows={1}
                                className="rounded-lg p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 focus:shadow-inner focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                Описание
                            </label>
                            <Textarea
                                name="description"
                                placeholder="Например, коллекция документации для нашего продукта"
                                rows={2}
                                className="rounded-lg p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 focus:shadow-inner focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                        </div>
                        <FormStatusButton
                            props={{
                                type: "submit",
                                children: "Добавить источник данных",
                                className: "self-start",
                                startContent: <PlusIcon className="w-[24px] h-[24px]" />
                            }}
                        />
                    </form>}
                </div>
            </div>
        </Panel>
    );
}