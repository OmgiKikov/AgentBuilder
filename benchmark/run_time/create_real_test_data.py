from datetime import datetime, timezone
from bson import ObjectId
import sys
import os 

# Добавляем корневую директорию проекта в путь поиска модулей
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from apps.experimental.simulation_runner.db import get_collection
import json

def create_real_test_data(test_info):
    """
    Создает тестовые данные с реальными project_id и workflow_id
    """
    print("🚀 Создание тестовых данных с реальными ID...")
    
    
    # 0d7b099e-e9de-46d9-af6a-238d4ffdc58d - 682ec065938b40039d5bf7ec
    # c3b22e6f-fb29-44eb-a2db-f2af4fe199ca - 6834050b3e2b3ae5ac7f4ea1
    REAL_PROJECT_ID = test_info["REAL_PROJECT_ID"]
    REAL_WORKFLOW_ID = test_info["REAL_WORKFLOW_ID"]
    
    print(f"   📋 Project ID: {REAL_PROJECT_ID}")
    print(f"   🔄 Workflow ID: {REAL_WORKFLOW_ID}")
    
    # Получаем краткое имя проекта для уникальности
    project_short_name = REAL_PROJECT_ID[:8]  # Первые 8 символов ID
    
    # # Очищаем старые тестовые данные только для этого проекта
    # collections_to_clear = ["test_scenarios", "test_simulations", "test_runs", "test_results"]
    # for collection_name in collections_to_clear:
    #     collection = get_collection(collection_name)
    #     result = collection.delete_many({
    #         "projectId": REAL_PROJECT_ID,
    #         "name": {"$regex": "^Реальный тест"}
    #     })
    #     if result.deleted_count > 0:
    #         print(f"   Очищено {result.deleted_count} старых записей из {collection_name} для проекта {REAL_PROJECT_ID}")
    
    # 1. Создаем тестовый сценарий
    scenario_id = str(ObjectId())
    test_scenario = {
        "_id": ObjectId(scenario_id),
        "projectId": REAL_PROJECT_ID,
        "name": test_info["scenario_name"],
        "description": test_info["scenario_description"],
        "createdAt": datetime.now(timezone.utc),
        "lastUpdatedAt": datetime.now(timezone.utc)
    }
    
    scenarios_collection = get_collection("test_scenarios")
    scenarios_collection.insert_one(test_scenario)
    print(f"   ✓ Сценарий: {scenario_id}")
    
    # 2. Создаем тестовую симуляцию
    simulation_id = str(ObjectId())
    test_simulation = {
        "_id": ObjectId(simulation_id),
        "projectId": REAL_PROJECT_ID,
        "name": test_info["simulation_name"],
        "scenarioId": scenario_id,
        "profileId": test_info["profileId"],
        "passCriteria": test_info["passCriteria"],
        "createdAt": datetime.now(timezone.utc),
        "lastUpdatedAt": datetime.now(timezone.utc)
    }
    
    simulations_collection = get_collection("test_simulations")
    simulations_collection.insert_one(test_simulation)
    print(f"   ✓ Симуляция: {simulation_id}")
    
    # 3. Создаем тестовый запуск
    run_id = str(ObjectId())
    test_run = {
        "_id": ObjectId(run_id),
        "projectId": REAL_PROJECT_ID,
        "name": f"Реальный тестовый запуск ({project_short_name})",
        "simulationIds": [simulation_id],
        "workflowId": REAL_WORKFLOW_ID,  # Используем реальный workflow ID
        "status": "pending",
        "startedAt": datetime.now(timezone.utc),
        "completedAt": None,
        "aggregateResults": None,
        "lastHeartbeat": None
    }
    
    runs_collection = get_collection("test_runs")
    runs_collection.insert_one(test_run)
    print(f"   ✓ Запуск: {run_id} (статус: pending)")
    
    print("\n🎉 Реальные тестовые данные созданы!")
    print(f"   📋 Сценарий ID: {scenario_id}")
    print(f"   🔄 Симуляция ID: {simulation_id}")
    print(f"   ▶️  Запуск ID: {run_id}")
    print(f"   🏢 Проект: {REAL_PROJECT_ID}")
    print(f"   ⚡ Workflow: {REAL_WORKFLOW_ID}")
    print("\nТеперь запуск service.py должен работать с реальными ID!")
    
    return run_id

if __name__ == "__main__":
    with open('benchmark/run_time/runtime.json', 'r', encoding='utf-8') as f:
        runtime_data = json.load(f)
    for test_info in runtime_data:
        create_real_test_data(test_info) 