import asyncio
import os
import json
import sys

# Добавляем корневую директорию проекта в путь поиска модулей
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Add the python-sdk path
python_sdk_src_path = os.path.join(project_root, 'apps', 'python-sdk', 'src')
if python_sdk_src_path not in sys.path:
    sys.path.insert(0, python_sdk_src_path)

from get_workflow import get_project_info
from apps.experimental.simulation_runner.db import get_collection
from update_models_auto import update_all_agent_models
from unpublish_all_auto import unpublish_all_workflows
from fix_published_workflows import fix_published_workflows
from update_runtime_auto import auto_update_runtime_workflows
from update_designtime_auto import auto_update_designtime_workflows
from create_real_test_data import create_real_test_data
from cleanup_data import clear_all
from main_run_time import run_batch_simulations

if __name__ == "__main__":
    project_names_input = input("Введите названия проектов через запятую: ")
    project_names = [name.strip() for name in project_names_input.split(',') if name.strip()]

    name_model = "google/gemini-2.5-pro"
    filepath_runtime = "benchmark_DJ/run_time/runtime.json"
    filepath_designtime = "benchmark_DJ/design_time/designtime.json"
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
    for idx, test_info in enumerate(runtime_data):
        if test_info["project_name"] in project_names:
            project_id, project_api_key = get_project_info(test_info["project_name"])
            test_info["REAL_PROJECT_ID"] = project_id
            test_info["REAL_WORKFLOW_ID"] = project_api_key
            create_real_test_data(test_info)
            runtime_data[idx] = test_info
    # Третий этап - запуск оценки
    asyncio.run(run_batch_simulations(name_model)) 

