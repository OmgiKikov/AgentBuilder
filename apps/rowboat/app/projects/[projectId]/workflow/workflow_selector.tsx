"use client";
import { WithStringId } from "../../../lib/types/types";
import { Workflow } from "../../../lib/types/workflow_types";
import { z } from "zod";
import { useEffect, useState, useCallback } from "react";
import { PublishedBadge } from "./published_badge";
import { listWorkflows } from "../../../actions/workflow_actions";
import { Button, Divider, Pagination } from "@heroui/react";
import { WorkflowIcon } from "../../../lib/components/icons";
import { PlusIcon } from "lucide-react";

const pageSize = 5;

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

function WorkflowCard({
    workflow,
    live = false,
    handleSelect,
}: {
    workflow: WithStringId<z.infer<typeof Workflow>>;
    live?: boolean;
    handleSelect: (workflowId: string) => void;
}) {
    return <button className="flex items-center gap-2 p-2 rounded hover:bg-gray-100 cursor-pointer" onClick={() => handleSelect(workflow._id)}>
        <div className="flex flex-col gap-1 items-start">
            <div className="flex items-center gap-1">
                <WorkflowIcon />
                <div className="text-black truncate">{workflow.name || 'Безымянный рабочий процесс'}</div>
                {live && <PublishedBadge />}
            </div>
            <div className="text-xs text-gray-400">
                обновлено {getRelativeTime(new Date(workflow.lastUpdatedAt))}
            </div>
        </div>
    </button>;
}

export function WorkflowSelector({
    projectId,
    handleSelect,
    handleCreateNewVersion,
    autoSelectIfOnlyOneWorkflow,
}: {
    projectId: string;
    handleSelect: (workflowId: string) => void;
    handleCreateNewVersion: () => void;
    autoSelectIfOnlyOneWorkflow: boolean;
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [workflows, setWorkflows] = useState<(WithStringId<z.infer<typeof Workflow>>)[]>([]);
    const [publishedWorkflowId, setPublishedWorkflowId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [retryCount, setRetryCount] = useState(0);

    function handlePageChange(page: number) {
        setCurrentPage(page);
        setWorkflows([]);
    }

    function handleRetry() {
        setRetryCount(retryCount + 1);
    }

    useEffect(() => {
        let ignore = false;

        async function fetchWorkflows() {
            setError(null);
            setLoading(true);
            try {
                const { workflows, total, publishedWorkflowId } = await listWorkflows(projectId, currentPage, pageSize);
                if (ignore) {
                    console.log('ignoring', currentPage);
                    return;
                }
                setWorkflows(workflows);
                setTotalPages(Math.ceil(total / pageSize));
                setPublishedWorkflowId(publishedWorkflowId);
                setError(null);

                if (autoSelectIfOnlyOneWorkflow && workflows.length === 1) {
                    handleSelect(workflows[0]._id);
                }
            } catch (e) {
                setError('Failed to load workflows');
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        }

        fetchWorkflows();

        return () => {
            ignore = true;
        }
    }, [projectId, currentPage, retryCount, autoSelectIfOnlyOneWorkflow, handleSelect]);

    return <div className="flex flex-col gap-2 max-w-[768px] mx-auto w-full border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 justify-between">
            <div className="text-lg">Выберите версию рабочего процесса</div>
            <Button
                color="primary"
                startContent={<PlusIcon size={16} />}
                onPress={handleCreateNewVersion}
            >
                Создать новую версию
            </Button>
        </div>
        <Divider />
        {loading && <div className="flex flex-col gap-2">
            {[...Array(pageSize)].map((_, i) => {
                const widths = ['w-32', 'w-40', 'w-48', 'w-56'];
                const randomWidth = widths[Math.floor(Math.random() * widths.length)];

                return (
                    <div
                        key={i}
                        className="flex items-center justify-between gap-2 p-2 rounded"
                    >
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <div className={`h-5 ${randomWidth} bg-gray-200 rounded animate-pulse`}></div>
                            </div>
                            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
                        </div>
                    </div>
                );
            })}
        </div>}
        {error && <div className="flex flex-col items-center gap-2 text-red-600">
            <div>{error}</div>
            <button
                onClick={handleRetry}
                className="px-4 py-2 text-sm bg-red-100 hover:bg-red-200 rounded"
            >
                Повторить
            </button>
        </div>}
        {!loading && !error && workflows.length == 0 && <div className="flex flex-col items-center gap-2">
            <div className="text-sm text-gray-500">Версии не найдены. Создайте новую версию, чтобы начать.</div>
        </div>}
        {!loading && !error && workflows.length > 0 && <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2">
                {workflows.map((workflow) => (
                    <WorkflowCard
                        key={workflow._id}
                        workflow={workflow}
                        live={publishedWorkflowId == workflow._id}
                        handleSelect={handleSelect}
                    />
                ))}
            </div>
        </div>}
        {totalPages > 1 && (
            <div className="flex justify-center mt-4">
                <Pagination
                    total={totalPages}
                    page={currentPage}
                    onChange={handlePageChange}
                />
            </div>
        )}
    </div>
}
