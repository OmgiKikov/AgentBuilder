'use server';

import { projectAuthCheck } from './project_actions';
import { z } from 'zod';
import { MCPServer, McpTool, McpServerResponse } from '../lib/types/types';
import { projectsCollection } from '../lib/mongodb';

type McpServerType = z.infer<typeof MCPServer>;
type McpToolType = z.infer<typeof McpTool>;
type McpServerResponseType = z.infer<typeof McpServerResponse>;

// Internal API Response Types
interface KlavisServerMetadata {
  id: string;
  name: string;
  description: string;
  tools: {
    name: string;
    description: string;
  }[];
  authNeeded: boolean;
}

interface GetAllServersResponse {
  servers: KlavisServerMetadata[];
}

interface CreateServerInstanceResponse {
  serverUrl: string;
  instanceId: string;
}

interface DeleteServerInstanceResponse {
  success: boolean;
  message: string;
}

interface UserInstance {
  id: string;
  name: string;
  description: string | null;
  tools: {
    name: string;
    description: string;
    authNeeded: boolean;
    isAuthenticated: boolean;
  }[] | null;
  authNeeded: boolean;
  isAuthenticated: boolean;
}

interface GetUserInstancesResponse {
  instances: UserInstance[];
}

// Our public interface types
export interface McpServer {
  id: string;
  name: string;
  description: string;
  tools: McpTool[];
  instanceId: string;
  serverName: string;
  serverUrl?: string;
  isActive?: boolean;
  authNeeded: boolean;
  isAuthenticated: boolean;
  requiresAuth: boolean;
}

export interface McpTool {
  id: string;
  name: string;
  description: string;
}

export interface McpServerResponse {
  data: McpServer[] | null;
  error: string | null;
}

const KLAVIS_BASE_URL = 'https://api.klavis.ai';

interface KlavisApiCallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, any>;
  additionalHeaders?: Record<string, string>;
}

