#!/usr/bin/env python3
"""
Пакетная обработка симуляций
"""

import asyncio
import os
import json
import sys
from datetime import datetime, timezone
from bson import ObjectId

# Добавляем корневую директорию проекта в путь поиска модулей
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from apps.experimental.simulation_runner.db import get_collection
from apps.experimental.simulation_runner.service import JobService
from apps.experimental.simulation_runner.check_db import get_simulation_pairs

def json_serializer(obj):
    """Кастомный сериализатор для JSON"""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def create_test_run(project_id: str, workflow_id: str, simulation_id: str, simulation_name: str):
    """
    Создает новый тестовый запуск для одной симуляции
    """
    runs_collection = get_collection("test_runs")
    
    # Создаем НОВЫЙ запуск
    run_id = str(ObjectId())
    test_run = {
        "_id": ObjectId(run_id),
        "projectId": project_id,
        "name": f"Автотест: {simulation_name}",
        "simulationIds": [simulation_id],
        "workflowId": workflow_id,
        "status": "pending",
        "startedAt": datetime.now(timezone.utc),
        "completedAt": None,
        "aggregateResults": None,
        "lastHeartbeat": None
    }
    
    runs_collection.insert_one(test_run)
    return run_id

async def run_single_simulation(simulation_data: dict, workflow_id: str, max_dialog_iterations: int = 2):
    """
    Запускает одну симуляцию
    """
    print("=" * 80)
    print(f"   ЗАПУСК СИМУЛЯЦИИ: {simulation_data['name']}")
    print("=" * 80)
    
    # Настройки API
    os.environ["ROWBOAT_API_HOST"] = "http://127.0.0.1:3000"
    
    print(f"🏢 Проект: {simulation_data['project_id']}")
    print(f"⚡ Workflow: {workflow_id}")
    print(f"📋 Сценарий: {simulation_data['scenario_id']}")
    print(f"🔄 Симуляция: {simulation_data['simulation_id']}")
    print(f"💬 Итераций диалога: {max_dialog_iterations}")
    
    # Создаем запуск
    run_id = create_test_run(
        project_id=simulation_data['project_id'],
        workflow_id=workflow_id,
        simulation_id=simulation_data['simulation_id'],
        simulation_name=simulation_data['name']
    )
    print(f"▶️  Запуск: {run_id} (статус: pending)")
    
    # Запускаем сервис
    print("🚀 Запуск сервиса...")
    service = JobService()
    
    try:
        await service.poll_and_process_jobs(max_iterations_pre_m=20, max_iterations=max_dialog_iterations, target_run_id=run_id)
    except Exception as e:
        print(f"❌ Ошибка сервиса: {e}")
        import traceback
        traceback.print_exc()
        return None
    
    # Проверяем результаты
    runs_collection = get_collection("test_runs")
    final_run = runs_collection.find_one({"_id": ObjectId(run_id)})
    
    results_collection = get_collection("test_results")
    test_results = list(results_collection.find({"runId": run_id}))
    
    print(f"\n📊 Результаты симуляции '{simulation_data['name']}':")
    if final_run:
        print(f"   Статус: {final_run['status']}")
        if final_run.get('aggregateResults'):
            results = final_run['aggregateResults']
            print(f"   Всего: {results.get('total', 0)}")
            print(f"   Успешно: {results.get('passCount', 0)}")
            print(f"   Неудачно: {results.get('failCount', 0)}")
    
    last_result = None
    if test_results:
        for i, test_result in enumerate(test_results, 1):
            print(f"   Результат {i}: {test_result.get('result', 'unknown')}")
            print(f"   Детали: {test_result.get('details', 'нет деталей')[:100]}...")
            last_result = test_result
    else:
        print("   ⚠️  Результаты отсутствуют")
    
    print()
    return {
        "simulation_name": simulation_data['name'],
        "run_id": run_id,
        "status": final_run['status'] if final_run else "unknown",
        "results_count": len(test_results),
        "result": last_result
    }

