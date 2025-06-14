#!/usr/bin/env python3
"""
Скрипт для удаления симуляций и сценариев
"""

import sys
from db import get_collection
from bson import ObjectId

def show_scenarios():
    """Показывает все сценарии"""
    print("📋 Сценарии:")
    scenarios_collection = get_collection("test_scenarios")
    scenarios = list(scenarios_collection.find())
    
    if not scenarios:
        print("   Нет сценариев")
        return []
    
    for i, scenario in enumerate(scenarios, 1):
        print(f"   {i}. ID: {scenario['_id']}")
        print(f"      Название: {scenario['name']}")
        print(f"      Проект: {scenario['projectId']}")
        print(f"      Описание: {scenario['description'][:100]}...")
        print()
    
    return scenarios

def show_simulations():
    """Показывает все симуляции"""
    print("🔄 Симуляции:")
    simulations_collection = get_collection("test_simulations")
    simulations = list(simulations_collection.find())
    
    if not simulations:
        print("   Нет симуляций")
        return []
    
    for i, simulation in enumerate(simulations, 1):
        print(f"   {i}. ID: {simulation['_id']}")
        print(f"      Название: {simulation['name']}")
        print(f"      Проект: {simulation['projectId']}")
        print(f"      Сценарий ID: {simulation['scenarioId']}")
        print(f"      Критерии: {simulation['passCriteria'][:80]}...")
        print()
    
    return simulations

def show_runs():
    """Показывает все запуски"""
    print("▶️  Запуски:")
    runs_collection = get_collection("test_runs")
    runs = list(runs_collection.find())
    
    if not runs:
        print("   Нет запусков")
        return []
    
    for i, run in enumerate(runs, 1):
        print(f"   {i}. ID: {run['_id']}")
        print(f"      Название: {run['name']}")
        print(f"      Проект: {run['projectId']}")
        print(f"      Статус: {run['status']}")
        print(f"      Симуляции: {run.get('simulationIds', [])}")
        print()
    
    return runs

def show_results():
    """Показывает все результаты"""
    print("📊 Результаты:")
    results_collection = get_collection("test_results")
    results = list(results_collection.find())
    
    if not results:
        print("   Нет результатов")
        return []
    
    for i, result in enumerate(results, 1):
        print(f"   {i}. ID: {result['_id']}")
        print(f"      Проект: {result['projectId']}")
        print(f"      Запуск ID: {result['runId']}")
        print(f"      Результат: {result['result']}")
        print()
    
    return results

def delete_by_project():
    """Удаление по проекту"""
    print("\n🏢 Удаление по проекту")
    
    # Показываем доступные проекты
    all_collections = ["test_scenarios", "test_simulations", "test_runs", "test_results"]
    projects = set()
    
    for collection_name in all_collections:
        collection = get_collection(collection_name)
        docs = collection.find({}, {"projectId": 1})
        for doc in docs:
            if "projectId" in doc:
                projects.add(doc["projectId"])
    
    if not projects:
        print("   Нет проектов с данными")
        return
    
    print("   Доступные проекты:")
    project_list = list(projects)
    for i, project_id in enumerate(project_list, 1):
        print(f"   {i}. {project_id}")
    
    try:
        choice = input(f"\n   Введите номер проекта (1-{len(project_list)}) или 'q' для отмены: ").strip()
        if choice.lower() == 'q':
            return
        
        project_index = int(choice) - 1
        if project_index < 0 or project_index >= len(project_list):
            print("   ❌ Неверный номер")
            return
        
        selected_project = project_list[project_index]
        print(f"\n   Выбран проект: {selected_project}")
        
        # Показываем что будет удалено
        total_count = 0
        for collection_name in all_collections:
            collection = get_collection(collection_name)
            count = collection.count_documents({"projectId": selected_project})
            if count > 0:
                print(f"   {collection_name}: {count} записей")
                total_count += count
        
        if total_count == 0:
            print("   Нет данных для удаления")
            return
        
        confirm = input(f"\n   ⚠️  Удалить ВСЕ данные проекта {selected_project}? (да/нет): ").strip().lower()
        if confirm in ['да', 'yes', 'y']:
            deleted_total = 0
            for collection_name in all_collections:
                collection = get_collection(collection_name)
                result = collection.delete_many({"projectId": selected_project})
                if result.deleted_count > 0:
                    print(f"   ✅ Удалено из {collection_name}: {result.deleted_count} записей")
                    deleted_total += result.deleted_count
            
            print(f"\n   🎉 Всего удалено: {deleted_total} записей")
        else:
            print("   ❌ Удаление отменено")
            
    except (ValueError, IndexError):
        print("   ❌ Неверный ввод")

