import asyncio
import logging
from typing import List
import json
import os
from openai import OpenAI

from apps.experimental.simulation_runner.scenario_types import TestSimulation, TestResult, AggregateResults, TestScenario

from apps.experimental.simulation_runner.db import write_test_result, get_scenario_by_id

# Проверяем, нужно ли использовать мок
USE_MOCK_ROWBOAT = os.environ.get("MOCK_ROWBOAT", "false").lower() == "true"
USE_DEBUG_ROWBOAT = os.environ.get("DEBUG_ROWBOAT", "false").lower() == "true"

if USE_MOCK_ROWBOAT:
    print("🔧 Используется мок-версия Rowboat для тестирования")
    from mock_rowboat import MockClient as Client, MockStatefulChat as StatefulChat
    # Для мока используем простой класс
    class UserMessage:
        def __init__(self, role: str, content: str):
            self.role = role
            self.content = content
elif USE_DEBUG_ROWBOAT:
    print("🔧 Используется отладочная версия Rowboat для диагностики")
    from debug_rowboat_client import DebugClient as Client, DebugStatefulChat as StatefulChat
    # Для дебага используем простой класс
    class UserMessage:
        def __init__(self, role: str, content: str):
            self.role = role
            self.content = content
else:
    from rowboat import Client, StatefulChat
    from rowboat.schema import UserMessage

openai_client = OpenAI()
MODEL_NAME = "gpt-4o"
ROWBOAT_API_HOST = os.environ.get("ROWBOAT_API_HOST", "http://127.0.0.1:3000").strip()


