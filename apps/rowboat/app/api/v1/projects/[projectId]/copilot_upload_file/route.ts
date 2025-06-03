import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { dataSourcesCollection, dataSourceDocsCollection, agentWorkflowsCollection } from '@/app/lib/mongodb';
import { ObjectId } from 'mongodb';

const UPLOADS_DIR = process.env.RAG_UPLOADS_DIR || '/uploads';

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
    const { projectId } = params;
    if (!projectId) {
        return NextResponse.json({ error: 'Missing project ID' }, { status: 400 });
    }

    // Получаем файл из FormData
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Генерируем уникальный fileId и путь
    const fileId = new ObjectId().toString();
    const filePath = path.join(UPLOADS_DIR, fileId);

    try {
        // Сохраняем файл
        const arrayBuffer = await file.arrayBuffer();
        await fs.writeFile(filePath, new Uint8Array(arrayBuffer));

        // Создаем DataSource
        const now = new Date().toISOString();
        const dataSourceDoc = {
            projectId: projectId,
            active: true,
            name: `Файл из чата: ${file.name}`,
            description: `Загружено через чат Copilot (${file.name})`,
            createdAt: now,
            lastUpdatedAt: now,
            attempts: 0,
            version: 1,
            data: {
                type: 'files_local' as const,
            },
        };
        const insertResult = await dataSourcesCollection.insertOne(dataSourceDoc);
        const dataSourceId = insertResult.insertedId;
        const dataSourceIdStr = dataSourceId.toString();

        // Создаем DataSourceDoc для файла
        await dataSourceDocsCollection.insertOne({
            sourceId: dataSourceIdStr,
            name: file.name,
            status: 'pending',
            createdAt: now,
            version: 1,
            data: {
                type: 'file_local',
                name: file.name,
                size: file.size,
                mimeType: file.type,
            },
        });

        // Привязываем источник к ragDataSources всех агентов проекта
        await agentWorkflowsCollection.updateMany(
            { projectId },
            [{
                $set: {
                    ragDataSources: {
                        $cond: [
                            { $in: [dataSourceIdStr, { $ifNull: ["$ragDataSources", []] }] },
                            "$ragDataSources",
                            { $concatArrays: [ { $ifNull: ["$ragDataSources", []] }, [dataSourceIdStr] ] }
                        ]
                    }
                }
            }]
        );

        return NextResponse.json({ success: true, dataSourceId, fileId });
    } catch (error) {
        console.error('Error saving file or creating data source:', error);
        return NextResponse.json({ error: 'Failed to save file or create data source' }, { status: 500 });
    }
} 