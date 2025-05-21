'use client';
import { Project } from "@/app/lib/types/project_types";
import { default as NextLink } from "next/link";
import { z } from "zod";
import clsx from 'clsx';
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { formatDistanceToNow } from "date-fns";
import { ru } from 'date-fns/locale';
import { tokens } from "@/app/styles/design-tokens";

interface ProjectCardProps {
    project: z.infer<typeof Project>;
}

export function ProjectCard({ project }: ProjectCardProps) {
    return (
        <NextLink
            href={`/projects/${project._id}`}
            className={clsx(
                "block px-4 py-3",
                tokens.transitions.default,
                tokens.colors.light.surfaceHover,
                tokens.colors.dark.surfaceHover,
                "group"
            )}
        >
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <h3 className={clsx(
                        tokens.typography.sizes.base,
                        tokens.typography.weights.medium,
                        tokens.colors.light.text.primary,
                        tokens.colors.dark.text.primary,
                        "group-hover:text-indigo-600 dark:group-hover:text-indigo-400",
                        tokens.transitions.default
                    )}>
                        {project.name}
                    </h3>
                    <p className={clsx(
                        tokens.typography.sizes.xs,
                        tokens.colors.light.text.muted,
                        tokens.colors.dark.text.muted
                    )}>
                        Создан {formatDistanceToNow(new Date(project.createdAt), { locale: ru })} назад
                    </p>
                </div>
                <ChevronRightIcon 
                    className={clsx(
                        "w-5 h-5",
                        tokens.colors.light.text.muted,
                        tokens.colors.dark.text.muted,
                        "transform transition-transform group-hover:translate-x-0.5"
                    )}
                />
            </div>
        </NextLink>
    );
} 