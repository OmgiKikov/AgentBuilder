# import sys
# import os
# # Добавляем корневую директорию проекта в sys.path
# sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from simple_chat_client import SimpleCopilotClient, UserMessage, AssistantMessage
from get_workflow import get_project_info
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

def process_project(project_info, messages):
    """Создает клиент, выполняет запрос для одного проекта и возвращает результат."""
    start_time = time.time()
    project_name = project_info['name']
    try:
        # Для каждого потока создаем свой клиент
        client = SimpleCopilotClient(
            base_url="http://localhost:3002",
            api_key=project_info['api_key'],
            rowboat_base_url="http://localhost:3000"
        )
        client.load_workflow_from_project(project_info['id'])
        client.get_full_response(messages=messages)
        end_time = time.time()
        return {"project_name": project_name, "latency": end_time - start_time, "error": None}
    except Exception as e:
        end_time = time.time()
        return {"project_name": project_name, "latency": end_time - start_time, "error": e}

# --- Ввод и получение информации о проектах ---
project_names_input = input("Введите названия проектов через запятую: ")
project_names = [name.strip() for name in project_names_input.split(',') if name.strip()]

projects_info = []
for name in project_names:
    try:
        project_id, project_api_key = get_project_info(name)
        projects_info.append({"name": name, "id": project_id, "api_key": project_api_key})
        print(f"Проект '{name}' успешно загружен.")
    except Exception as e:
        print(f"Ошибка при получении информации для проекта '{name}': {e}")

# --- Настройки для нагрузочного теста ---
MESSAGES = [UserMessage(content="Создай мне агента который будет решать математические задачи")]

# --- Выполнение параллельных запросов ---
latencies = []
errors = []
# События для оценки одновременности: (timestamp, +1/-1)
concurrency_events = []
start_total_time = time.time()

if projects_info:
    NUM_PROJECTS = len(projects_info)
    with ThreadPoolExecutor(max_workers=NUM_PROJECTS) as executor:
        futures = {}
        for proj_info in projects_info:
            print(f"{time.strftime('%X')} ▶️  Старт '{proj_info['name']}'")
            start_ts = time.time()
            concurrency_events.append((start_ts, 1))
            future = executor.submit(process_project, proj_info, MESSAGES)
            futures[future] = start_ts, proj_info['name']

        for future in as_completed(futures):
            start_ts, proj_name = futures[future]
            result = future.result()
            end_ts = start_ts + result['latency']
            concurrency_events.append((end_ts, -1))
            print(f"{time.strftime('%X')} ⏹️  Финиш '{proj_name}' за {result['latency']:.2f} c")
            latencies.append(result['latency'])
            if result['error']:
                errors.append(result)

    end_total_time = time.time()
    total_execution_time = end_total_time - start_total_time

    # --- Анализ одновременности ---
    # Сортируем события по времени и считаем максимум параллельных запросов
    concurrency_events.sort(key=lambda x: x[0])
    current = 0
    max_concurrency = 0
    for ts, delta in concurrency_events:
        current += delta
        if current > max_concurrency:
            max_concurrency = current

    # --- Расчет метрик ---
    num_requests = len(projects_info)
    successful_requests = num_requests - len(errors)
    average_latency = sum(latencies) / len(latencies) if latencies else 0
    throughput = successful_requests / total_execution_time if total_execution_time > 0 else 0
    error_rate = (len(errors) / num_requests) * 100 if num_requests > 0 else 0

    # --- Вывод результатов ---
    print("\n--- Метрики производительности ---")
    print(f"Всего проектов (запросов): {num_requests}")
    print(f"Успешных запросов: {successful_requests}")
    print(f"Ошибок: {len(errors)}")
    print(f"Общее время выполнения: {total_execution_time:.2f} секунд")
    print(f"Среднее время ответа (Latency): {average_latency:.2f} секунд")
    print(f"Пропускная способность (Throughput): {throughput:.2f} запросов/секунду")
    print(f"Процент ошибок (Error Rate): {error_rate:.2f}%")
    print(f"Максимальная одновременность: {max_concurrency}")

    if errors:
        print("\n--- Детали ошибок ---")
        for i, error_info in enumerate(errors, 1):
            print(f"Ошибка {i} в проекте '{error_info['project_name']}': {error_info['error']}")
else:
    print("Не было предоставлено ни одного корректного проекта для тестирования.")