async function klavisApiCall<T>(
  endpoint: string,
  options: KlavisApiCallOptions = {}
): Promise<T> {
  const { method = 'GET', body, additionalHeaders = {} } = options;
  const startTime = performance.now();
  const url = `${KLAVIS_BASE_URL}${endpoint}`;

  try {
    const headers = {
      'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
      'Content-Type': 'application/json',
      ...additionalHeaders
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    };

    const response = await fetch(url, fetchOptions);
    const endTime = performance.now();
    
    console.log('[Klavis API] Response time:', {
      url,
      method,
      durationMs: Math.round(endTime - startTime)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    return await response.json() as T;
  } catch (error) {
    const endTime = performance.now();
    console.error('[Klavis API] Failed call:', {
      url,
      method,
      durationMs: Math.round(endTime - startTime),
      error
    });
    throw error;
  }
}

// Lists all active server instances for a given project
export async function listActiveServerInstances(projectId: string): Promise<UserInstance[]> {
  try {
    await projectAuthCheck(projectId);

    const queryParams = new URLSearchParams({
      user_id: projectId,
      platform_name: 'Rowboat'
    });

    console.log('[Klavis API] Fetching active instances:', { projectId, platformName: 'Rowboat' });
    
    const endpoint = `/user/instances?${queryParams}`;
    const data = await klavisApiCall<GetUserInstancesResponse>(endpoint);

    console.log('[Klavis API] =================== Active Instances ===================');
    data.instances.forEach((instance, index) => {
      console.log(`[Klavis API] Instance ${index + 1}:`, {
        id: instance.id,
        name: instance.name,
        description: instance.description,
        tools: `[${instance.tools?.length || 0} tools]`,
        isAuthenticated: instance.isAuthenticated,
        authNeeded: instance.authNeeded
      });
    });
    console.log('[Klavis API] =====================================================');
    return data.instances;
  } catch (error) {
    console.error('[Klavis API] Error listing active instances:', error);
    throw error;
  }
}

// Lists all available MCP servers that can be enabled
export async function listAvailableMcpServers(projectId: string): Promise<McpServerResponse> {
  try {
    await projectAuthCheck(projectId);

    console.log('[Klavis API] Fetching all servers');
    
    // Get MongoDB project data first
    const project = await projectsCollection.findOne({ _id: projectId });
    const mongodbServers = project?.mcpServers || [];
    const mongodbServerMap = new Map(mongodbServers.map(server => [server.name, server]));

    const serversEndpoint = '/mcp-server/servers';
    const rawData = await klavisApiCall<GetAllServersResponse>(serversEndpoint, {
      additionalHeaders: { 'Accept': 'application/json' }
    });

    console.log('[Klavis API] Servers response:', { serverCount: rawData.servers.length });
    
    if (!rawData || !rawData.servers || !Array.isArray(rawData.servers)) {
      console.error('[Klavis API] Invalid response format:', rawData);
      return { data: null, error: 'Invalid response format from server' };
    }

    // Get active instances for comparison
    const queryParams = new URLSearchParams({
      user_id: projectId,
      platform_name: 'Rowboat'
    });

    console.log('[Klavis API] Fetching user instances:', { 
      userId: projectId,
      platformName: 'Rowboat'
    });

    const instancesEndpoint = `/user/instances?${queryParams}`;
    let activeInstances: UserInstance[] = [];
    
    try {
      const instancesData = await klavisApiCall<GetUserInstancesResponse>(instancesEndpoint);
      console.log('[Klavis API] =================== Active Instances ===================');
      instancesData.instances.forEach((instance, index) => {
        console.log(`[Klavis API] Instance ${index + 1}:`, JSON.stringify({
          id: instance.id,
          name: instance.name,
          description: instance.description,
          tools: `[${instance.tools?.length || 0} tools]`,
          isAuthenticated: instance.isAuthenticated,
          authNeeded: instance.authNeeded
        }, null, 2));
      });
      console.log('[Klavis API] =====================================================');
      activeInstances = instancesData.instances;
    } catch (error) {
      console.error('[Klavis API] Failed to fetch user instances:', error);
    }

    const activeInstanceMap = new Map(activeInstances.map(instance => [instance.name, instance]));

    // Transform the data to match our expected format
    const transformedData = rawData.servers.map((server) => {
      const activeInstance = activeInstanceMap.get(server.name);
      const mongodbServer = mongodbServerMap.get(server.name);
      
      // Always get available tools from Klavis
      const availableTools = (server.tools || []).map(tool => ({
        id: tool.name || '',
        name: tool.name || '',
        description: tool.description || '',
      }));

      // Get selected tools from MongoDB only if server is eligible
      const isActive = !!activeInstance;
      const authNeeded = activeInstance ? activeInstance.authNeeded : (server.authNeeded || false);
      const isAuthenticated = activeInstance ? activeInstance.isAuthenticated : false;
      const isEligible = isActive && (!authNeeded || isAuthenticated);
      
      // Selected tools only come from MongoDB and only for eligible servers
      const selectedTools = (isEligible && mongodbServer) ? mongodbServer.tools : [];

      console.log('[Server Tools] Processing server:', {
        serverName: server.name,
        isActive,
        isEligible,
        authNeeded,
        isAuthenticated,
        availableToolCount: availableTools.length,
        selectedToolCount: selectedTools.length
      });
      
      return {
        ...server,
        instanceId: activeInstance?.id || server.id,
        serverName: server.name,
        tools: selectedTools,           // Selected tools from MongoDB
        availableTools: availableTools, // Available tools from Klavis
        isActive,
        authNeeded,
        isAuthenticated,
        requiresAuth: server.authNeeded || false
      };
    });

    return { data: transformedData, error: null };
  } catch (error: any) {
    console.error('[Klavis API] Server list error:', error.message);
    return { data: null, error: error.message || 'An unexpected error occurred' };
  }
}

export async function createMcpServerInstance(
  serverName: string,
  projectId: string,
  platformName: string,
): Promise<CreateServerInstanceResponse> {
  try {
    await projectAuthCheck(projectId);

    const requestBody = {
      serverName,
      userId: projectId,
      platformName
    };
    console.log('[Klavis API] Creating server instance:', requestBody);
    
    const endpoint = '/mcp-server/instance/create';
    const result = await klavisApiCall<CreateServerInstanceResponse>(endpoint, {
      method: 'POST',
      body: requestBody
    });

    console.log('[Klavis API] Created server instance:', result);
    return result;
  } catch (error: any) {
    console.error('[Klavis API] Error creating instance:', error);
    throw error;
  }
}

// Helper function to filter eligible servers
function getEligibleServers(servers: McpServerType[]): McpServerType[] {
  return servers.filter(server => 
    server.isActive && (!server.authNeeded || server.isAuthenticated)
  );
}

export async function updateProjectServers(projectId: string): Promise<void> {
  try {
    await projectAuthCheck(projectId);
    
    console.log('[Klavis API] Fetching latest server data after OAuth:', { projectId });
    const updatedServers = await listAvailableMcpServers(projectId);
    
    if (updatedServers.data) {
      const eligibleServers = getEligibleServers(updatedServers.data);
      console.log('[MongoDB] Updating eligible server data:', { 
        projectId, 
        eligibleCount: eligibleServers.length,
        totalCount: updatedServers.data.length 
      });
      
      await projectsCollection.updateOne(
        { _id: projectId },
        { $set: { mcpServers: eligibleServers } }
      );
      console.log('[MongoDB] Server data updated successfully');
    }
  } catch (error) {
    console.error('[MongoDB] Error updating server data:', error);
    throw error;
  }
}

export async function enableServer(
  serverName: string,
  projectId: string,
  enabled: boolean
): Promise<CreateServerInstanceResponse | {}> {
  try {
    await projectAuthCheck(projectId);

    console.log('[Klavis API] Toggle server request:', { serverName, projectId, enabled });
    
    if (enabled) {
      const result = await createMcpServerInstance(serverName, projectId, "Rowboat");
      console.log('[Klavis API] Enabled server:', { serverName, result });

      // Get the latest server data to update MongoDB
      const updatedServers = await listAvailableMcpServers(projectId);
      if (updatedServers.data) {
        const eligibleServers = getEligibleServers(updatedServers.data);
        console.log('[MongoDB] Updating eligible server data after enable:', { 
          projectId, 
          serverName,
          eligibleCount: eligibleServers.length,
          totalCount: updatedServers.data.length 
        });
        
        await projectsCollection.updateOne(
          { _id: projectId },
          { $set: { mcpServers: eligibleServers } }
        );
        console.log('[MongoDB] Server data updated successfully');
      }

      return result;
    } else {
      // Get active instances to find the one to delete
      const instances = await listActiveServerInstances(projectId);
      const instance = instances.find(i => i.name === serverName);
      
      if (instance?.id) {
        await deleteMcpServerInstance(instance.id, projectId);
        console.log('[Klavis API] Disabled server:', { serverName, instanceId: instance.id });

        // Get the latest server data to update MongoDB
        const updatedServers = await listAvailableMcpServers(projectId);
        if (updatedServers.data) {
          const eligibleServers = getEligibleServers(updatedServers.data);
          console.log('[MongoDB] Updating eligible server data after disable:', { 
            projectId, 
            serverName,
            eligibleCount: eligibleServers.length,
            totalCount: updatedServers.data.length 
          });
          
          await projectsCollection.updateOne(
            { _id: projectId },
            { $set: { mcpServers: eligibleServers } }
          );
          console.log('[MongoDB] Server data updated successfully');
        }
      } else {
        console.log('[Klavis API] No instance found to disable:', { serverName });
      }
      
      return {};
    }
  } catch (error: any) {
    console.error('[Klavis API] Toggle error:', { server: serverName, error: error.message });
    throw error;
  }
}

export async function setMcpServerAuthToken(
  instanceId: string,
  authToken: string,
  projectId: string,
): Promise<void> {
  try {
    console.log('[Klavis API] Setting auth token for instance:', { instanceId });
    
    const endpoint = `/mcp-server/instance/${instanceId}/auth`;
    await klavisApiCall<void>(endpoint, {
      method: 'POST',
      body: { authToken }
    });

    console.log('[Klavis API] Auth token set successfully:', { instanceId });

    // Update MongoDB with latest server data
    const updatedServers = await listAvailableMcpServers(projectId);
    if (updatedServers.data) {
      const eligibleServers = getEligibleServers(updatedServers.data);
      console.log('[MongoDB] Updating eligible server data after auth:', { 
        projectId, 
        instanceId,
        eligibleCount: eligibleServers.length,
        totalCount: updatedServers.data.length 
      });
      
      await projectsCollection.updateOne(
        { _id: projectId },
        { $set: { mcpServers: eligibleServers } }
      );
      console.log('[MongoDB] Server data updated successfully');
    }
  } catch (error: any) {
    console.error('[Klavis API] Error setting auth token:', error);
    throw error;
  }
}

export async function deleteMcpServerInstance(
  instanceId: string,
  projectId: string,
): Promise<void> {
  try {
    console.log('[Klavis API] Deleting instance:', { instanceId });
    
    const endpoint = `/mcp-server/instance/delete/${instanceId}`;
    try {
      await klavisApiCall<DeleteServerInstanceResponse>(endpoint, {
        method: 'DELETE'
      });
      console.log('[Klavis API] Instance deleted successfully:', { instanceId });

      // Update MongoDB with latest server data
      const updatedServers = await listAvailableMcpServers(projectId);
      if (updatedServers.data) {
        const eligibleServers = getEligibleServers(updatedServers.data);
        console.log('[MongoDB] Updating eligible server data after deletion:', { 
          projectId, 
          instanceId,
          eligibleCount: eligibleServers.length,
          totalCount: updatedServers.data.length 
        });
        
        await projectsCollection.updateOne(
          { _id: projectId },
          { $set: { mcpServers: eligibleServers } }
        );
        console.log('[MongoDB] Server data updated successfully');
      }
    } catch (error: any) {
      if (error.message.includes('404')) {
        console.log('[Klavis API] Instance already deleted:', { instanceId });
        return;
      }
      throw error;
    }
  } catch (error: any) {
    console.error('[Klavis API] Error deleting instance:', error);
    throw error;
  }
}