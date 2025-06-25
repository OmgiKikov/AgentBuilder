import sys
import os
# Добавляем корневую директорию проекта в sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from apps.experimental.simulation_runner.db import get_collection

def get_project_info(request_project_name):
    workflows_collection = get_collection('agent_workflows')
    workflows = list(workflows_collection.find({}))

    # Проверяем publishedWorkflowId в проектах
    projects_collection = get_collection('projects')
    projects = list(projects_collection.find({}))

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

        if request_project_name == project_name:
            print(f"\n🏢 Проект: {project_name} - {project_id}")
            
            workflow = project_workflows[-1]
            workflow_id = str(workflow['projectId'])
            published_id = str(workflow["_id"])
            return workflow_id, published_id