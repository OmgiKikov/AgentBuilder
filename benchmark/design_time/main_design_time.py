import asyncio
import json
import os
import sys
from typing import List, Dict, Any, Optional
from openai import OpenAI

# Добавляем корневую директорию проекта в путь поиска модулей
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from apps.copilot.simple_chat_client import SimpleCopilotClient, UserMessage, AssistantMessage

class MockGPTAgent:
    """
    Mock агент на GPT для общения с Copilot
    Позволяет задать количество итераций и промпт для агента
    """
    
    def __init__(
        self,
        copilot_base_url: str = "http://localhost:3002",
        copilot_api_key: str = None,
        rowboat_base_url: str = "http://localhost:3000",
        openai_model: str = "gpt-4.1",
        openai_model_eval: str = "gpt-4.1",
        openai_api_key: str = None
    ):
        """
        Инициализация mock агента
        
        Args:
            copilot_base_url: URL сервера Copilot
            copilot_api_key: API ключ для Copilot
            rowboat_base_url: URL сервера Rowboat
            openai_model: Модель OpenAI для mock агента
            openai_api_key: API ключ OpenAI
        """
        self.copilot_client = SimpleCopilotClient(
            base_url=copilot_base_url,
            api_key=copilot_api_key,
            rowboat_base_url=rowboat_base_url
        )
        
        self.openai_client = OpenAI(api_key=openai_api_key)
        self.openai_model = openai_model
        self.openai_model_eval = openai_model_eval
        
    def check_services(self) -> bool:
        """Проверяет доступность сервисов"""
        if not self.copilot_client.health_check():
            print("❌ Copilot сервер недоступен!")
            return False
        print("✅ Copilot сервер доступен!")
        return True
    
    def load_workflow(self, project_id: str, workflow_id: str = None) -> bool:
        """Загружает workflow из проекта"""
        return self.copilot_client.load_workflow_from_project(project_id, workflow_id)
    
    async def simulate_conversation(
        self,
        agent_prompt: str,
        max_iterations: int = 5,
        initial_message: str = None,
        pass_criteria: list = None,
        temperature: float = 0
    ) -> Dict[str, Any]:
        """
        Симулирует разговор между mock агентом и Copilot
        
        Args:
            agent_prompt: Промпт для mock агента (его роль и поведение)
            max_iterations: Максимальное количество итераций разговора
            initial_message: Начальное сообщение от агента (если не указано, агент начинает сам)
            pass_criteria: Критерии для оценки успешности разговора
            temperature: Температура для OpenAI модели
            
        Returns:
            Словарь с результатами симуляции
        """
        print(f"🤖 Начинаю симуляцию разговора ({max_iterations} итераций)")
        print(f"📝 Промпт агента: {agent_prompt[:100]}...")
        
        # История сообщений для OpenAI (роль агента)
        agent_messages = [
            {
                "role": "system",
                "content": agent_prompt
            }
        ]
        
        # История сообщений для Copilot
        copilot_messages = []
        
        # Полная история разговора для анализа
        conversation_history = []
        
        loop = asyncio.get_running_loop()
        
        # Если есть начальное сообщение, используем его
        if initial_message:
            agent_content = initial_message
            print(f"🎯 Используется начальное сообщение: {agent_content}")
        else:
            # Генерируем первое сообщение от агента
            print("🧠 Генерирую первое сообщение от агента...")
            agent_response = await loop.run_in_executor(
                None,
                lambda: self.openai_client.chat.completions.create(
                    model=self.openai_model,
                    messages=agent_messages + [{"role": "user", "content": "Начни разговор согласно своей роли."}],
                    temperature=temperature
                )
            )
            agent_content = agent_response.choices[0].message.content.strip()
            print(f"👤 Первое сообщение агента: {agent_content}")
        
        # Основной цикл симуляции
        for iteration in range(max_iterations):
            print(f"\n--- Итерация {iteration + 1}/{max_iterations} ---")
            
            # Добавляем сообщение агента в историю
            conversation_history.append({
                "role": "user",
                "content": agent_content,
                "source": "mock_agent"
            })
            
            # Отправляем сообщение в Copilot
            copilot_messages.append(UserMessage(content=agent_content))
            
            print(f"📤 Отправляю в Copilot: {agent_content}")
            
            try:
                # Получаем ответ от Copilot
                copilot_response = self.copilot_client.get_full_response(
                    messages=copilot_messages
                )
                
                print(f"📥 Ответ Copilot: {copilot_response}")
                
                # Добавляем ответ Copilot в историю
                copilot_messages.append(AssistantMessage(content=copilot_response))
                conversation_history.append({
                    "role": "assistant", 
                    "content": copilot_response,
                    "source": "copilot"
                })
                
                # Если это последняя итерация, прерываем цикл
                if iteration == max_iterations - 1:
                    break
                
                # Генерируем следующее сообщение от агента
                agent_messages.append({"role": "assistant", "content": agent_content})
                agent_messages.append({"role": "user", "content": copilot_response})
                
                print("🧠 Генерирую следующее сообщение агента...")
                agent_response = await loop.run_in_executor(
                    None,
                    lambda: self.openai_client.chat.completions.create(
                        model=self.openai_model,
                        messages=agent_messages,
                        temperature=temperature
                    )
                )
                
                agent_content = agent_response.choices[0].message.content.strip()
                print(f"👤 Следующее сообщение агента: {agent_content}")
                
            except Exception as e:
                print(f"❌ Ошибка при общении с Copilot: {e}")
                conversation_history.append({
                    "role": "error",
                    "content": f"Ошибка: {str(e)}",
                    "source": "system"
                })
                break
        
        # Подготавливаем результат
        result = {
            "conversation_history": conversation_history,
            "total_iterations": len([msg for msg in conversation_history if msg["source"] == "mock_agent"]),
            "agent_prompt": agent_prompt,
            "success": True
        }
        
        # Если заданы критерии оценки, проводим оценку
        if pass_criteria:
            print("\n📊 Проводим оценку разговора...")
            result_evaluation = []
            for test_criterias in pass_criteria:
                test_pass = test_criterias["passCriteria"]
                try:
                    evaluation_result = await self._evaluate_conversation(
                        conversation_history, test_pass, loop
                    )
                    eval_result = evaluation_result["evaluation"]
                    eval_result["test_name"] = test_criterias["test_name"]
                    result_evaluation.append(eval_result)
                except Exception as e:
                    print(f"❌ Ошибка при оценке: {e}")
                    result["evaluation_error"] = str(e)
            result["evaluation"] = result_evaluation
        print(f"\n✅ Симуляция завершена! Итераций: {result['total_iterations']}")
        return result
    
    async def _evaluate_conversation(
        self, 
        conversation_history: List[Dict[str, Any]], 
        pass_criteria: str,
        loop
    ) -> Dict[str, Any]:
        """Оценивает разговор по заданным критериям"""
        
        # Формируем транскрипт для оценки
        transcript_str = ""
        for msg in conversation_history:
            if msg["source"] in ["mock_agent", "copilot"]:
                role = "USER" if msg["source"] == "mock_agent" else "ASSISTANT"
                transcript_str += f"{role}: {msg['content']}\n"
        
        evaluation_prompt = [
            {
                "role": "system",
                "content": (
                    f"Ты строгий оценщик, который придирается к критериям. Замечение: когда в критерии есть создал инструмент или агента - в транскрибации всегда должен присутствовать слово copilot_change в начале изменения/создания. Смотри на переписку внимательно, не пропускай ничего! Оцени разговор по следующему критерию (фокусируйся на него):\n"
                    f"{pass_criteria}\n\n"
                    "Верни ТОЛЬКО JSON объект в таком формате:\n"
                    '{"verdict": "pass", "details": <причина>} или '
                    '{"verdict": "fail", "details": <причина>}.'
                )
            },
            {
                "role": "user",
                "content": (
                    f"Вот транскрипт разговора:\n\n{transcript_str}\n\n"
                    "Соответствует ли разговор заданным критериям? "
                    "Верни только 'pass' или 'fail' для verdict и краткое объяснение для details."
                )
            }
        ]
        
        eval_response = await loop.run_in_executor(
            None,
            lambda: self.openai_client.chat.completions.create(
                model=self.openai_model_eval,
                messages=evaluation_prompt,
                temperature=0.0,
                response_format={"type": "json_object"}
            )
        )
        
        response_json_str = eval_response.choices[0].message.content
        response_json = json.loads(response_json_str)
        
        verdict = response_json.get("verdict")
        details = response_json.get("details")
        
        print(f"📊 Результат оценки: {verdict}")
        print(f"📝 Детали: {details}")
        
        return {
            "evaluation": {
                "verdict": verdict,
                "details": details,
                "pass_criteria": pass_criteria
            }
        }
    
    def print_conversation(self, conversation_history: List[Dict[str, Any]]):
        """Выводит историю разговора в читаемом формате"""
        print("\n" + "="*50)
        print("📜 ИСТОРИЯ РАЗГОВОРА")
        print("="*50)
        
        for i, msg in enumerate(conversation_history, 1):
            source_emoji = "👤" if msg["source"] == "mock_agent" else "🤖" if msg["source"] == "copilot" else "⚠️"
            source_name = "Mock Agent" if msg["source"] == "mock_agent" else "Copilot" if msg["source"] == "copilot" else "System"
            
            print(f"\n{i}. {source_emoji} {source_name}:")
            print(f"   {msg['content']}")
        
        print("\n" + "="*50)


