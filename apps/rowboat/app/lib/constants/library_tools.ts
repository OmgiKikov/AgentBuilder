import { z } from 'zod';
import { WorkflowTool } from '../types/workflow_types';

// Определения библиотечных инструментов
export const LIBRARY_TOOLS: z.infer<typeof WorkflowTool>[] = [
    {
        name: "rag_search",
        description: "Fetch articles with knowledge relevant to the query",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The query to retrieve articles for"
                }
            },
            required: ["query"]
        },
        isLibrary: true
    },
    {
        name: "web_search",
        description: "Fetch information from the web based on chat context",
        parameters: {
            type: "object",
            properties: {},
            required: []
        },
        isLibrary: true
    }
];

// Функция для получения библиотечного инструмента по имени
export function getLibraryTool(name: string): z.infer<typeof WorkflowTool> | undefined {
    return LIBRARY_TOOLS.find(tool => tool.name === name);
}

// Функция для проверки, является ли инструмент библиотечным
export function isLibraryTool(name: string): boolean {
    return LIBRARY_TOOLS.some(tool => tool.name === name);
} 