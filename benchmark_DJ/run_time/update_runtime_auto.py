#!/usr/bin/env python3
"""
Автоматическое обновление REAL_WORKFLOW_ID в runtime.json
"""

import sys
import os
import json
from datetime import datetime

# Добавляем текущую директорию в путь для поиска модулей
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from db import get_collection

def auto_update_runtime_workflows(filepath="runtime.json"):
    """
    Автоматически обновляет REAL_WORKFLOW_ID в runtime.json
    """
    print("🔄 Автоматическое обновление runtime.json")
    print("=" * 45)
    
    # Загружаем runtime.json
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            runtime_data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Файл {filepath} не найден")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ Ошибка парсинга JSON: {e}")
        return False
    
    print(f"📊 Найдено тестовых сценариев: {len(runtime_data)}")
    
    workflows_collection = get_collection('agent_workflows')
    projects_collection = get_collection('projects')
    
    updated_count = 0
    
    for i, scenario in enumerate(runtime_data):
        project_id = scenario.get('REAL_PROJECT_ID')
        current_workflow_id = scenario.get('REAL_WORKFLOW_ID')
        scenario_name = scenario.get('scenario_name', f'Сценарий {i+1}')
        
        if not project_id:
            print(f"   ⚠️  Сценарий '{scenario_name}': отсутствует REAL_PROJECT_ID")
            continue
        
        # Получаем название проекта
        project = projects_collection.find_one({"_id": project_id})
        project_name = project.get('name', 'Неизвестный проект') if project else 'Неизвестный проект'
        
        # Ищем последний workflow для проекта
        workflows = list(workflows_collection.find(
            {"projectId": project_id}
        ).sort("createdAt", -1))
        
        if not workflows:
            print(f"   ❌ Сценарий '{scenario_name}' ({project_name}): workflow не найден")
            continue
        
        latest_workflow = workflows[0]
        latest_workflow_id = str(latest_workflow['_id'])
        workflow_name = latest_workflow.get('name', 'Без имени')
        
        if current_workflow_id == latest_workflow_id:
            print(f"   ✅ Сценарий '{scenario_name}' ({project_name}): актуальный workflow")
        else:
            # Обновляем workflow ID
            old_id = current_workflow_id[:8] + "..." if current_workflow_id else "НЕТ"
            scenario['REAL_WORKFLOW_ID'] = latest_workflow_id
            updated_count += 1
            print(f"   🔄 Сценарий '{scenario_name}' ({project_name}): {old_id} → {latest_workflow_id[:8]}... ({workflow_name})")
    
    if updated_count > 0:
        # Создаем резервную копию
        backup_filepath = f"{filepath}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        with open(filepath, 'r', encoding='utf-8') as src, open(backup_filepath, 'w', encoding='utf-8') as dst:
            dst.write(src.read())
        print(f"📋 Создана резервная копия: {backup_filepath}")
        
        # Сохраняем обновленные данные
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(runtime_data, f, indent=4, ensure_ascii=False)
        
        print(f"\n📈 Результат:")
        print(f"   ✅ Обновлено сценариев: {updated_count}")
        print(f"   💾 Файл сохранен: {filepath}")
        print(f"\n🎉 Все workflow ID обновлены на последние версии!")
    else:
        print(f"\n💡 Все сценарии уже используют последние версии workflow")
    
    return updated_count > 0

# if __name__ == "__main__":
#     filepath = "benchmark/run_time/runtime.json"
#     auto_update_runtime_workflows(filepath) 