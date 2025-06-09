import { NextResponse } from 'next/server';
import { dataSourcesCollection } from '@/app/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
    request: Request,
    { params }: { params: { projectId: string } }
) {
    try {
        // Get sourceId from URL if present
        const url = new URL(request.url);
        const sourceId = url.searchParams.get('sourceId');

        if (sourceId) {
            const source = await dataSourcesCollection.findOne({
                _id: new ObjectId(sourceId),
                projectId: params.projectId,
                status: { $ne: 'deleted' }
            });
            
            if (!source) {
                return NextResponse.json({ error: 'Data source not found' }, { status: 404 });
            }
            
            return NextResponse.json(source);
        } else {
            const sources = await dataSourcesCollection.find({
                projectId: params.projectId,
                status: { $ne: 'deleted' }
            }).toArray();
            
            return NextResponse.json(sources);
        }
    } catch (error) {
        console.error('Error fetching data source(s):', error);
        return NextResponse.json({ error: 'Failed to fetch data source(s)' }, { status: 500 });
    }
} 