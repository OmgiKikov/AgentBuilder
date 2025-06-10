#!/usr/bin/env python3
"""
Устанавливает publishedWorkflowId для проектов
"""

import sys
import os
# Добавляем текущую директорию в путь для поиска модулей
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from db import get_collection
from bson import ObjectId

def fix_published_workflows():
    """
    Устанавливает publishedWorkflowId для всех проектов
    """
    print("🔧 Устанавливаю publishedWorkflowId для проектов...")
    
    # Получаем все workflows
    workflows_collection = get_collection('agent_workflows')
    workflows = list(workflows_collection.find({}))
    
    # Создаем маппинг project_id -> workflow_id
    project_workflow_map = {}
    for workflow in workflows:
        project_id = workflow.get('projectId')
        workflow_id = str(workflow['_id'])
        project_workflow_map[project_id] = workflow_id
    
    # Обновляем проекты
    projects_collection = get_collection('projects')
    updated_count = 0
    
    for project_id, workflow_id in project_workflow_map.items():
        result = projects_collection.update_one(
            {"_id": project_id},
            {"$set": {"publishedWorkflowId": workflow_id}}
        )
        if result.modified_count > 0:
            updated_count += 1
            print(f"   ✅ Проект {project_id[:8]}... → workflow {workflow_id}")
    
    print(f"\n🎉 Обновлено проектов: {updated_count}")

if __name__ == "__main__":
    fix_published_workflows() 