async def simulate_simulation(
    scenario: TestScenario,
    profile_id: str,
    pass_criteria: str,
    rowboat_client: Client,
    workflow_id: str,
    max_iterations: int = 5,
) -> tuple[str, str, str]:
    """
    Runs a mock simulation for a given TestSimulation asynchronously.
    After simulating several turns of conversation, it evaluates the conversation.
    Returns a tuple of (evaluation_result, details, transcript_str).
    """

    loop = asyncio.get_running_loop()
    pass_criteria = pass_criteria
    
    print(f"🔄 Начинаю симуляцию:")
    print(f"   Сценарий: {scenario.name}")
    print(f"   Profile ID: {profile_id}")
    print(f"   Workflow ID: {workflow_id}")
    print(f"   Max iterations: {max_iterations}")

    # Todo: add profile_id
    support_chat = StatefulChat(rowboat_client, workflow_id=workflow_id)

    messages = [
        {
            "role": "system",
            "content": (
                f"You are role playing a customer talking to a chatbot (the user is role playing the chatbot). Have the following chat with the chatbot. Scenario:\n{scenario.description}. You are provided no other information. If the chatbot asks you for information that is not in context, go ahead and provide one unless stated otherwise in the scenario. Directly have the chat with the chatbot. Start now with your first message."
            ),
        }
    ]

    # -------------------------
    # (1) MAIN SIMULATION LOOP
    # -------------------------
    print(f"🤖 Запуск основного цикла симуляции ({max_iterations} итераций)...")
    global_messages = []
    
    # Добавляем приветственное сообщение в историю, если оно есть
    if len(support_chat.messages) > 0:
        last_agent_message = None
        for msg in reversed(support_chat.messages):
            if (msg.role == 'assistant' and 
                hasattr(msg, 'agenticResponseType') and 
                msg.agenticResponseType == 'external'):
                last_agent_message = msg
                break
        
        if last_agent_message:
            print(f"   📝 Добавляю приветственное сообщение в историю: {last_agent_message.content}")
            global_messages.append({"role": "assistant", "content": last_agent_message.content})
    
    for iteration in range(max_iterations):
        print(f"   Итерация {iteration + 1}/{max_iterations}")
        openai_input = messages

        # Run OpenAI API call in a separate thread (non-blocking)
        print(f"   🧠 Вызов OpenAI API...")
        simulated_user_response = await loop.run_in_executor(
            None,  # default ThreadPool
            lambda: openai_client.chat.completions.create(
                model=MODEL_NAME,
                messages=openai_input,
                temperature=0.0,
            ),
        )

        simulated_content = simulated_user_response.choices[0].message.content.strip()
        print(f"   👤 Сгенерированное сообщение пользователя: {simulated_content}")
        messages.append({"role": "assistant", "content": simulated_content})
        global_messages.append({"role": "user", "content": simulated_content})
        
        # Run Rowboat chat in a thread if it's synchronous
        print(f"   🛥️  Вызов Rowboat API...")
        str_rowboat_response = ""
        try:
            # Сохраняем количество сообщений до вызова
            messages_before = len(support_chat.messages)
            
            rowboat_response = await loop.run_in_executor(
                None,
                lambda: support_chat.run(simulated_content)
            )
            
            # Получаем новые сообщения, добавленные после вызова
            new_messages = support_chat.messages[messages_before:]
            
            print(f"   📥 Получено {len(new_messages)} новых сообщений от Rowboat:")
            
            # Выводим детальные логи всех новых сообщений
            for i, msg in enumerate(new_messages, 1):
                if hasattr(msg, 'agenticSender') and msg.agenticSender:
                    sender = msg.agenticSender
                else:
                    sender = "System"
                
                if msg.role == 'assistant':
                    if hasattr(msg, 'tool_calls') and msg.tool_calls:
                        # Это вызов инструмента
                        print(f"      {i}. 🔧 {sender} вызывает инструмент:")
                        for tool_call in msg.tool_calls:
                            tool_name = tool_call.function.name
                            tool_args = tool_call.function.arguments
                            print(f"         🛠️  {tool_name}({tool_args})")
                            str_rowboat_response += f"Агент '{sender}' вызывает инструмент: {tool_name}({tool_args})\n"
                            # Специальная обработка для transfer_to_agent
                            if tool_name.startswith('transfer_to_'):
                                try:
                                    args_dict = json.loads(tool_args)
                                    target_agent = args_dict.get('assistant', 'Unknown')
                                    print(f"         ➡️  Передача управления: {sender} → {target_agent}")
                                    str_rowboat_response += f"Передача управления: {sender} → {target_agent}\n"
                                except:
                                    print(f"         ➡️  Передача управления от {sender}")
                                    str_rowboat_response += f"Передача управления от {sender}\n"
                    else:
                        # Это обычное сообщение
                        response_type = getattr(msg, 'agenticResponseType', 'unknown')
                        if response_type == 'external':
                            print(f"      {i}. 💬 {sender} (внешний ответ): {msg.content}")
                            str_rowboat_response += f"Агент '{sender}' (внешний ответ): {msg.content}\n"
                        else:
                            print(f"      {i}. 🔄 {sender} (внутренний): {msg.content}")
                            str_rowboat_response += f"Агент '{sender}' (внутренний): {msg.content}\n"
                            
                elif msg.role == 'tool':
                    tool_name = getattr(msg, 'tool_name', 'unknown_tool')
                    print(f"      {i}. ⚙️  Результат {tool_name}: {msg.content[:100]}...")
                    str_rowboat_response += f"Результат {tool_name}: {msg.content}"
                    
                    # Специальная обработка для transfer_to_agent результатов
                    if tool_name == 'transfer_to_agent':
                        try:
                            result_dict = json.loads(msg.content)
                            target_agent = result_dict.get('assistant', 'Unknown')
                            print(f"         ✅ Управление передано агенту: {target_agent}")
                            str_rowboat_response += f"Управление передано агенту: {target_agent}"
                        except:
                            pass
                            
                elif msg.role == 'user':
                    print(f"      {i}. 👤 Пользователь: {msg.content}")
            
            print(f"   🤖 Финальный ответ Rowboat: {rowboat_response}")
            messages.append({"role": "user", "content": rowboat_response})
            if str_rowboat_response == "":
                str_rowboat_response = rowboat_response
            global_messages.append({"role": "assistant", "content": str_rowboat_response})
            
        except Exception as e:
            print(f"   ❌ Ошибка при вызове Rowboat: {e}")
            print(f"   📋 Детали клиента Rowboat:")
            print(f"      Host: {rowboat_client.base_url}")
            print(f"      Headers: {rowboat_client.headers}")
            raise e

    # -------------------------
    # (2) EVALUATION STEP
    # -------------------------
    print(f"📊 Начинаю оценку результатов...")
    
    # swap the roles of the assistant and the user
    transcript_str = ""
    for m in global_messages:
        role = m.get("role", "unknown")
        content = m.get("content", "")
        transcript_str += f"{role.upper()}: {content}\n"

    # # Store the transcript as a JSON string
    transcript = json.dumps(global_messages)

    # We use passCriteria as the evaluation "criteria."
    evaluation_prompt = [
        {
            "role": "system",
            "content": (
                f"You are a neutral evaluator. Evaluate based on these criteria:\n"
                f"{pass_criteria}\n\n"
                "Return ONLY a JSON object in this format:\n"
                '{"verdict": "pass", "details": <reason>} or '
                '{"verdict": "fail", "details": <reason>}.'
            ),
        },
        {
            "role": "user",
            "content": (
                f"Here is the conversation transcript:\n\n{transcript_str}\n\n"
                "Did the support bot answer correctly or not? "
                "Return only 'pass' or 'fail' for verdict, and a brief explanation for details."
            ),
        },
    ]

    # Run evaluation in a separate thread
    print(f"🧠 Вызов OpenAI API для оценки...")
    eval_response = await loop.run_in_executor(
        None,
        lambda: openai_client.chat.completions.create(
            model=MODEL_NAME, messages=evaluation_prompt, temperature=0.0, response_format={"type": "json_object"}
        ),
    )

    if not eval_response.choices:
        raise Exception("No evaluation response received from model")

    response_json_str = eval_response.choices[0].message.content
    # Attempt to parse the JSON
    response_json = json.loads(response_json_str)
    evaluation_result = response_json.get("verdict")
    details = response_json.get("details")

    if evaluation_result is None:
        raise Exception("No 'verdict' field found in evaluation response")

    print(f"✅ Оценка завершена: {evaluation_result} - {details}")
    return (evaluation_result, details, transcript)


