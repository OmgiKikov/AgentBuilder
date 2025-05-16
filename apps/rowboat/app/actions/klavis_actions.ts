'use server';

import { MongoClient } from "mongodb";
import { db } from "@/app/lib/mongodb";

// Add interface for raw server data
interface RawMcpServer {
  id: string;
  name: string;
  description: string;
  tools: McpTool[];
  serverUrl?: string;
}

// API Response Types
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

interface ServerInstance {
  instanceId: string;
  authNeeded: boolean;
  isAuthenticated: boolean;
  serverName: string;
  platform: string;
  externalUserId: string;
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
  isAuthenticated?: boolean;
}

export interface McpTool {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;
  requiresAuth: boolean;
}

export interface McpServerResponse {
  data: McpServer[] | null;
  error: string | null;
}

interface KlavisServerInstance {
  id: string;
  name: string;
  description: string | null;
  tools: {
    name: string;
    description: string;
    authNeeded: boolean;
    isAuthenticated: boolean;
  }[] | null;
}

interface KlavisInstancesResponse {
  instances: KlavisServerInstance[];
}

const KLAVIS_BASE_URL = 'https://api.klavis.ai';

async function measureKlavisApiCall<T>(
  endpoint: string,
  apiCall: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();
  try {
    const result = await apiCall();
    const endTime = performance.now();
    console.log('[Klavis API] Response time:', {
      url: `${KLAVIS_BASE_URL}${endpoint}`,
      durationMs: Math.round(endTime - startTime)
    });
    return result;
  } catch (error) {
    const endTime = performance.now();
    console.error('[Klavis API] Failed call:', {
      url: `${KLAVIS_BASE_URL}${endpoint}`,
      durationMs: Math.round(endTime - startTime),
      error
    });
    throw error;
  }
}

// Lists all active server instances for a given project
export async function listActiveServerInstances(projectId: string): Promise<UserInstance[]> {
  try {
    const queryParams = new URLSearchParams({
      user_id: projectId,
      platform_name: 'Rowboat'
    });

    console.log('[Klavis API] Fetching active instances:', { projectId, platformName: 'Rowboat' });
    
    const endpoint = `/user/instances?${queryParams}`;
    const response = await measureKlavisApiCall(endpoint, () =>
      fetch(`${KLAVIS_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
          'Content-Type': 'application/json',
        },
      })
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Klavis API] Failed to fetch active instances:', { status: response.status, error });
      throw new Error(`Failed to list active instances: ${error}`);
    }

    const data = await response.json() as GetUserInstancesResponse;
    console.log('[Klavis API] Active instances response:', { instanceCount: data.instances.length });
    return data.instances;
  } catch (error) {
    console.error('[Klavis API] Error listing active instances:', error);
    throw error;
  }
}

// Lists all available MCP servers that can be enabled
export async function listAvailableMcpServers(projectId: string): Promise<McpServerResponse> {
  try {
    console.log('[Klavis API] Fetching all servers');
    
    const serversEndpoint = '/mcp-server/servers';
    const response = await measureKlavisApiCall(serversEndpoint, () =>
      fetch(`${KLAVIS_BASE_URL}${serversEndpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
      })
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Klavis API] Failed to fetch servers:', { status: response.status, error });
      return { data: null, error: `Failed to list MCP servers: ${error}` };
    }

    const rawData = await response.json() as GetAllServersResponse;
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
    const instancesResponse = await measureKlavisApiCall(instancesEndpoint, () =>
      fetch(`${KLAVIS_BASE_URL}${instancesEndpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
          'Content-Type': 'application/json',
        },
      })
    );

    let activeInstances: UserInstance[] = [];
    if (instancesResponse.ok) {
      const instancesData = await instancesResponse.json() as GetUserInstancesResponse;
      console.log('[Klavis API] User instances response:', { instanceCount: instancesData.instances.length });
      activeInstances = instancesData.instances;
    } else {
      console.error('[Klavis API] Failed to fetch user instances:', { 
        status: instancesResponse.status,
        error: await instancesResponse.text()
      });
    }

    const activeInstanceMap = new Map(activeInstances.map(instance => [instance.name, instance]));

    // Transform the data to match our expected format
    const transformedData = rawData.servers.map((server) => {
      const activeInstance = activeInstanceMap.get(server.name);
      const serverTools = server.tools || [];
      
      return {
        ...server,
        instanceId: activeInstance?.id || server.id,
        serverName: server.name,
        tools: serverTools.map(tool => ({
          id: tool.name || '',
          name: tool.name || '',
          description: tool.description || '',
          isEnabled: true,
          requiresAuth: server.authNeeded || false
        })),
        isActive: !!activeInstance,
        isAuthenticated: activeInstance?.tools?.[0]?.isAuthenticated || false
      };
    });

    console.log('Servers fetched:', { count: transformedData.length });
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
    const requestBody = {
      serverName,
      userId: projectId,
      platformName
    };
    console.log('[Klavis API] Creating server instance:', requestBody);

    const endpoint = '/mcp-server/instance/create';
    const response = await measureKlavisApiCall(endpoint, () =>
      fetch(`${KLAVIS_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Klavis API] Failed to create instance:', { 
        status: response.status, 
        error,
        request: requestBody 
      });
      throw new Error(`Failed to create MCP server instance: ${error}`);
    }

    const result = await response.json() as CreateServerInstanceResponse;
    console.log('[Klavis API] Created server instance:', result);
    return result;
  } catch (error: any) {
    console.error('[Klavis API] Error creating instance:', error);
    throw error;
  }
}

