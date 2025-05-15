import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const body = await request.json();
    const { webhookUrl, sendUnknownTools } = body;

    // In production, this would save to your database
    // For now, just return success
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving webhook config:', error);
    return NextResponse.json(
      { error: 'Failed to save webhook configuration' },
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
    const mockConfig = {
      webhookUrl: 'https://example.com/webhook',
      sendUnknownTools: true,
    };

    return NextResponse.json(mockConfig);
  } catch (error) {
    console.error('Error fetching webhook config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch webhook configuration' },
      { status: 500 }
    );
  }
} 