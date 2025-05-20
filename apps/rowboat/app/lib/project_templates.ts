import { WorkflowTemplate } from "./types/workflow_types";
import { z } from 'zod';

const DEFAULT_MODEL = process.env.PROVIDER_DEFAULT_MODEL || "gpt-4.1";

export const templates: { [key: string]: z.infer<typeof WorkflowTemplate> } = {
    // Default template
    'default': {
        name: 'Blank Template',
        description: 'A blank canvas to build your agents.',
        startAgent: "Example Agent",
        agents: [
            {
                name: "Example Agent",
                type: "conversation",
                description: "An example agent",
                instructions: "## 🧑‍ Role:\nYou are an helpful customer support assistant\n\n---\n## ⚙️ Steps to Follow:\n1. Ask the user what they would like help with\n2. Ask the user for their email address and let them know someone will contact them soon.\n\n---\n## 🎯 Scope:\n✅ In Scope:\n- Asking the user their issue\n- Getting their email\n\n❌ Out of Scope:\n- Questions unrelated to customer support\n- If a question is out of scope, politely inform the user and avoid providing an answer.\n\n---\n## 📋 Guidelines:\n✔️ Dos:\n- ask user their issue\n\n❌ Don'ts:\n- don't ask user any other detail than email",
                model: DEFAULT_MODEL,
                toggleAble: true,
                ragReturnType: "chunks",
                ragK: 3,
                controlType: "retain",
                outputVisibility: "user_facing",
            },
        ],
        prompts: [],
        tools: [
            {
                "name": "web_search",
                "description": "Fetch information from the web based on chat context",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                },
                "isLibrary": true
            },
            {
                "name": "rag_search",
                "description": "Fetch articles with knowledge relevant to the query",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The query to retrieve articles for"
                        }
                    },
                    "required": [
                        "query"
                    ]
                },
                "isLibrary": true
            }
        ],
        
    }
}

export const starting_copilot_prompts: { [key: string]: string } = {
    "Ассистент по кредитным картам": "Создайте ассистента по кредитным картам, который помогает пользователям с вопросами, связанными с кредитными картами, такими как рекомендации по картам, преимущества, бонусы, процесс оформления и общие советы по кредитным картам. Предоставляйте точную и полезную информацию, сохраняя профессиональный и дружелюбный тон.",

    "Ассистент по планированию встреч": "Создайте ассистента по планированию встреч, который помогает пользователям планировать, изменять и управлять своими встречами эффективно. Помогайте находить доступные слоты времени, отправлять напоминания, перепланировывать встречи и отвечать на вопросы о политике и процедурах планирования. Сохраняйте профессиональный и организованный подход.",

    "Ассистент по написанию блогов": "Создайте ассистента по написанию блогов, который помогает пользователям исследовать, собирать, структурировать и писать блоги. Агент по исследованию будет исследовать тему и собирать информацию. Агент по структурированию будет писать пункты для блога. Агент по написанию будет развивать пункты и писать блог. Блог должен быть не менее 1000 слов.",
}