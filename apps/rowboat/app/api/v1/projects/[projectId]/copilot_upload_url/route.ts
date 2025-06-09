import { NextRequest, NextResponse } from 'next/server';
import { dataSourcesCollection, dataSourceDocsCollection, agentWorkflowsCollection } from '@/app/lib/mongodb';
import { ObjectId } from 'mongodb';
import { recrawlWebDataSource } from '@/app/actions/datasource_actions';

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
    const { projectId } = params;
    if (!projectId) {
        return NextResponse.json({ error: 'Missing project ID' }, { status: 400 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    let urls: string[] = [];
    if (typeof body.url === 'string') {
        urls = [body.url];
    } else if (Array.isArray(body.urls)) {
        urls = body.urls.filter((u: any) => typeof u === 'string');
    }
    urls = urls.map(u => u.trim()).filter(u => u.length > 0);
    if (urls.length === 0) {
        return NextResponse.json({ error: 'No URLs provided' }, { status: 400 });
    }

    try {
        const now = new Date().toISOString();
        // Создаём DataSource
        const dataSourceDoc = {
            projectId: projectId,
            active: true,
            name: `Ссылки из чата: ${urls[0]}`,
            description: `Загружено через чат Copilot (${urls.length} ссылок)` ,
            createdAt: now,
            lastUpdatedAt: now,
            attempts: 0,
            version: 1,
            status: 'pending' as const,
            data: {
                type: 'urls' as const,
            },
        };
        const insertResult = await dataSourcesCollection.insertOne(dataSourceDoc);
        const dataSourceId = insertResult.insertedId;
        const dataSourceIdStr = dataSourceId.toString();

        // Создаём DataSourceDoc для каждой ссылки
        await dataSourceDocsCollection.insertMany(urls.map(url => ({
            sourceId: dataSourceId.toString(),
            name: url,
            status: 'pending',
            createdAt: now,
            version: 1,
            data: {
                type: 'url',
                url,
            },
        })));

        // Привязываем источник к ragDataSources всех агентов проекта (и по _id, и по name)
        await agentWorkflowsCollection.updateMany(
            { projectId },
            [{
                $set: {
                    ragDataSources: {
                        $cond: [
                            { $in: [dataSourceIdStr, { $ifNull: ["$ragDataSources", []] }] },
                            "$ragDataSources",
                            { $concatArrays: [ { $ifNull: ["$ragDataSources", []] }, [dataSourceIdStr, dataSourceDoc.name] ] }
                        ]
                    }
                }
            }]
        );

        // Запускаем индексацию (скрейпинг)
        try {
            await recrawlWebDataSource(projectId, dataSourceIdStr);
        } catch (err) {
            console.error('Error triggering recrawlWebDataSource:', err);
            // Можно вернуть warning, но не делать ошибку для пользователя
        }

        return NextResponse.json({ success: true, dataSourceId, urlsCount: urls.length });
    } catch (error) {
        console.error('Error saving urls or creating data source:', error);
        return NextResponse.json({ error: 'Failed to save urls or create data source' }, { status: 500 });
    }
} 