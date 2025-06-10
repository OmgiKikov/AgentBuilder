#!/usr/bin/env python3
"""
Проверка workflow в базе данных
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db import get_collection
from bson import ObjectId

def check_workflows():
    """
    Проверяет workflow в коллекции agent_workflows
    """
    print("=== WORKFLOW В КОЛЛЕКЦИИ agent_workflows ===")
    
    # Проверяем коллекцию agent_workflows
    workflows_collection = get_collection('agent_workflows')
    workflows = list(workflows_collection.find({}))
    
    print(f"Всего workflow: {len(workflows)}")
    
    if not workflows:
        print("❌ Workflow не найдены!")
        return
    
    for i, workflow in enumerate(workflows, 1):
        print(f"\n{i}. Workflow ID: {workflow['_id']}")
        print(f"   Проект: {workflow.get('projectId', 'НЕТ')}")
        print(f"   Название: {workflow.get('name', 'НЕТ')}")
        print(f"   Создан: {workflow.get('createdAt', 'НЕТ')}")
        print(f"   Агенты: {len(workflow.get('agents', []))}")
        print(f"   Инструменты: {len(workflow.get('tools', []))}")
        
        # Показываем первые несколько агентов
        agents = workflow.get('agents', [])
        if agents:
            print(f"   Агенты:")
            for j, agent in enumerate(agents[:3], 1):
                print(f"     {j}. {agent.get('name', 'Без имени')}")
    
    print("\n=== PUBLISHED WORKFLOW ID В ПРОЕКТАХ ===")
    
    # Проверяем publishedWorkflowId в проектах
    projects_collection = get_collection('projects')
    projects = list(projects_collection.find({}))
    
    for project in projects:
        project_id = project['_id']
        project_name = project.get('name', 'Без имени')
        published_id = project.get('publishedWorkflowId')
        print(f"Проект {project_id[:8]}... ({project_name}): publishedWorkflowId = {published_id}")
    
    print("\n=== СОПОСТАВЛЕНИЕ ПРОЕКТОВ И WORKFLOW ===")
    
    # Группируем workflow по проектам
    workflow_by_project = {}
    for workflow in workflows:
        project_id = workflow.get('projectId')
        if project_id not in workflow_by_project:
            workflow_by_project[project_id] = []
        workflow_by_project[project_id].append(workflow)
    
    # Показываем для каждого проекта
    for project in projects:
        project_id = project['_id']
        project_name = project.get('name', 'Без имени')
        project_workflows = workflow_by_project.get(project_id, [])
        published_id = project.get('publishedWorkflowId')
        
        print(f"\n🏢 Проект: {project_name} - {project_id}")
        
        for workflow in project_workflows:
            workflow_id = str(workflow['_id'])
            workflow_name = workflow.get('name', 'Без имени')
            is_published = "✅ PUBLISHED" if workflow_id == published_id else ""
            print(f"     - {workflow_id} ({workflow_name})")

if __name__ == "__main__":
    check_workflows() 