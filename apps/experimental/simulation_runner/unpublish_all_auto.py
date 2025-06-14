#!/usr/bin/env python3
"""
Автоматическое снятие publishedWorkflowId со всех проектов
"""

import sys
import os
# Добавляем текущую директорию в путь для поиска модулей
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from db import get_collection
from bson import ObjectId

def unpublish_all_workflows():
    """
    Автоматически снимает publishedWorkflowId со всех проектов
    """
    print("🔓 Автоматическое снятие публикации со всех проектов")
    print("=" * 55)
    
    projects_collection = get_collection('projects')
    
    # Сначала показываем статистику
    print("📊 Проверяю текущий статус...")
    all_projects = list(projects_collection.find({}))
    published_projects = [p for p in all_projects if p.get('publishedWorkflowId')]
    unpublished_projects = [p for p in all_projects if not p.get('publishedWorkflowId')]
    
    print(f"   📌 Опубликованных проектов: {len(published_projects)}")
    print(f"   📝 Не опубликованных проектов: {len(unpublished_projects)}")
    
    if not published_projects:
        print("\n💡 Все проекты уже не опубликованы и доступны для редактирования!")
        return 0
    
    print(f"\n🔄 Снимаю публикацию с {len(published_projects)} проектов...")
    
    updated_count = 0
    for project in published_projects:
        project_id = project['_id']
        project_name = project.get('name', 'Без имени')
        published_id = project.get('publishedWorkflowId')
        
        # Снимаем публикацию
        result = projects_collection.update_one(
            {"_id": project_id},
            {"$unset": {"publishedWorkflowId": ""}}
        )
        
        if result.modified_count > 0:
            updated_count += 1
            print(f"   🔓 '{project_name}' ({project_id[:8]}...): снята публикация {published_id[:8]}...")
    
    print(f"\n📈 Результат:")
    print(f"   ✅ Снята публикация с {updated_count} проектов")
    print(f"   📝 Всего доступно для редактирования: {len(all_projects)} проектов")
    
    # Финальная проверка
    print(f"\n🔍 Финальная проверка...")
    final_published = list(projects_collection.find({"publishedWorkflowId": {"$exists": True, "$ne": None}}))
    final_unpublished = list(projects_collection.find({"$or": [
        {"publishedWorkflowId": {"$exists": False}},
        {"publishedWorkflowId": None}
    ]}))
    
    print(f"   📌 Опубликованных проектов: {len(final_published)}")
    print(f"   📝 Доступных для редактирования: {len(final_unpublished)}")
    
    if len(final_published) == 0:
        print(f"\n🎉 Отлично! Все проекты теперь доступны для редактирования!")
    else:
        print(f"\n⚠️  Остались опубликованными {len(final_published)} проектов")
    
    return updated_count

# if __name__ == "__main__":
#     unpublish_all_workflows() 