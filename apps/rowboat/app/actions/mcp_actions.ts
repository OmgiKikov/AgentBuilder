"use server";
import { z } from "zod";
import { WorkflowTool } from "../lib/types/workflow_types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { projectAuthCheck } from "./project_actions";
import { projectsCollection, agentWorkflowsCollection } from "../lib/mongodb";
import { Project } from "../lib/types/project_types";
import { MCPServer, McpTool, McpServerTool, convertMcpServerToolToWorkflowTool } from "../lib/types/types";
import { ObjectId } from "mongodb";

export async function fetchMcpTools(projectId: string): Promise<z.infer<typeof WorkflowTool>[]> {
    await projectAuthCheck(projectId);

    const project = await projectsCollection.findOne({
        _id: projectId,
    });

    const mcpServers = project?.mcpServers ?? [];
    const tools: z.infer<typeof WorkflowTool>[] = [];

    for (const mcpServer of mcpServers) {
        if (!mcpServer.isActive) continue;
        
        try {
            const transport = new SSEClientTransport(new URL(mcpServer.serverUrl!));

            const client = new Client(
                {
                    name: "rowboat-client",
                    version: "1.0.0"
                },
                {
                    capabilities: {
                        prompts: {},
                        resources: {},
                        tools: {}
                    }
                }
            );

            await client.connect(transport);

            // List tools
            const result = await client.listTools();
            await client.close();

            // Validate and parse each tool
            const validTools = await Promise.all(
                result.tools.map(async (tool) => {
                    try {
                        return McpServerTool.parse(tool);
                    } catch (error) {
                        console.error(`Invalid tool response from ${mcpServer.name}:`, {
                            tool: tool.name,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                        return null;
                    }
                })
            );

            // Filter out invalid tools and convert valid ones
            tools.push(...validTools
                .filter((tool): tool is z.infer<typeof McpServerTool> => 
                    tool !== null && 
                    mcpServer.tools.some(t => t.id === tool.name)
                )
                .map(mcpTool => convertMcpServerToolToWorkflowTool(mcpTool, mcpServer))
            );
        } catch (e) {
            console.error(`Error fetching MCP tools from ${mcpServer.name}:`, {
                error: e instanceof Error ? e.message : 'Unknown error',
                serverUrl: mcpServer.serverUrl
            });
        }
    }

    return tools;
}

export async function updateMcpServers(projectId: string, mcpServers: z.infer<typeof Project>['mcpServers']): Promise<void> {
    await projectAuthCheck(projectId);
    await projectsCollection.updateOne({
        _id: projectId,
    }, { $set: { mcpServers } });
}

export async function listMcpServers(projectId: string): Promise<z.infer<typeof MCPServer>[]> {
    await projectAuthCheck(projectId);
    const project = await projectsCollection.findOne({
        _id: projectId,
    });
    return project?.mcpServers ?? [];
}

export async function updateToolInAllWorkflows(
    projectId: string, 
    mcpServer: z.infer<typeof MCPServer>,
    toolId: string, 
    shouldAdd: boolean
): Promise<void> {
    await projectAuthCheck(projectId);

    // 1. Get all workflows in the project
    const workflows = await agentWorkflowsCollection.find({ projectId }).toArray();
    
    // 2. For each workflow
    for (const workflow of workflows) {
        // 3. Find if the tool already exists in this workflow
        const existingTool = workflow.tools.find(t => 
            t.isMcp && 
            t.mcpServerName === mcpServer.name && 
            t.name === toolId
        );

        if (shouldAdd && !existingTool) {
            // 4a. If adding and tool doesn't exist, add it
            const tool = mcpServer.tools.find(t => t.id === toolId);
            if (tool) {
                const workflowTool = convertMcpServerToolToWorkflowTool(
                    {
                        name: tool.name,
                        description: tool.description,
                        inputSchema: {
                            type: 'object',
                            properties: tool.parameters?.properties ?? {},
                            required: tool.parameters?.required ?? [],
                        },
                    },
                    mcpServer
                );
                workflow.tools.push(workflowTool);
            }
        } else if (!shouldAdd && existingTool) {
            // 4b. If removing and tool exists, remove it
            workflow.tools = workflow.tools.filter(t => 
                !(t.isMcp && t.mcpServerName === mcpServer.name && t.name === toolId)
            );
        }

        // 5. Update the workflow
        await agentWorkflowsCollection.updateOne(
            { _id: workflow._id },
            { 
                $set: { 
                    tools: workflow.tools,
                    lastUpdatedAt: new Date().toISOString()
                } 
            }
        );
    }
}

export async function toggleMcpTool(
    projectId: string,
    serverName: string,
    toolId: string,
    shouldAdd: boolean
): Promise<void> {
    await projectAuthCheck(projectId);

    // 1. Get the project and find the server
    const project = await projectsCollection.findOne({ _id: projectId });
    if (!project) throw new Error("Project not found");

    console.log('[MCP] Toggling tool:', {
        projectId,
        serverName,
        toolId,
        shouldAdd,
        availableServers: project.mcpServers?.map(s => ({
            name: s.name,
            serverName: s.serverName
        }))
    });

    const mcpServers = project.mcpServers || [];
    const serverIndex = mcpServers.findIndex(s => s.serverName === serverName);
    if (serverIndex === -1) throw new Error("Server not found");

    const server = mcpServers[serverIndex];
    
    if (shouldAdd) {
        // Add tool if it doesn't exist
        const toolExists = server.tools.some(t => t.id === toolId);
        if (!toolExists) {
            // Create a new tool with the required fields
            const newTool = {
                id: toolId,
                name: toolId,
                description: '',
                parameters: {
                    type: 'object' as const,
                    properties: {},
                    required: []
                }
            };
            server.tools.push(newTool);
        }
    } else {
        // Remove tool if it exists
        server.tools = server.tools.filter(t => t.id !== toolId);
    }

    // Update the project
    await projectsCollection.updateOne(
        { _id: projectId },
        { $set: { mcpServers } }
    );

    // Update all workflows
    await updateToolInAllWorkflows(projectId, server, toolId, shouldAdd);
}

export async function getSelectedMcpTools(projectId: string, serverName: string): Promise<string[]> {
    await projectAuthCheck(projectId);
    const project = await projectsCollection.findOne({ _id: projectId });
    if (!project) return [];

    const server = project.mcpServers?.find(s => s.serverName === serverName);
    if (!server) return [];

    return server.tools.map(t => t.id);
}