def delete_individual():
    """Удаление отдельных элементов"""
    while True:
        print("\n🗑️  Удаление отдельных элементов")
        print("   1. Сценарии")
        print("   2. Симуляции") 
        print("   3. Запуски")
        print("   4. Результаты")
        print("   5. Назад")
        
        choice = input("\n   Выберите тип для удаления (1-5): ").strip()
        
        if choice == '1':
            delete_scenarios()
        elif choice == '2':
            delete_simulations()
        elif choice == '3':
            delete_runs()
        elif choice == '4':
            delete_results()
        elif choice == '5':
            break
        else:
            print("   ❌ Неверный выбор")

def delete_scenarios():
    """Удаление сценариев"""
    scenarios = show_scenarios()
    if not scenarios:
        return
    
    try:
        choice = input(f"\n   Введите номер сценария для удаления (1-{len(scenarios)}) или 'q' для отмены: ").strip()
        if choice.lower() == 'q':
            return
        
        index = int(choice) - 1
        if index < 0 or index >= len(scenarios):
            print("   ❌ Неверный номер")
            return
        
        scenario = scenarios[index]
        print(f"\n   Будет удален сценарий:")
        print(f"   ID: {scenario['_id']}")
        print(f"   Название: {scenario['name']}")
        
        confirm = input("\n   ⚠️  Подтвердить удаление? (да/нет): ").strip().lower()
        if confirm in ['да', 'yes', 'y']:
            scenarios_collection = get_collection("test_scenarios")
            result = scenarios_collection.delete_one({"_id": scenario['_id']})
            if result.deleted_count > 0:
                print("   ✅ Сценарий удален")
            else:
                print("   ❌ Ошибка удаления")
        else:
            print("   ❌ Удаление отменено")
            
    except (ValueError, IndexError):
        print("   ❌ Неверный ввод")

def delete_simulations():
    """Удаление симуляций"""
    simulations = show_simulations()
    if not simulations:
        return
    
    try:
        choice = input(f"\n   Введите номер симуляции для удаления (1-{len(simulations)}) или 'q' для отмены: ").strip()
        if choice.lower() == 'q':
            return
        
        index = int(choice) - 1
        if index < 0 or index >= len(simulations):
            print("   ❌ Неверный номер")
            return
        
        simulation = simulations[index]
        print(f"\n   Будет удалена симуляция:")
        print(f"   ID: {simulation['_id']}")
        print(f"   Название: {simulation['name']}")
        
        confirm = input("\n   ⚠️  Подтвердить удаление? (да/нет): ").strip().lower()
        if confirm in ['да', 'yes', 'y']:
            simulations_collection = get_collection("test_simulations")
            result = simulations_collection.delete_one({"_id": simulation['_id']})
            if result.deleted_count > 0:
                print("   ✅ Симуляция удалена")
            else:
                print("   ❌ Ошибка удаления")
        else:
            print("   ❌ Удаление отменено")
            
    except (ValueError, IndexError):
        print("   ❌ Неверный ввод")

