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

export interface WhiteLabelingConfig {
  client_id: string;
  client_secret: string;
  server_name: string;
  redirect_url: string;
  scope: string;
  account_id: string;
}

// Add interface for MongoDB document
interface KlavisHostedTool {
  serverName: string;
  userId: string;
  serverUrl: string;
  instanceId: string;
  isAuthenticated: boolean;
  createdAt: Date;
}

// Initialize collection
const klavisHostedToolsCollection = db.collection<KlavisHostedTool>("klavis_hosted_tools");

// Helper functions for MongoDB operations
async function storeKlavisServer(data: Omit<KlavisHostedTool, 'createdAt'>) {
  try {
    const result = await klavisHostedToolsCollection.insertOne({
      ...data,
      createdAt: new Date()
    });
    console.log('[MongoDB] Stored server:', data.serverName);
    return result;
  } catch (error) {
    console.error('[MongoDB] Store error:', error);
    throw error;
  }
}

async function removeKlavisServer(instanceId: string) {
  try {
    const result = await klavisHostedToolsCollection.deleteOne({ instanceId });
    console.log('[MongoDB] Removed server:', { instanceId, success: result.acknowledged });
    return result;
  } catch (error) {
    console.error('[MongoDB] Remove error:', error);
    throw error;
  }
}

async function getKlavisServer(instanceId: string) {
  try {
    const server = await klavisHostedToolsCollection.findOne({ instanceId });
    console.log('[MongoDB] Found server:', server?.serverName);
    return server;
  } catch (error) {
    console.error('[MongoDB] Get error:', error);
    throw error;
  }
}

async function listKlavisServers(userId: string) {
  try {
    const servers = await klavisHostedToolsCollection.find({ userId }).toArray();
    console.log('[MongoDB] Listed servers:', { count: servers.length });
    return servers;
  } catch (error) {
    console.error('[MongoDB] List error:', error);
    throw error;
  }
}

// Lists all available MCP servers that can be enabled
export async function listAvailableMcpServers(): Promise<McpServerResponse> {
  try {
    const response = await fetch('https://api.klavis.ai/mcp-server/servers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Klavis API error:', error);
      return { data: null, error: `Failed to list MCP servers: ${error}` };
    }

    const rawData = await response.json();
    
    if (!rawData || !rawData.servers || !Array.isArray(rawData.servers)) {
      console.error('Invalid response format');
      return { data: null, error: 'Invalid response format from server' };
    }

    // Transform the data to match our expected format
    const transformedData = await Promise.all(rawData.servers.map(async (server: RawMcpServer) => {
      let mongoServer = await klavisHostedToolsCollection.findOne({
        serverName: server.name
      });

      let isAuthenticated = false;
      let instanceId = server.id;
      let serverUrl = server.serverUrl;

      if (mongoServer?.instanceId) {
        try {
          const instanceResponse = await fetch(`https://api.klavis.ai/mcp-server/instance/get/${mongoServer.instanceId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });

          if (instanceResponse.ok) {
            const instanceData = await instanceResponse.json();
            isAuthenticated = instanceData.isAuthenticated;
            instanceId = mongoServer.instanceId;
            serverUrl = mongoServer.serverUrl;

            if (mongoServer?.isAuthenticated !== isAuthenticated) {
              await klavisHostedToolsCollection.updateOne(
                { instanceId: mongoServer.instanceId },
                { $set: { isAuthenticated } }
              );
              console.log('Updated auth status:', { server: server.name, isAuthenticated });
            }
          } else {
            await klavisHostedToolsCollection.deleteOne({ instanceId: mongoServer.instanceId });
            mongoServer = null;
            console.log('Cleaned up stale instance:', server.name);
          }
        } catch (error) {
          console.error('Instance check error:', { server: server.name, error });
          if (mongoServer) {
            isAuthenticated = mongoServer.isAuthenticated;
            instanceId = mongoServer.instanceId;
            serverUrl = mongoServer.serverUrl;
          }
        }
      }

      return {
        ...server,
        instanceId,
        serverName: server.name,
        serverUrl,
        isActive: !!mongoServer,
        isAuthenticated
      };
    }));

    console.log('Servers fetched:', { count: transformedData.length });
    return { data: transformedData, error: null };
  } catch (error: any) {
    console.error('Server list error:', error.message);
    return { data: null, error: error.message || 'An unexpected error occurred' };
  }
}

// Lists all active server instances for a given user
export async function listActiveServerInstances(userId: string): Promise<McpServer[]> {
  try {
    console.log('[MongoDB] Listing active server instances for user:', { userId });
    
    // Get all servers from MongoDB for this user
    const mongoServers = await klavisHostedToolsCollection.find({ userId }).toArray();
    console.log('[MongoDB] Found server records:', {
      count: mongoServers.length,
      serverNames: mongoServers.map(s => s.serverName)
    });

    // Verify each server instance is still active
    const activeServers = await Promise.all(mongoServers.map(async (server) => {
      try {
        const instanceResponse = await fetch(`https://api.klavis.ai/mcp-server/instance/get/${server.instanceId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        if (!instanceResponse.ok) {
          // Instance is no longer active, clean up MongoDB record
          console.log('[MongoDB] Cleaning up inactive server:', {
            serverName: server.serverName,
            instanceId: server.instanceId
          });
          await klavisHostedToolsCollection.deleteOne({ _id: server._id });
          return null;
        }

        // Get server details
        const serverDetails = await instanceResponse.json();
        const mcpServer: McpServer = {
          id: server.instanceId,
          name: server.serverName,
          description: serverDetails.description || '',
          tools: serverDetails.tools || [],
          instanceId: server.instanceId,
          serverName: server.serverName,
          serverUrl: server.serverUrl,
          isActive: true
        };
        return mcpServer;
      } catch (error) {
        console.error('[MongoDB] Error checking server instance:', {
          error,
          serverName: server.serverName,
          instanceId: server.instanceId
        });
        return null;
      }
    }));

    // Filter out null values (inactive servers) and ensure type safety
    const validServers = activeServers.filter((server): server is McpServer => server !== null);
    console.log('[MongoDB] Active server instances:', {
      count: validServers.length,
      servers: validServers.map(server => ({
        name: server.serverName,
        id: server.instanceId
      }))
    });

    return validServers;
  } catch (error) {
    console.error('[MongoDB] Error listing active server instances:', error);
    throw error;
  }
}

