#!/usr/bin/env python3
"""
Автоматическое изменение модели агентов на anthropic/claude-sonnet-4
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db import get_collection
from bson import ObjectId

def update_all_agent_models(target_model="anthropic/claude-sonnet-4"):
    """
    Автоматически изменяет модель всех агентов на указанную
    """
    print(f"🚀 Автоматическое обновление моделей агентов на {target_model}")
    print("=" * 60)
    
    workflows_collection = get_collection('agent_workflows')
    workflows = list(workflows_collection.find({}))
    
    # Сначала показываем статистику
    model_count = {}
    total_agents = 0
    
    for workflow in workflows:
        agents = workflow.get('agents', [])
        for agent in agents:
            model = agent.get('model', 'НЕТ МОДЕЛИ')
            model_count[model] = model_count.get(model, 0) + 1
            total_agents += 1
    
    print(f"📊 Найдено агентов: {total_agents}")
    print("📋 Текущие модели:")
    for model, count in sorted(model_count.items()):
        print(f"   {model}: {count} агентов")
    
    # Обновляем модели
    print(f"\n🔄 Начинаю обновление...")
    
    updated_workflows = 0
    updated_agents = 0
    
    for workflow in workflows:
        workflow_updated = False
        agents = workflow.get('agents', [])
        project_name = ""
        
        # Получаем название проекта если есть
        projects_collection = get_collection('projects')
        project = projects_collection.find_one({"_id": workflow.get('projectId')})
        if project:
            project_name = project.get('name', 'Без имени')
        
        for agent in agents:
            current_model = agent.get('model', '')
            if current_model != target_model:
                old_model = current_model
                agent['model'] = target_model
                workflow_updated = True
                updated_agents += 1
                print(f"   ✏️  '{agent.get('name', 'Без имени')}' ({project_name}): {old_model} → {target_model}")
        
        if workflow_updated:
            # Обновляем весь workflow в базе данных
            workflows_collection.update_one(
                {"_id": workflow["_id"]},
                {"$set": {"agents": agents}}
            )
            updated_workflows += 1
    
    print(f"\n📈 Результат обновления:")
    print(f"   ✅ Обновлено workflow: {updated_workflows}")
    print(f"   ✅ Обновлено агентов: {updated_agents}")
    
    # Проверяем финальный результат
    print(f"\n🔍 Проверка финального состояния...")
    final_model_count = {}
    final_total = 0
    
    workflows = list(workflows_collection.find({}))
    for workflow in workflows:
        agents = workflow.get('agents', [])
        for agent in agents:
            model = agent.get('model', 'НЕТ МОДЕЛИ')
            final_model_count[model] = final_model_count.get(model, 0) + 1
            final_total += 1
    
    print(f"📊 Финальная статистика ({final_total} агентов):")
    for model, count in sorted(final_model_count.items()):
        print(f"   {model}: {count} агентов")
    
    if updated_agents > 0:
        print(f"\n🎉 Успешно обновлено {updated_agents} агентов!")
    else:
        print(f"\n💡 Все агенты уже используют модель {target_model}")

if __name__ == "__main__":
    update_all_agent_models() 