export async function enableServer(
  serverName: string,
  projectId: string,
  enabled: boolean
): Promise<CreateServerInstanceResponse | {}> {
  try {
    console.log('[Klavis API] Toggle server request:', { serverName, projectId, enabled });
    
    if (enabled) {
      const result = await createMcpServerInstance(serverName, projectId, "Rowboat");
      console.log('[Klavis API] Enabled server:', { serverName, result });
      return result;
    } else {
      // Get active instances to find the one to delete
      const instances = await listActiveServerInstances(projectId);
      const instance = instances.find(i => i.name === serverName);
      
      if (instance?.id) {
        await deleteMcpServerInstance(instance.id);
        console.log('[Klavis API] Disabled server:', { serverName, instanceId: instance.id });
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

export async function listMcpServerTools(instanceId: string): Promise<McpTool[]> {
  try {
    console.log('[Klavis API] Fetching tools for instance:', { instanceId });
    
    const endpoint = `/mcp-server/instance/${instanceId}/tools`;
    const response = await measureKlavisApiCall(endpoint, () =>
      fetch(`${KLAVIS_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
          'Content-Type': 'application/json',
        },
      })
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Klavis API] Failed to fetch tools:', { status: response.status, error });
      throw new Error(`Failed to list MCP server tools: ${error}`);
    }

    const data = await response.json();
    const tools = data.tools || [];
    console.log('[Klavis API] Tools response:', { instanceId, toolCount: tools.length });
    return tools.map((tool: any) => ({
      id: tool.name || '',
      name: tool.name || '',
      description: tool.description || '',
      isEnabled: true,
      requiresAuth: tool.authNeeded || false
    }));
  } catch (error: any) {
    console.error('[Klavis API] Error listing tools:', error);
    throw error;
  }
}

export async function setMcpServerAuthToken(
  instanceId: string,
  authToken: string,
): Promise<void> {
  try {
    console.log('[Klavis API] Setting auth token for instance:', { instanceId });
    
    const endpoint = `/mcp-server/instance/${instanceId}/auth`;
    const response = await measureKlavisApiCall(endpoint, () =>
      fetch(`${KLAVIS_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ authToken }),
      })
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Klavis API] Failed to set auth token:', { status: response.status, error });
      throw new Error(`Failed to set MCP server auth token: ${error}`);
    }
    console.log('[Klavis API] Auth token set successfully:', { instanceId });
  } catch (error: any) {
    console.error('[Klavis API] Error setting auth token:', error);
    throw error;
  }
}

export async function deleteMcpServerInstance(instanceId: string): Promise<void> {
  try {
    console.log('[Klavis API] Deleting instance:', { instanceId });
    
    const endpoint = `/mcp-server/instance/delete/${instanceId}`;
    const response = await measureKlavisApiCall(endpoint, () =>
      fetch(`${KLAVIS_BASE_URL}${endpoint}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
          'Content-Type': 'application/json',
        },
      })
    );

    if (response.status === 404) {
      console.log('[Klavis API] Instance already deleted:', { instanceId });
      return;
    }

    if (!response.ok) {
      const error = await response.text();
      console.error('[Klavis API] Failed to delete instance:', { status: response.status, error });
      throw new Error(`Delete failed: ${error}`);
    }

    const result = await response.json() as DeleteServerInstanceResponse;
    console.log('[Klavis API] Instance deleted successfully:', { instanceId, result });
  } catch (error: any) {
    console.error('[Klavis API] Error deleting instance:', error);
    throw error;
  }
}

export async function callMcpServerTool(
  instanceId: string,
  toolEndpoint: string,
  params: Record<string, any>,
): Promise<any> {
  try {
    console.log('[Klavis API] Calling tool:', { instanceId, toolEndpoint, params });
    
    const endpoint = `/mcp-server/instance/${instanceId}/tools${toolEndpoint}`;
    const response = await measureKlavisApiCall(endpoint, () =>
      fetch(`${KLAVIS_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      })
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Klavis API] Failed to call tool:', { 
        status: response.status, 
        error,
        instanceId,
        toolEndpoint 
      });
      throw new Error(`Failed to call MCP server tool: ${error}`);
    }

    const result = await response.json();
    console.log('[Klavis API] Tool call successful:', { 
      instanceId, 
      toolEndpoint,
      success: true
    });
    return result;
  } catch (error: any) {
    console.error('[Klavis API] Error calling tool:', error);
    throw error;
  }
} 