// Update the original listMcpServers to use the new functions
export async function listMcpServers(): Promise<McpServerResponse> {
  try {
    // Get all available servers
    const availableServers = await listAvailableMcpServers();
    if (availableServers.error || !availableServers.data) {
      return availableServers;
    }

    return availableServers;
  } catch (error: any) {
    console.error('Error in listMcpServers:', error);
    return { data: null, error: error.message || 'An unexpected error occurred' };
  }
}

export async function createMcpServerInstance(
  serverName: string,
  userId: string,
  platformName: string,
): Promise<{ serverUrl: string; instanceId: string }> {
  try {
    console.log('Creating MCP server instance with:', { serverName, userId, platformName });
    
    const requestBody = {
      serverName,
      userId,
      platformName,
    };
    console.log('Request body:', requestBody);

    const response = await fetch('https://api.klavis.ai/mcp-server/instance/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Create instance response status:', response.status);
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Error creating instance:', {
        status: response.status,
        statusText: response.statusText,
        error
      });
      throw new Error(`Failed to create MCP server instance: ${error}`);
    }

    const result = await response.json();
    console.log('Create instance successful:', result);
    return result;
  } catch (error: any) {
    console.error('Error creating MCP server instance:', error);
    throw error;
  }
}

export async function enableServer(
  serverName: string,
  userId: string,
  enabled: boolean
): Promise<{ instanceId?: string; serverUrl?: string }> {
  try {
    console.log('Toggle server:', { serverName, enabled });
    
    if (enabled) {
      const result = await createMcpServerInstance(serverName, userId, "Rowboat");
      console.log('Created server:', serverName);

      await storeKlavisServer({
        serverName,
        userId,
        serverUrl: result.serverUrl,
        instanceId: result.instanceId,
        isAuthenticated: false
      });
      
      return result;
    } else {
      const mongoServer = await klavisHostedToolsCollection.findOne({ 
        serverName,
        userId 
      });
      
      if (mongoServer?.instanceId) {
        try {
          const checkResponse = await fetch(`https://api.klavis.ai/mcp-server/instance/get/${mongoServer.instanceId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });

          if (checkResponse.status === 404) {
            await removeKlavisServer(mongoServer.instanceId);
            console.log('Cleaned up non-existent instance:', serverName);
            return {};
          }

          if (checkResponse.ok) {
            await deleteMcpServerInstance(mongoServer.instanceId);
            await removeKlavisServer(mongoServer.instanceId);
            console.log('Deleted server:', serverName);
            return {};
          }

          const error = await checkResponse.text();
          throw new Error(`Instance check failed: ${error}`);
        } catch (error) {
          if (error instanceof Error && error.message.includes('Not Found')) {
            await removeKlavisServer(mongoServer.instanceId);
            console.log('Cleaned up after not found:', serverName);
            return {};
          }
          throw error;
        }
      }
      return {};
    }
  } catch (error: any) {
    console.error('Toggle error:', { server: serverName, error: error.message });
    throw error;
  }
}

export async function listMcpServerTools(instanceId: string): Promise<McpTool[]> {
  try {
    const response = await fetch(`https://api.klavis.ai/mcp-server/instance/${instanceId}/tools`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list MCP server tools: ${error}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('Error listing MCP server tools:', error);
    throw error;
  }
}

export async function setMcpServerAuthToken(
  instanceId: string,
  authToken: string,
): Promise<void> {
  try {
    const response = await fetch(`https://api.klavis.ai/mcp-server/instance/${instanceId}/auth`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ authToken }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to set MCP server auth token: ${error}`);
    }
  } catch (error: any) {
    console.error('Error setting MCP server auth token:', error);
    throw error;
  }
}

export async function deleteMcpServerInstance(instanceId: string): Promise<void> {
  try {
    const response = await fetch(`https://api.klavis.ai/mcp-server/instance/delete/${instanceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      console.log('Instance already deleted:', instanceId);
      return;
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Delete failed: ${error}`);
    }

    const result = await response.json();
    console.log('Deleted instance:', instanceId);
  } catch (error: any) {
    console.error('Delete error:', error.message);
    throw error;
  }
}

export async function callMcpServerTool(
  instanceId: string,
  toolEndpoint: string,
  params: Record<string, any>,
): Promise<any> {
  try {
    const response = await fetch(`https://api.klavis.ai/mcp-server/instance/${instanceId}/tools${toolEndpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to call MCP server tool: ${error}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('Error calling MCP server tool:', error);
    throw error;
  }
}

export async function createWhiteLabeling(config: WhiteLabelingConfig) {
  try {
    const response = await fetch('https://api.klavis.ai/white-labeling/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating white labeling:', error);
    throw error;
  }
}

export async function getWhiteLabeling(clientId: string) {
  try {
    const response = await fetch(`https://api.klavis.ai/white-labeling/get/${clientId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting white labeling:', error);
    throw error;
  }
}

// Export MongoDB helper functions
export { storeKlavisServer, removeKlavisServer, getKlavisServer, listKlavisServers }; 