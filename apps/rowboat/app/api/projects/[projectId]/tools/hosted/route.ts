import { NextResponse } from 'next/server';
import { listMcpServerTools } from '@/app/actions/klavis_actions';

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    // For demo purposes, we'll return some mock data
    // In production, this would fetch from Klavis API
    const mockTools = [
      {
        id: 'github-mcp',
        name: 'GitHub',
        isConnected: false,
        tools: [
          {
            id: 'create-issue',
            name: 'Create Issue',
            endpoint: '/create-issue',
            needsAuth: true,
          },
          {
            id: 'get-repo-data',
            name: 'Get Repository Data',
            endpoint: '/get-repo-data',
            needsAuth: true,
          },
        ],
      },
      {
        id: 'notion-mcp',
        name: 'Notion',
        isConnected: false,
        tools: [
          {
            id: 'create-page',
            name: 'Create Page',
            endpoint: '/create-page',
            needsAuth: true,
          },
          {
            id: 'search-db',
            name: 'Search Database',
            endpoint: '/search-db',
            needsAuth: true,
          },
        ],
      },
    ];

    return NextResponse.json(mockTools);
  } catch (error) {
    console.error('Error fetching hosted tools:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hosted tools' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const body = await request.json();
    const { serverId, action } = body;

    // Handle different actions (connect, disconnect, etc.)
    switch (action) {
      case 'connect':
        // Implementation for connecting to a server
        break;
      case 'disconnect':
        // Implementation for disconnecting from a server
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error handling hosted tools action:', error);
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    );
  }
} 