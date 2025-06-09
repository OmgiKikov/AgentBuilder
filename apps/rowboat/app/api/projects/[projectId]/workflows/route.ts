import { agentWorkflowsCollection } from "../../../../lib/mongodb";

export async function GET(
    request: Request,
    { params }: { params: { projectId: string } }
): Promise<Response> {
    try {
        const { projectId } = params;
        
        // Получаем все workflows для проекта
        const workflows = await agentWorkflowsCollection.find({
            projectId: projectId,
        }).sort({ lastUpdatedAt: -1 }).toArray();

        // Преобразуем ObjectId в строку для JSON сериализации
        const workflowsWithStringId = workflows.map((workflow: any) => ({
            ...workflow,
            _id: workflow._id.toString(),
        }));

        return Response.json(workflowsWithStringId);
    } catch (error) {
        console.error('Error fetching workflows:', error);
        return Response.json({ error: 'Failed to fetch workflows' }, { status: 500 });
    }
} 