def get_project_workflow_mapping():
    """
    Получает маппинг проектов на их workflow ID из базы данных
    """
    workflows_collection = get_collection('agent_workflows')
    workflows = list(workflows_collection.find({}))
    
    project_workflow_map = {}
    for workflow in workflows:
        project_id = workflow.get('projectId')
        workflow_id = str(workflow['_id'])
        project_workflow_map[project_id] = workflow_id
    
    return project_workflow_map

async def run_batch_simulations(name_model):
    """
    Запускает все доступные симуляции поочередно
    """
    print("=" * 80)
    print("   ПАКЕТНАЯ ОБРАБОТКА СИМУЛЯЦИЙ")
    print("=" * 80)
    
    # Получаем список симуляций с полными данными из runtime.json
    simulation_pairs = get_simulation_pairs()
    
    if not simulation_pairs:
        print("❌ Симуляции не найдены!")
        return
    
    print(f"📋 Найдено симуляций: {len(simulation_pairs)}")
    
    # Очищаем ВСЕ старые запуски и результаты
    runs_collection = get_collection("test_runs")
    results_collection = get_collection("test_results")
    
    # Очищаем все запуски со статусом pending или running
    deleted_runs = runs_collection.delete_many({
        "$or": [
            {"status": "pending"},
            {"status": "running"},
            {"name": {"$regex": "^Автотест:"}}
        ]
    })
    deleted_results = results_collection.delete_many({})
    print(f"\n🧹 Очищено {deleted_runs.deleted_count} старых запусков")
    print(f"🧹 Очищено {deleted_results.deleted_count} старых результатов")
    print()
    
    # Обрабатываем каждую симуляцию
    batch_results = []
    
    for i, simulation_data in enumerate(simulation_pairs, 1):
        project_id = simulation_data["project_id"]
        workflow_id = simulation_data.get("workflow_id")
        max_iterations = simulation_data.get("MAX_DIALOG_ITERATIONS", 2)
        
        # Проверяем, есть ли workflow для этого проекта
        if not workflow_id:
            print(f"⚠️  Пропускаем проект {project_id[:8]}... - workflow не найден")
            continue
        
        print(f"🔄 Обработка {i}/{len(simulation_pairs)}")
        
        result = await run_single_simulation(
            simulation_data=simulation_data,
            workflow_id=workflow_id,  # Используем workflow_id из get_simulation_pairs()
            max_dialog_iterations=max_iterations  # Используем MAX_DIALOG_ITERATIONS из runtime.json
        )
        result["scenario_name"] = simulation_data["scenario_name"]
        if result:
            batch_results.append(result)
        
        # Небольшая пауза между симуляциями
        if i < len(simulation_pairs):
            print("⏳ Пауза 3 секунды перед следующей симуляцией...")
            await asyncio.sleep(3)
    
    # Итоговый отчет
    print("=" * 80)
    print("   ИТОГОВЫЙ ОТЧЕТ")
    print("=" * 80)
    
    for result in batch_results:
        print(f"✅ {result['simulation_name']}: {result['status']} ({result['results_count']} результатов)")
    
    print(f"\n🎉 Обработано симуляций: {len(batch_results)}/{len(simulation_pairs)}")

    for item in batch_results:
        try:
            transcript_str = item.get("result", {}).get("transcript")
            if transcript_str and isinstance(transcript_str, str):
                try:
                    item["result"]["transcript"] = json.loads(transcript_str)
                except json.JSONDecodeError:
                    # Если вдруг невалидный JSON — можно залогировать или оставить как есть
                    pass
        except:
            pass
    
    # Заменяем недопустимые символы в имени файла
    safe_name_model = name_model.replace('/', '_').replace('\\', '_').replace(':', '_').replace('*', '_').replace('?', '_').replace('"', '_').replace('<', '_').replace('>', '_').replace('|', '_')
    
    with open(f"benchmark/run_time/run_time_result_{safe_name_model}.json", 'w', encoding='utf-8') as f:
        json.dump(batch_results, f, ensure_ascii=False, indent=4, default=json_serializer)

if __name__ == "__main__":
    name_model = "qwen/qwen-2.5-72b-instruct"
    asyncio.run(run_batch_simulations(name_model)) 