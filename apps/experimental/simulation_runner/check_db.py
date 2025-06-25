import sys
import os
# Добавляем текущую директорию в путь для поиска модулей
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from db import get_collection
from bson import ObjectId
import json

def get_simulation_pairs():
    """
    Возвращает список пар (scenario_id, simulation_id) для обработки
    с дополнительными данными из runtime.json
    """
    simulations_collection = get_collection("test_simulations")
    simulations = list(simulations_collection.find())
    
    # Загружаем данные из runtime.json
    runtime_file = 'benchmark_DJ/run_time/runtime.json'
    runtime_data = {}
    
    if os.path.exists(runtime_file):
        try:
            with open(runtime_file, 'r', encoding='utf-8') as f:
                runtime_list = json.load(f)
                # Преобразуем список в словарь по project_id для быстрого поиска
                for item in runtime_list:
                    project_id = item.get('simulation_name')
                    if project_id:
                        runtime_data[project_id] = item
        except Exception as e:
            print(f"⚠️  Ошибка загрузки runtime.json: {e}")
    
    # Получаем workflow маппинг из базы данных
    workflows_collection = get_collection('agent_workflows')
    workflows = list(workflows_collection.find({}))
    workflow_map = {}
    for workflow in workflows:
        project_id = workflow.get('projectId')
        workflow_id = str(workflow['_id'])
        workflow_map[project_id] = workflow_id
    
    pairs = []
    for sim in simulations:
        scenario_id = sim.get("scenarioId")
        simulation_id = str(sim["_id"])
        project_id = sim.get("projectId")
        name = sim.get("name", "Без названия")
        
        if scenario_id and simulation_id:
            # Базовые данные из базы
            pair_data = {
                "scenario_id": scenario_id,
                "simulation_id": simulation_id,
                "project_id": project_id,
                "name": name
            }
            
            # Добавляем workflow_id из базы данных
            if project_id in workflow_map:
                pair_data["workflow_id"] = workflow_map[project_id]
            
            # Добавляем дополнительные данные из runtime.json
            if name in runtime_data:
                runtime_info = runtime_data[name]
                pair_data.update({
                    "REAL_WORKFLOW_ID": runtime_info.get("REAL_WORKFLOW_ID"),
                    "scenario_name": runtime_info.get("scenario_name"),
                    "scenario_description": runtime_info.get("scenario_description"),
                    "simulation_name": runtime_info.get("simulation_name"),
                    "profileId": runtime_info.get("profileId"),
                    "passCriteria": runtime_info.get("passCriteria"),
                    "MAX_DIALOG_ITERATIONS": runtime_info.get("MAX_DIALOG_ITERATIONS", 2)
                })
                
                # Используем workflow_id из runtime.json, если он есть
                if runtime_info.get("REAL_WORKFLOW_ID"):
                    pair_data["workflow_id"] = runtime_info["REAL_WORKFLOW_ID"]
            else:
                # Значения по умолчанию, если нет данных в runtime.json
                pair_data.update({
                    "MAX_DIALOG_ITERATIONS": 2,
                    "profileId": "real_test_profile",
                    "passCriteria": "Бот должен ответить корректно и вежливо"
                })
            
            pairs.append(pair_data)
    
    return pairs

def check_database():
    """
    Проверяет содержимое базы данных
    """
    print("=== Проверка содержимого базы данных ===\n")
    
    # Проверяем коллекции
    collections_to_check = [
        "test_scenarios",
        "test_simulations", 
        "test_runs",
        "test_results",
        "api_keys"
    ]
    
    for collection_name in collections_to_check:
        print(f"📁 Коллекция: {collection_name}")
        collection = get_collection(collection_name)
        
        # Получаем все документы
        documents = list(collection.find())
        print(f"   Количество документов: {len(documents)}")
        
        # Показываем первые несколько документов
        for i, doc in enumerate(documents[:3]):
            print(f"   Документ {i+1}:")
            for key, value in doc.items():
                if key == "_id":
                    print(f"      {key}: {value}")
                else:
                    print(f"      {key}: {value}")
            print()
        
        if len(documents) > 3:
            print(f"   ... и еще {len(documents) - 3} документов\n")
        else:
            print()
    
    # Специально проверяем pending runs
    print("🔍 Поиск pending runs:")
    runs_collection = get_collection("test_runs")
    pending_runs = list(runs_collection.find({"status": "pending"}))
    print(f"   Найдено pending runs: {len(pending_runs)}")
    
    for run in pending_runs:
        print(f"   - ID: {run['_id']}, статус: {run['status']}, проект: {run['projectId']}")
    
    # Показываем доступные пары для симуляции
    print("\n📋 Доступные симуляции для обработки:")
    pairs = get_simulation_pairs()
    for i, pair in enumerate(pairs, 1):
        print(f"   {i}. {pair['name']}")
        print(f"      Проект: {pair['project_id']}")
        print(f"      Сценарий: {pair['scenario_id']}")
        print(f"      Симуляция: {pair['simulation_id']}")
        print()
    
    return pairs

if __name__ == "__main__":
    check_database() 