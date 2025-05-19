import '../lib/loadenv';
import { qdrantClient } from '../lib/qdrant';

const EMBEDDING_VECTOR_SIZE = Number(process.env.EMBEDDING_VECTOR_SIZE) || 1536;

(async () => {
    try {
        const result = await qdrantClient.createCollection('embeddings', {
            vectors: {
                size: EMBEDDING_VECTOR_SIZE,
                distance: 'Dot',
            },
        });
        console.log(`Create qdrant collection 'embeddings' completed with result: ${result}`);
    } catch (error: any) {
        // Проверяем, является ли ошибка конфликтом (коллекция уже существует)
        if (error && error.toString && error.toString().includes('Conflict')) {
            console.log("Collection 'embeddings' already exists, skipping creation");
        } else {
            console.error(`Error while setting up qdrant collection 'embeddings': ${error}`);
        }
    }
})();