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

export async function fetchMcpToolsForServer(projectId: string, serverName: string): Promise<z.infer<typeof WorkflowTool>[]> {
    await projectAuthCheck(projectId);

    console.log('[Klavis API] Fetching tools for specific server:', { projectId, serverName });

    const project = await projectsCollection.findOne({
        _id: projectId,
    });

    const mcpServer = project?.mcpServers?.find(server => server.name === serverName);
    if (!mcpServer) {
        console.error('[Klavis API] Server not found:', { serverName });
        return [];
    }

    if (!mcpServer.isActive || !mcpServer.serverUrl) {
        console.log('[Klavis API] Server is not active or missing URL:', { 
            serverName,
            isActive: mcpServer.isActive,
            hasUrl: !!mcpServer.serverUrl
        });
        return [];
    }

    const tools: z.infer<typeof WorkflowTool>[] = [];

    try {
        console.log('[Klavis API] Attempting MCP connection:', {
            serverName,
            url: mcpServer.serverUrl
        });

        const transport = new SSEClientTransport(new URL(mcpServer.serverUrl));
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
        console.log('[Klavis API] MCP connection established:', { serverName });

        // List tools
        const result = await client.listTools();

        console.log('[Klavis API] Raw MCP server result:', JSON.stringify(result, null, 2));

        // Validate and parse each tool
        const validTools = await Promise.all(
            result.tools.map(async (tool) => {
                try {
                    const parsedTool = McpServerTool.parse(tool);
                    return parsedTool;
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
        const convertedTools = validTools
            .filter((tool): tool is z.infer<typeof McpServerTool> => tool !== null)
            .map(mcpTool => {
                const converted = convertMcpServerToolToWorkflowTool(mcpTool, mcpServer);
                return converted;
            });

        tools.push(...convertedTools);

        console.log('[Klavis API] Successfully fetched tools for server:', {
            serverName,
            toolCount: tools.length,
            tools: tools.map(t => ({
                name: t.name,
                parameters: t.parameters
            }))
        });
    } catch (e) {
        console.error(`[Klavis API] Error fetching MCP tools from ${mcpServer.name}:`, {
            error: e instanceof Error ? e.message : 'Unknown error',
            serverUrl: mcpServer.serverUrl
        });
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
            // Find the tool in availableTools to get its parameters
            const availableTool = server.availableTools?.find(t => t.name === toolId);
            console.log('[MCP] Found available tool:', {
                serverName,
                toolId,
                availableTool: availableTool ? {
                    name: availableTool.name,
                    parameters: availableTool.parameters
                } : null
            });
            
            // Create a new tool with the parameters from availableTools
            const newTool = {
                id: toolId,
                name: toolId,
                description: availableTool?.description || '',
                parameters: availableTool?.parameters || {
                    type: 'object' as const,
                    properties: {},
                    required: []
                }
            };
            console.log('[MCP] Adding new tool:', {
                serverName,
                toolId,
                parameters: newTool.parameters
            });
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

    // Log the final state
    console.log('[MCP] Updated server tools:', {
        serverName,
        toolCount: server.tools.length,
        tools: server.tools.map(t => ({
            name: t.name,
            parameters: t.parameters
        }))
    });
}

export async function getSelectedMcpTools(projectId: string, serverName: string): Promise<string[]> {
    await projectAuthCheck(projectId);
    const project = await projectsCollection.findOne({ _id: projectId });
    if (!project) return [];

    const server = project.mcpServers?.find(s => s.serverName === serverName);
    if (!server) return [];

    return server.tools.map(t => t.id);
}

export async function getMcpToolsFromProject(projectId: string): Promise<z.infer<typeof WorkflowTool>[]> {
    await projectAuthCheck(projectId);
    
    try {
        // Get project's MCP servers and their tools
        const project = await projectsCollection.findOne({ _id: projectId });
        if (!project?.mcpServers) return [];

        // Convert MCP tools to workflow tools format
        const mcpTools = project.mcpServers.flatMap(server => {
            return server.tools.map(tool => 
                convertMcpServerToolToWorkflowTool(
                    {
                        name: tool.name,
                        description: tool.description || "",
                        inputSchema: {
                            type: 'object',
                            properties: tool.parameters?.properties || {},
                            required: tool.parameters?.required || [],
                        }
                    },
                    server
                )
            );
        });

        return mcpTools;
    } catch (error) {
        console.error('Error fetching MCP tools:', error);
        return [];
    }
}