def delete_runs():
    """Удаление запусков"""
    runs = show_runs()
    if not runs:
        return
    
    try:
        choice = input(f"\n   Введите номер запуска для удаления (1-{len(runs)}) или 'q' для отмены: ").strip()
        if choice.lower() == 'q':
            return
        
        index = int(choice) - 1
        if index < 0 or index >= len(runs):
            print("   ❌ Неверный номер")
            return
        
        run = runs[index]
        print(f"\n   Будет удален запуск:")
        print(f"   ID: {run['_id']}")
        print(f"   Название: {run['name']}")
        print(f"   Статус: {run['status']}")
        
        confirm = input("\n   ⚠️  Подтвердить удаление? (да/нет): ").strip().lower()
        if confirm in ['да', 'yes', 'y']:
            runs_collection = get_collection("test_runs")
            result = runs_collection.delete_one({"_id": run['_id']})
            if result.deleted_count > 0:
                print("   ✅ Запуск удален")
                
                # Также удаляем связанные результаты
                results_collection = get_collection("test_results")
                results_result = results_collection.delete_many({"runId": str(run['_id'])})
                if results_result.deleted_count > 0:
                    print(f"   ✅ Удалено связанных результатов: {results_result.deleted_count}")
            else:
                print("   ❌ Ошибка удаления")
        else:
            print("   ❌ Удаление отменено")
            
    except (ValueError, IndexError):
        print("   ❌ Неверный ввод")

def delete_results():
    """Удаление результатов"""
    results = show_results()
    if not results:
        return
    
    try:
        choice = input(f"\n   Введите номер результата для удаления (1-{len(results)}) или 'q' для отмены: ").strip()
        if choice.lower() == 'q':
            return
        
        index = int(choice) - 1
        if index < 0 or index >= len(results):
            print("   ❌ Неверный номер")
            return
        
        result_doc = results[index]
        print(f"\n   Будет удален результат:")
        print(f"   ID: {result_doc['_id']}")
        print(f"   Запуск ID: {result_doc['runId']}")
        print(f"   Результат: {result_doc['result']}")
        
        confirm = input("\n   ⚠️  Подтвердить удаление? (да/нет): ").strip().lower()
        if confirm in ['да', 'yes', 'y']:
            results_collection = get_collection("test_results")
            result = results_collection.delete_one({"_id": result_doc['_id']})
            if result.deleted_count > 0:
                print("   ✅ Результат удален")
            else:
                print("   ❌ Ошибка удаления")
        else:
            print("   ❌ Удаление отменено")
            
    except (ValueError, IndexError):
        print("   ❌ Неверный ввод")

def clear_all():
    """Полная очистка всех данных"""
    print("\n💀 ПОЛНАЯ ОЧИСТКА ВСЕХ ДАННЫХ")
    print("   ⚠️  ВНИМАНИЕ: Это удалит ВСЕ сценарии, симуляции, запуски и результаты!")
    
    collections = ["test_scenarios", "test_simulations", "test_runs", "test_results"]
    total_count = 0
    
    for collection_name in collections:
        collection = get_collection(collection_name)
        count = collection.count_documents({})
        if count > 0:
            print(f"   {collection_name}: {count} записей")
            total_count += count
    
    if total_count == 0:
        print("   Нет данных для удаления")
        return
    
    print(f"\n   Всего будет удалено: {total_count} записей")
    
    deleted_total = 0
    for collection_name in collections:
        collection = get_collection(collection_name)
        result = collection.delete_many({})
        if result.deleted_count > 0:
            print(f"   ✅ Очищена коллекция {collection_name}: {result.deleted_count} записей")
            deleted_total += result.deleted_count
    
    print(f"\n   🎉 Полная очистка завершена! Удалено: {deleted_total} записей")

def main():
    """Главное меню"""
    while True:
        print("\n" + "=" * 60)
        print("   УПРАВЛЕНИЕ ДАННЫМИ СИМУЛЯЦИЙ")
        print("=" * 60)
        
        print("   1. Показать все данные")
        print("   2. Удалить по проекту")
        print("   3. Удалить отдельные элементы")
        print("   4. Полная очистка (ОПАСНО!)")
        print("   5. Выход")
        
        choice = input("\n   Выберите действие (1-5): ").strip()
        
        if choice == '1':
            print("\n" + "=" * 40)
            show_scenarios()
            print("\n" + "=" * 40)
            show_simulations()
            print("\n" + "=" * 40)
            show_runs()
            print("\n" + "=" * 40)
            show_results()
            
        elif choice == '2':
            delete_by_project()
            
        elif choice == '3':
            delete_individual()
            
        elif choice == '4':
            clear_all()
            
        elif choice == '5':
            print("   👋 До свидания!")
            break
            
        else:
            print("   ❌ Неверный выбор")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n   ❌ Прервано пользователем")
    except Exception as e:
        print(f"\n   ❌ Ошибка: {e}") 