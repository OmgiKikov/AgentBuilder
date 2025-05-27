import { projectsCollection } from "../../lib/mongodb";

export async function GET(): Promise<Response> {
    try {
        // Возвращаем все проекты без авторизации для простоты
        const projects = await projectsCollection.find({}).toArray();
        return Response.json(projects);
    } catch (error) {
        console.error('Error fetching projects:', error);
        return Response.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }
} 