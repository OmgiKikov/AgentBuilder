import asyncio
import os
import json
import sys

# Добавляем корневую директорию проекта в путь поиска модулей
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)


from apps.experimental.simulation_runner.db import get_collection
from apps.experimental.simulation_runner.update_models_auto import update_all_agent_models
from apps.experimental.simulation_runner.unpublish_all_auto import unpublish_all_workflows
from apps.experimental.simulation_runner.update_models_auto import update_all_agent_models
from apps.experimental.simulation_runner.fix_published_workflows import fix_published_workflows
from apps.experimental.simulation_runner.update_runtime_auto import auto_update_runtime_workflows
from apps.experimental.simulation_runner.update_designtime_auto import auto_update_designtime_workflows
from create_real_test_data import create_real_test_data
from cleanup_data import clear_all
from main_run_time import run_batch_simulations

if __name__ == "__main__":
    name_model = "qwen/qwen-2.5-72b-instruct"
    filepath_runtime = "benchmark/run_time/runtime.json"
    filepath_designtime = "benchmark/design_time/designtime.json"
    # Нулевой этап 
    unpublish_all_workflows()
    update_all_agent_models(name_model)
    fix_published_workflows()
    auto_update_runtime_workflows(filepath_runtime) 
    auto_update_designtime_workflows(filepath_designtime)
    # Первый этам - удаление всего
    clear_all()
    # Второй этап - добавление сценариев
    with open(filepath_runtime, 'r', encoding='utf-8') as f:
        runtime_data = json.load(f)
    for test_info in runtime_data:
        create_real_test_data(test_info)
    # Третий этап - запуск оценки
    
    asyncio.run(run_batch_simulations(name_model)) 

