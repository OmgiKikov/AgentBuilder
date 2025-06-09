from simple_chat_client import SimpleCopilotClient, UserMessage, evaluation

def make_request(api_key, project_id):
    client = SimpleCopilotClient(
        base_url="http://localhost:3002",
        api_key=api_key,
        rowboat_base_url="http://localhost:3000"
    )
    
    if not client.health_check():
        print("❌ Сервер недоступен! Убедитесь, что сервер запущен на http://localhost:3002")
        exit(1)
    else:
        print("✅ Сервер доступен!")
    
    if client.load_workflow_from_project(project_id):
        print("✅ Workflow успешно загружен!")
    else:
        print("❌ Не удалось загрузить workflow, используем дефолтный")
        client.workflow = client._get_default_workflow()
    
    # Показываем информацию о workflow
    print("\n=== Информация о workflow ===")
    workflow = client.workflow or client._get_default_workflow()
    print(f"Название: {workflow.get('name', 'Без имени')}")
    print("Интсрументы:", workflow.get('tools', 'Без тулов'))
    print(f"Найдено агентов: {len(workflow.get('agents', []))}")
    for agent in workflow.get('agents', []):
        print(f"- {agent.get('name', 'Без имени')}: {agent.get('description', 'Без описания')}")
    
    print("\n=== Получение полного ответа ===")
    messages = [
        UserMessage(content="Создай агента который будет использовать калькулятор"),
    ]
    
    try:
        full_response = client.get_full_response(
            messages=messages
        )
        messages = [{'name': "user", "value": "Создай агента который будет использовать калькулятор"}, {"value": full_response, "name": "assistent"}]
        transcript_str = ""
        for i in messages:
            transcript_str += f'{i["name"]}: {i["value"]}\n'
        pass_criteria = "Copilot создал агента с инструментов @tool:calculator"
        evaluation_result, details = evaluation(pass_criteria, transcript_str)
        print("Полный ответ:", full_response)
        print('---')
        print("Вердикт:", evaluation_result)
        print("Детали:", details)
    except Exception as e:
        print(f"❌ Ошибка: {e}")

if __name__ == "__main__":
    api_key="b298b02db079c98c1e726627ed8eb97a226381035ec5c15e12236db08c1cd2e3"
    project_id = "f6004ec7-cdff-4ec7-815d-b7afaffb4031"
    make_request(api_key, project_id)