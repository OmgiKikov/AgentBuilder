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
        description: "Search the web for current information and provide detailed answers based on the results. Use this tool to find up-to-date information about any topic, then analyze the results and provide a comprehensive answer to the user's question.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query to find information about"
                }
            },
            required: ["query"]
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