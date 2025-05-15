import { NextResponse } from 'next/server';
import {
  createMcpServerInstance,
  deleteMcpServerInstance,
  listMcpServerTools,
} from '@/app/actions/klavis_actions';

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const body = await request.json();
    const { name, url } = body;

    const result = await createMcpServerInstance(
      name,
      params.projectId,
      'Rowboat'
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error creating custom server:', error);
    return NextResponse.json(
      { error: 'Failed to create custom server' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    // In production, this would fetch from your database
    // For now, return mock data
    const mockServers = [
      {
        id: 'custom-1',
        name: 'Custom Server 1',
        url: 'https://api.example.com',
        tools: [
          {
            id: 'tool-1',
            name: 'Generate PDF',
            endpoint: '/generate-pdf',
            isEnabled: true,
          },
          {
            id: 'tool-2',
            name: 'Summarize Article',
            endpoint: '/summarize-article',
            isEnabled: false,
          },
        ],
      },
    ];

    return NextResponse.json(mockServers);
  } catch (error) {
    console.error('Error fetching custom servers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch custom servers' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const url = new URL(request.url);
    const serverId = url.searchParams.get('serverId');

    if (!serverId) {
      return NextResponse.json(
        { error: 'Server ID is required' },
        { status: 400 }
      );
    }

    await deleteMcpServerInstance(serverId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting custom server:', error);
    return NextResponse.json(
      { error: 'Failed to delete custom server' },
      { status: 500 }
    );
  }
} 