async def main(model_name):
    """Пример использования MockGPTAgent"""
    
    # Загружаем конфигурацию из designtime.json
    with open("benchmark/design_time/designtime.json", 'r', encoding='utf-8') as f:
        design_time_config = json.load(f)
    
    benchmark_processed = []
    for test in design_time_config:
        print("="*10, test["scenario_name"], "="*10)
        api_key = test["PROJECT_API_KEY"]
        project_id = test["PROJECT_ID"]
        
        agent = MockGPTAgent(
            copilot_api_key=api_key
        )
        
        if not agent.check_services():
            return
        
        if agent.load_workflow(project_id):
            print("✅ Workflow загружен!")
        else:
            print("⚠️ Используется дефолтный workflow")
        
        description = test["scenario_description"]
        agent_prompt = f"Вы играете роль клиента, разговаривающего с чат-ботом (пользователь играет роль чат-бота). Проведите следующий чат с чат-ботом. Сценарий:\n{description}\n\n Начните прямо сейчас с вашего первого сообщения."
        pass_criteria = test["list_of_passCriteria"]# [0]["passCriteria"]
        
        # Запускаем симуляцию
        result = await agent.simulate_conversation(
            agent_prompt=agent_prompt,
            max_iterations=test["MAX_DIALOG_ITERATIONS"],
            initial_message=test["first_message"],
            pass_criteria=pass_criteria,
            temperature=0.7
        )
        
        result["scenario_name"] = test["scenario_name"]
        benchmark_processed.append(result)

    with open(f"benchmark/design_time/design_time_result_{model_name}.json", 'w', encoding='utf-8') as f:
        json.dump(benchmark_processed, f, ensure_ascii=False, indent=2)
        
    # # Выводим результаты
    # agent.print_conversation(result["conversation_history"])
    
    # if "evaluation" in result:
    #     print(f"\n📊 ОЦЕНКА: {result['evaluation']['verdict'].upper()}")
    #     print(f"📝 Детали: {result['evaluation']['details']}")


if __name__ == "__main__":
    model_name = "qwen-2.5-72b-instruct"
    asyncio.run(main(model_name)) 