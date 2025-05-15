import { NextResponse } from 'next/server';
import { storeKlavisServer, removeKlavisServer, getKlavisServer, listKlavisServers } from '@/app/actions/klavis_actions';

// List MCP servers
export async function GET(request: Request) {
  try {
    console.log('API Key exists:', !!process.env.KLAVIS_API_KEY);
    
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');
    const userId = searchParams.get('userId');

    // If userId is provided, get servers from MongoDB
    if (userId) {
      const servers = await listKlavisServers(userId);
      return NextResponse.json({ servers });
    }

    // If instanceId is provided, get tools for that instance
    const endpoint = instanceId 
      ? `https://api.klavis.ai/mcp-server/instance/${instanceId}/tools`
      : 'https://api.klavis.ai/mcp-server/servers';

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
    });

    console.log('Klavis API Response:', {
      status: response.status,
      statusText: response.statusText,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Klavis API Error:', {
        status: response.status,
        statusText: response.statusText,
        error,
        headers: Object.fromEntries(response.headers.entries())
      });
      return NextResponse.json(
        { error: `Failed to fetch data: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('Klavis API Success:', data);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error in Klavis API route:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
    return NextResponse.json(
      { error: error.message || 'Failed to fetch data' },
      { status: 500 }
    );
  }
}

// Create MCP server instance
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { serverName, userId, platformName, instanceId, toolEndpoint, params } = body;

    // Handle tool calls if instanceId and toolEndpoint are provided
    if (instanceId && toolEndpoint) {
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
        return NextResponse.json(
          { error: `Failed to call tool: ${error}` },
          { status: response.status }
        );
      }

      return NextResponse.json(await response.json());
    }

    // Create new server instance
    const response = await fetch('https://api.klavis.ai/mcp-server/instance/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        serverName,
        userId,
        platformName,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Failed to create server instance: ${error}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    
    // Store server information in MongoDB
    await storeKlavisServer({
      serverName,
      userId,
      serverUrl: result.serverUrl,
      instanceId: result.instanceId
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in Klavis API route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}

// Update MCP server (tools, auth)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { instanceId, action, toolId, enabled, authToken } = body;

    if (!instanceId) {
      return NextResponse.json(
        { error: 'Instance ID is required' },
        { status: 400 }
      );
    }

    let endpoint = `https://api.klavis.ai/mcp-server/${instanceId}`;
    let method = 'PUT';
    let requestBody = {};

    switch (action) {
      case 'toggleTool':
        if (!toolId) {
          return NextResponse.json(
            { error: 'Tool ID is required' },
            { status: 400 }
          );
        }
        endpoint += `/tools/${toolId}`;
        requestBody = { enabled };
        break;
      case 'setAuth':
        if (!authToken) {
          return NextResponse.json(
            { error: 'Auth token is required' },
            { status: 400 }
          );
        }
        endpoint += '/auth';
        method = 'POST';
        requestBody = { authToken };
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    const response = await fetch(endpoint, {
      method,
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Failed to update server: ${error}` },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in Klavis API route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update server' },
      { status: 500 }
    );
  }
}

// Delete MCP server instance
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');

    if (!instanceId) {
      return NextResponse.json(
        { error: 'Instance ID is required' },
        { status: 400 }
      );
    }

    // Get server info before deletion
    const serverInfo = await getKlavisServer(instanceId);

    const response = await fetch(`https://api.klavis.ai/mcp-server/instance/${instanceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.KLAVIS_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Failed to delete server instance: ${error}` },
        { status: response.status }
      );
    }

    // Remove server information from MongoDB
    if (serverInfo) {
      await removeKlavisServer(instanceId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in Klavis API route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete server instance' },
      { status: 500 }
    );
  }
} 