async def simulate_simulations(
    simulations: List[TestSimulation], run_id: str, workflow_id: str, api_key: str, max_iterations: int = 5
) -> AggregateResults:
    """
    Simulates a list of TestSimulations asynchronously and aggregates the results.
    """
    if not simulations:
        # Return an empty result if there's nothing to simulate
        return AggregateResults(total=0, pass_=0, fail=0)

    project_id = simulations[0].projectId

    client = Client(host=ROWBOAT_API_HOST, project_id=project_id, api_key=api_key)

    # Store results here
    results: List[TestResult] = []

    for simulation in simulations:
        verdict, details, transcript = await simulate_simulation(
            scenario=get_scenario_by_id(simulation.scenarioId),
            profile_id=simulation.profileId,
            pass_criteria=simulation.passCriteria,
            rowboat_client=client,
            workflow_id=workflow_id,
            max_iterations=max_iterations,
        )

        # Create a new TestResult
        test_result = TestResult(
            projectId=project_id,
            runId=run_id,
            simulationId=simulation.id,
            result=verdict,
            details=details,
            transcript=transcript,
        )
        results.append(test_result)

        # Persist the test result
        write_test_result(test_result)

    # Aggregate pass/fail
    total_count = len(results)
    pass_count = sum(1 for r in results if r.result == "pass")
    fail_count = sum(1 for r in results if r.result == "fail")

    return AggregateResults(total=total_count, passCount=pass_count, failCount=fail_count)
