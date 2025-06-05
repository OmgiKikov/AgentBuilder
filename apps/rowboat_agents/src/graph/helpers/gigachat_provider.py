from __future__ import annotations

from langchain_community.chat_models.gigachat import GigaChat
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
import os
import json
import requests
import uuid
import urllib3
import re
import asyncio
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from collections.abc import AsyncIterator

# Импорты из agents SDK
from agents.models.interface import Model, ModelTracing
from agents.items import ModelResponse, TResponseInputItem, TResponseStreamEvent
from agents.usage import Usage
from agents.tool import Tool
from agents.handoffs import Handoff
from agents.agent_output import AgentOutputSchemaBase
from agents.exceptions import AgentsException
from agents.models.chatcmpl_converter import Converter

# Импорты для создания output items
from openai.types.responses import (
    ResponseOutputMessage,
    ResponseOutputText,
    ResponseFunctionToolCall,
    ResponseCreatedEvent,
    ResponseOutputItemAddedEvent,
    ResponseContentPartAddedEvent, 
    ResponseTextDeltaEvent,
    ResponseContentPartDoneEvent,
    ResponseOutputItemDoneEvent,
    ResponseCompletedEvent,
    ResponseFunctionCallArgumentsDeltaEvent,
    Response,
    ResponseUsage
)
from openai.types.responses.response_usage import InputTokensDetails, OutputTokensDetails
from agents.models.fake_id import FAKE_RESPONSES_ID

# Для стриминга
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from agents.model_settings import ModelSettings

# Отключаем SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Импорт для MCP интеграции
try:
    from ..execute_turn_giga import call_mcp
except ImportError:
    # Fallback если импорт не работает
    async def call_mcp(tool_name: str, args: str, mcp_server_url: str) -> str:
        return f"MCP call to {tool_name} with args {args} (fallback implementation)"


@dataclass
class GigaChatUsage:
    total_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class GigaChatResponse:
    content: str
    usage: GigaChatUsage


def get_access_token(oauth_url="https://ngw.devices.sberbank.ru:9443/api/v2/oauth"):
    """Получает access token для GigaChat API."""
    try:
        headers = {
            'Authorization': f"Bearer ZDFhY2IzYmMtNDU5OC00OThiLWFmM2UtZDg4MmU0Mjg3MTAzOjQxZDdkNTFkLTZiMzItNDU4MC05MjNhLTQ4MDgxZGZmYTBhOA==",
            'RqUID': str(uuid.uuid1()),
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        
        data = {
            'scope': "GIGACHAT_API_CORP",
        }
        
        print(f"Получаем access token для GigaChat...")
        response = requests.post(oauth_url, headers=headers, data=data, verify=False)
        
        if response.status_code != 200:
            print(f"Ошибка HTTP: {response.status_code}")
            print(f"Текст ответа: {response.text}")
            return None
            
        try:
            response_data = response.json()
        except ValueError as e:
            print(f"Ошибка парсинга JSON: {e}")
            return None
            
        if 'access_token' not in response_data:
            print("Ошибка: access_token не найден в ответе")
            return None
            
        access_token = response_data['access_token']
        print("✅ Access token успешно получен!")
        return access_token
    except Exception as e:
        print(f"Ошибка получения токена: {e}")
        return None


def init_gigachat_environment():
    """Инициализирует переменные окружения для GigaChat."""
    print("🔧 Инициализация среды GigaChat...")
    
    # Получаем токен
    token = get_access_token()
    if not token:
        raise ValueError("Не удалось получить access token")
    
    os.environ["ACCESS_TOKEN"] = token
    
    # Устанавливаем URL если не задан
    if not os.getenv("AIGATEWAY_URL"):
        os.environ["AIGATEWAY_URL"] = "https://gigachat.devices.sberbank.ru/api/v1"
    
    # Получаем доступные модели
    try:
        url = os.getenv("AIGATEWAY_URL") + "/models"
        res = requests.get(
            url, 
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, 
            verify=False
        ).json()
        
        models_list = []
        models = res["data"]
        for model in models:
            models_list.append(model["id"])
        
        print(f"📋 Доступные модели: {models_list}")
        
        # Выбираем лучшую доступную модель (приоритет: 2-Max -> 2-Pro -> Pro -> Plus -> обычный)
        if "GigaChat-2-Max" in models_list:
            os.environ["GIGA_MODEL"] = "GigaChat-2-Max"
        elif "GigaChat-2-Pro" in models_list:
            os.environ["GIGA_MODEL"] = "GigaChat-2-Pro"
        elif "GigaChat-Pro" in models_list:
            os.environ["GIGA_MODEL"] = "GigaChat-Pro"
        elif "GigaChat-Max" in models_list:
            os.environ["GIGA_MODEL"] = "GigaChat-Max"
        elif "GigaChat-Plus" in models_list:
            os.environ["GIGA_MODEL"] = "GigaChat-Plus"
        elif "GigaChat-2" in models_list:
            os.environ["GIGA_MODEL"] = "GigaChat-2"
        elif "GigaChat" in models_list:
            os.environ["GIGA_MODEL"] = "GigaChat"
        else:
            raise Exception("Не удалось найти подходящую модель")
        
        print(f"✅ Используемая модель: {os.environ['GIGA_MODEL']}")
        
    except Exception as e:
        print(f"⚠️ Не удалось получить список моделей, используем GigaChat по умолчанию: {e}")
        os.environ["GIGA_MODEL"] = "GigaChat"


class GigaChatModel(Model):
    """GigaChat model implementation for the agents framework with tool calling support."""
    
    def __init__(self, credentials: str | None = None, auto_init: bool = True):
        if auto_init:
            # Автоматически инициализируем среду
            init_gigachat_environment()
        
        # Получаем токен
        self.access_token = credentials or os.getenv("ACCESS_TOKEN")
        if not self.access_token:
            raise ValueError("GigaChat credentials are required. Set ACCESS_TOKEN env var or pass credentials parameter.")
        
        # Получаем модель и URL
        self.model_name = os.getenv("GIGA_MODEL", "GigaChat")
        self.base_url = os.getenv("AIGATEWAY_URL", "https://gigachat.devices.sberbank.ru/api/v1")
        
        # Создаем клиент GigaChat
        self.client = GigaChat(
            verify_ssl_certs=False,
            model=self.model_name,
            access_token=self.access_token,
            profanity_check=False
        )
        
        print(f"✅ GigaChatModel инициализирован с моделью {self.model_name}")
    
    def _format_tools_for_gigachat(self, tools: list[Tool]) -> str:
        """Форматирует инструменты для включения в системный промпт GigaChat."""
        if not tools:
            return ""
        
        tools_prompt = "\n\n# ВАЖНО: У тебя есть доступные инструменты!\n\n"
        
        for tool in tools:
            tools_prompt += f"**{tool.name}**: {tool.description}\n"
            
            # Добавляем параметры если они есть
            if hasattr(tool, 'params_json_schema') and tool.params_json_schema:
                schema = tool.params_json_schema
                if 'properties' in schema:
                    tools_prompt += "Параметры:\n"
                    for param_name, param_info in schema['properties'].items():
                        param_type = param_info.get('type', 'string')
                        param_desc = param_info.get('description', '')
                        required = param_name in schema.get('required', [])
                        req_text = " (обязательный)" if required else " (опциональный)"
                        tools_prompt += f"  - {param_name} ({param_type}){req_text}: {param_desc}\n"
            
            tools_prompt += "\n"
        
        tools_prompt += """## ОБЯЗАТЕЛЬНО: Как использовать инструменты

КОГДА пользователь просит использовать инструмент или когда тебе нужно выполнить действие, ты ДОЛЖЕН использовать следующий ТОЧНЫЙ формат:

**TOOL_CALL_START**
tool_name: название_инструмента
parameters: {{"параметр1": "значение1", "параметр2": "значение2"}}
**TOOL_CALL_END**

ПРИМЕРЫ:

Если пользователь говорит "Используй greeting_tool":
**TOOL_CALL_START**
tool_name: greeting_tool
parameters: {{}}
**TOOL_CALL_END**

Если пользователь говорит "Вычисли 10+5":
**TOOL_CALL_START**
tool_name: calculator_tool
parameters: {{"expression": "10+5"}}
**TOOL_CALL_END**

КРИТИЧЕСКИ ВАЖНО:
- Используй ТОЧНО этот формат с **TOOL_CALL_START** и **TOOL_CALL_END**
- НЕ добавляй лишний текст между маркерами
- НЕ отвечай обычным текстом если пользователь просит использовать инструмент
- ВСЕГДА используй инструменты когда пользователь явно их просит
- Параметры должны быть в правильном JSON формате

"""
        return tools_prompt
    
    def _parse_tool_calls_from_response(self, response_content: str, tools: list[Tool]) -> tuple[str, list[dict]]:
        """Парсит tool calls из ответа GigaChat и возвращает очищенный текст + список вызовов."""
        
        # Паттерн для поиска tool calls
        tool_call_pattern = r'\*\*TOOL_CALL_START\*\*(.*?)\*\*TOOL_CALL_END\*\*'
        tool_calls_found = re.findall(tool_call_pattern, response_content, re.DOTALL)
        
        tool_calls_data = []
        
        for tool_call_text in tool_calls_found:
            # Извлекаем tool_name
            tool_name_match = re.search(r'tool_name:\s*(\w+)', tool_call_text)
            if not tool_name_match:
                continue
            
            tool_name = tool_name_match.group(1)
            
            # Проверяем что такой инструмент существует
            tool_exists = any(tool.name == tool_name for tool in tools)
            if not tool_exists:
                continue
            
            # Извлекаем parameters
            params_match = re.search(r'parameters:\s*({.*?})', tool_call_text, re.DOTALL)
            if params_match:
                try:
                    parameters = json.loads(params_match.group(1))
                except json.JSONDecodeError:
                    parameters = {}
            else:
                parameters = {}
            
            tool_calls_data.append({
                'name': tool_name,
                'arguments': parameters,
                'id': f"call_{uuid.uuid4().hex[:8]}"
            })
        
        # Удаляем tool calls из текста ответа
        cleaned_response = re.sub(tool_call_pattern, '', response_content, flags=re.DOTALL)
        cleaned_response = cleaned_response.strip()
        
        return cleaned_response, tool_calls_data
    
    async def _execute_tool_call(self, tool_call: dict, tools: list[Tool]) -> str:
        """Выполняет вызов инструмента и возвращает результат."""
        tool_name = tool_call['name']
        arguments = tool_call['arguments']
        
        # Находим инструмент
        tool = next((t for t in tools if t.name == tool_name), None)
        if not tool:
            return f"Ошибка: инструмент {tool_name} не найден"
        
        try:
            # Выполняем инструмент
            if hasattr(tool, 'on_invoke_tool') and tool.on_invoke_tool:
                # Создаем mock context
                class MockContext:
                    pass
                
                ctx = MockContext()
                # Конвертируем аргументы в JSON строку если это словарь
                if isinstance(arguments, dict):
                    args_str = json.dumps(arguments)
                else:
                    args_str = str(arguments)
                
                result = await tool.on_invoke_tool(ctx, args_str)
                return str(result)
            else:
                return f"Ошибка: инструмент {tool_name} не имеет реализации"
                
        except Exception as e:
            return f"Ошибка выполнения инструмента {tool_name}: {str(e)}"
    
    async def get_response(
        self,
        system_instructions: str | None,
        input: str | list[TResponseInputItem],
        model_settings: ModelSettings,
        tools: list[Tool],
        output_schema: AgentOutputSchemaBase | None,
        handoffs: list[Handoff],
        tracing: ModelTracing,
        *,
        previous_response_id: str | None,
    ) -> ModelResponse:
        """Get a response from GigaChat model with tool calling support."""
        
        # Конвертируем входные данные в сообщения
        system_prompt, user_message = self._convert_input_to_prompts(system_instructions, input)
        
        # Добавляем инструменты в системный промпт
        if tools:
            tools_prompt = self._format_tools_for_gigachat(tools)
            system_prompt = system_prompt + tools_prompt
        
        # Отправляем запрос в GigaChat
        try:
            response_content = self._chat_with_gigachat(system_prompt, user_message)
            
            # Парсим tool calls из ответа
            cleaned_response, tool_calls_data = self._parse_tool_calls_from_response(response_content, tools)
            
            # Если есть tool calls, выполняем их и отправляем второй запрос
            if tool_calls_data:
                # Выполняем все tool calls
                tool_results = []
                for tool_call in tool_calls_data:
                    try:
                        result = await self._execute_tool_call(tool_call, tools)
                        tool_results.append({
                            'call_id': tool_call['id'],
                            'name': tool_call['name'],
                            'result': result
                        })
                    except Exception as e:
                        tool_results.append({
                            'call_id': tool_call['id'],
                            'name': tool_call['name'],
                            'result': f"Ошибка: {str(e)}"
                        })
                
                # Формируем новый промпт с результатами инструментов
                tool_results_text = "\n".join([
                    f"Результат вызова {tr['name']}: {tr['result']}" 
                    for tr in tool_results
                ])
                
                follow_up_message = f"""Пользователь: {user_message}

Ты вызвал инструменты и получил следующие результаты:
{tool_results_text}

Теперь дай окончательный ответ пользователю, используя полученные результаты."""
                
                # Отправляем второй запрос к модели с результатами инструментов
                final_response_content = self._chat_with_gigachat(system_prompt, follow_up_message)
                
                # Парсим финальный ответ (не должно быть новых tool calls)
                final_cleaned_response, _ = self._parse_tool_calls_from_response(final_response_content, tools)
                
                # Создаем объект ответа в формате agents с финальным ответом
                output_items = self._create_output_items(final_cleaned_response)
                
                # Создаем usage с оценочными значениями
                usage = Usage(
                    requests=1,
                    input_tokens=self._estimate_tokens(system_prompt + user_message + follow_up_message),
                    output_tokens=self._estimate_tokens(final_cleaned_response),
                    total_tokens=self._estimate_tokens(system_prompt + user_message + follow_up_message + final_cleaned_response),
                )
                
                return ModelResponse(
                    output=output_items,
                    usage=usage,
                    response_id=None,
                )
            else:
                # Если нет tool calls, возвращаем обычный ответ
                output_items = self._create_output_items(cleaned_response)
                
                # Создаем usage с оценочными значениями
                usage = Usage(
                    requests=1,
                    input_tokens=self._estimate_tokens(system_prompt + user_message),
                    output_tokens=self._estimate_tokens(cleaned_response),
                    total_tokens=self._estimate_tokens(system_prompt + user_message + cleaned_response),
                )
                
                return ModelResponse(
                    output=output_items,
                    usage=usage,
                    response_id=None,
                )
            
        except Exception as e:
            raise AgentsException(f"GigaChat API error: {str(e)}")
    
    async def stream_response(
        self,
        system_instructions: str | None,
        input: str | list[TResponseInputItem],
        model_settings: ModelSettings,
        tools: list[Tool],
        output_schema: AgentOutputSchemaBase | None,
        handoffs: list[Handoff],
        tracing: ModelTracing,
        *,
        previous_response_id: str | None,
    ) -> AsyncIterator[TResponseStreamEvent]:
        """Stream a response from GigaChat model with proper tool calling events."""
        
        # Конвертируем входные данные в сообщения
        system_prompt, user_message = self._convert_input_to_prompts(system_instructions, input)
        
        # Добавляем инструменты в системный промпт
        if tools:
            tools_prompt = self._format_tools_for_gigachat(tools)
            system_prompt = system_prompt + tools_prompt
        
        import time
        sequence_number = 0
        
        try:
            # Получаем ответ от GigaChat
            response_content = self._chat_with_gigachat(system_prompt, user_message)
            
            # Парсим tool calls из ответа
            cleaned_response, tool_calls_data = self._parse_tool_calls_from_response(response_content, tools)
            
            # 1. Response Created Event
            initial_response = Response(
                id=FAKE_RESPONSES_ID,
                created_at=time.time(),
                model="gigachat",
                object="response",
                output=[],
                tool_choice="auto",
                top_p=model_settings.top_p,
                temperature=model_settings.temperature,
                tools=[],
                parallel_tool_calls=False,
                reasoning=None,
            )
            
            yield ResponseCreatedEvent(
                response=initial_response,
                type="response.created",
                sequence_number=sequence_number
            )
            sequence_number += 1
            
            # 2. Если есть tool calls, отправляем их как события и ВОЗВРАЩАЕМ для обработки в основном потоке
            if tool_calls_data:
                for tool_call in tool_calls_data:
                    # Создаем ResponseFunctionToolCall объект
                    function_tool_call = ResponseFunctionToolCall(
                        arguments=json.dumps(tool_call['arguments']),
                        call_id=tool_call['id'],
                        name=tool_call['name'],
                        type='function_call',
                        id=FAKE_RESPONSES_ID,
                        status=None
                    )
                    
                    # Output Item Added Event для function call
                    yield ResponseOutputItemAddedEvent(
                        item=function_tool_call,
                        output_index=0,
                        type="response.output_item.added",
                        sequence_number=sequence_number
                    )
                    sequence_number += 1
                    
                    # Function Call Arguments Delta Event
                    yield ResponseFunctionCallArgumentsDeltaEvent(
                        delta=json.dumps(tool_call['arguments']),
                        item_id=FAKE_RESPONSES_ID,
                        output_index=0,
                        type="response.function_call_arguments.delta",
                        sequence_number=sequence_number
                    )
                    sequence_number += 1
                    
                    # Output Item Done Event для function call
                    yield ResponseOutputItemDoneEvent(
                        item=function_tool_call,
                        output_index=0,
                        type="response.output_item.done",
                        sequence_number=sequence_number
                    )
                    sequence_number += 1
                
                # Response Completed Event после всех tool calls
                completed_response = Response(
                    id=FAKE_RESPONSES_ID,
                    created_at=time.time(),
                    model="gigachat",
                    object="response",
                    output=[ResponseFunctionToolCall(
                        arguments=json.dumps(tc['arguments']),
                        call_id=tc['id'],
                        name=tc['name'],
                        type='function_call',
                        id=FAKE_RESPONSES_ID,
                        status=None
                    ) for tc in tool_calls_data],
                    tool_choice="auto",
                    top_p=model_settings.top_p,
                    temperature=model_settings.temperature,
                    tools=[],
                    parallel_tool_calls=False,
                    reasoning=None,
                    usage=ResponseUsage(
                        input_tokens=self._estimate_tokens(system_prompt + user_message),
                        output_tokens=10,  # Примерное значение для tool calls
                        total_tokens=self._estimate_tokens(system_prompt + user_message) + 10,
                        input_tokens_details=InputTokensDetails(cached_tokens=0),
                        output_tokens_details=OutputTokensDetails(reasoning_tokens=0)
                    )
                )
                
                yield ResponseCompletedEvent(
                    response=completed_response,
                    type="response.completed",
                    sequence_number=sequence_number
                )
                sequence_number += 1
                
                # ВАЖНО: НЕ выполняем tool calls здесь - позволяем фреймворку agents делать это
                # Это создаст правильные function spans через tracing и покажет tool calls в UI
                # НО нам нужно дождаться результатов и отправить второй запрос к модели
                
                # Сохраняем состояние для второго запроса
                self._pending_tool_calls = tool_calls_data
                self._pending_system_prompt = system_prompt
                self._pending_user_message = user_message
                self._pending_sequence_number = sequence_number
                
                return
            
            # 3. Если нет tool calls, создаем обычный ответ с текстом
            if cleaned_response.strip():
                # Output Item Added (начало сообщения)
                assistant_item = ResponseOutputMessage(
                    id=FAKE_RESPONSES_ID,
                    content=[],
                    role="assistant",
                    type="message",
                    status="in_progress",
                )
                
                yield ResponseOutputItemAddedEvent(
                    item=assistant_item,
                    output_index=0,
                    type="response.output_item.added",
                    sequence_number=sequence_number
                )
                sequence_number += 1
                
                # Content Part Added (начало текстового контента)
                text_part = ResponseOutputText(
                    text="",
                    type="output_text",
                    annotations=[],
                )
                
                yield ResponseContentPartAddedEvent(
                    content_index=0,
                    item_id=FAKE_RESPONSES_ID,
                    output_index=0,
                    part=text_part,
                    type="response.content_part.added",
                    sequence_number=sequence_number
                )
                sequence_number += 1
                
                # Отправляем текст по кусочкам (имитируем стриминг)
                words = cleaned_response.strip().split()
                current_text = ""
                
                for word in words:
                    delta = word + " "
                    current_text += delta
                    
                    yield ResponseTextDeltaEvent(
                        content_index=0,
                        delta=delta,
                        item_id=FAKE_RESPONSES_ID,
                        output_index=0,
                        type="response.output_text.delta",
                        sequence_number=sequence_number
                    )
                    sequence_number += 1
                
                # Обновляем text_part с полным текстом
                text_part.text = cleaned_response.strip()
                
                # Content Part Done (конец текстового контента)
                yield ResponseContentPartDoneEvent(
                    content_index=0,
                    item_id=FAKE_RESPONSES_ID,
                    output_index=0,
                    part=text_part,
                    type="response.content_part.done",
                    sequence_number=sequence_number
                )
                sequence_number += 1
                
                # Output Item Done (конец сообщения)
                final_assistant_item = ResponseOutputMessage(
                    id=FAKE_RESPONSES_ID,
                    content=[text_part],
                    role="assistant",
                    type="message",
                    status="completed",
                )
                
                yield ResponseOutputItemDoneEvent(
                    item=final_assistant_item,
                    output_index=0,
                    type="response.output_item.done",
                    sequence_number=sequence_number
                )
                sequence_number += 1
                
                # 4. Response Completed (финальное событие)
                final_response = Response(
                    id=FAKE_RESPONSES_ID,
                    created_at=time.time(),
                    model="gigachat",
                    object="response",
                    output=[ResponseOutputMessage(
                        id=FAKE_RESPONSES_ID,
                        content=[ResponseOutputText(
                            text=cleaned_response.strip(),
                            type="output_text",
                            annotations=[]
                        )],
                        role="assistant",
                        type="message",
                        status="completed",
                    )],
                    tool_choice="auto",
                    top_p=model_settings.top_p,
                    temperature=model_settings.temperature,
                    tools=[],
                    parallel_tool_calls=False,
                    reasoning=None,
                    usage=ResponseUsage(
                        input_tokens=self._estimate_tokens(system_prompt + user_message),
                        output_tokens=self._estimate_tokens(cleaned_response),
                        total_tokens=self._estimate_tokens(system_prompt + user_message + cleaned_response),
                        input_tokens_details=InputTokensDetails(cached_tokens=0),
                        output_tokens_details=OutputTokensDetails(reasoning_tokens=0)
                    )
                )
                
                yield ResponseCompletedEvent(
                    response=final_response,
                    type="response.completed",
                    sequence_number=sequence_number
                )
            
        except Exception as e:
            raise AgentsException(f"GigaChat streaming error: {str(e)}")
    
    async def continue_after_tool_calls(self, tool_results: list[dict]) -> AsyncIterator[TResponseStreamEvent]:
        """Продолжает генерацию после выполнения tool calls."""
        
        if not hasattr(self, '_pending_tool_calls'):
            return
        
        # Формируем новый промпт с результатами инструментов
        tool_results_text = "\n".join([
            f"Результат вызова {tr['name']}: {tr['result']}" 
            for tr in tool_results
        ])
        
        follow_up_message = f"""Пользователь: {self._pending_user_message}

Ты вызвал инструменты и получил следующие результаты:
{tool_results_text}

Теперь дай окончательный ответ пользователю, используя полученные результаты."""
        
        # Отправляем второй запрос к модели с результатами инструментов
        final_response_content = self._chat_with_gigachat(self._pending_system_prompt, follow_up_message)
        
        # Парсим финальный ответ (не должно быть новых tool calls)
        final_cleaned_response, _ = self._parse_tool_calls_from_response(final_response_content, [])
        
        sequence_number = self._pending_sequence_number
        
        # Отправляем финальный ответ как стрим
        if final_cleaned_response.strip():
            # Output Item Added (начало сообщения)
            assistant_item = ResponseOutputMessage(
                id=FAKE_RESPONSES_ID,
                content=[],
                role="assistant",
                type="message",
                status="in_progress",
            )
            
            yield ResponseOutputItemAddedEvent(
                item=assistant_item,
                output_index=0,
                type="response.output_item.added",
                sequence_number=sequence_number
            )
            sequence_number += 1
            
            # Content Part Added (начало текстового контента)
            text_part = ResponseOutputText(
                text="",
                type="output_text",
                annotations=[],
            )
            
            yield ResponseContentPartAddedEvent(
                content_index=0,
                item_id=FAKE_RESPONSES_ID,
                output_index=0,
                part=text_part,
                type="response.content_part.added",
                sequence_number=sequence_number
            )
            sequence_number += 1
            
            # Отправляем текст по кусочкам
            words = final_cleaned_response.strip().split()
            
            for word in words:
                delta = word + " "
                
                yield ResponseTextDeltaEvent(
                    content_index=0,
                    delta=delta,
                    item_id=FAKE_RESPONSES_ID,
                    output_index=0,
                    type="response.output_text.delta",
                    sequence_number=sequence_number
                )
                sequence_number += 1
            
            # Обновляем text_part с полным текстом
            text_part.text = final_cleaned_response.strip()
            
            # Content Part Done
            yield ResponseContentPartDoneEvent(
                content_index=0,
                item_id=FAKE_RESPONSES_ID,
                output_index=0,
                part=text_part,
                type="response.content_part.done",
                sequence_number=sequence_number
            )
            sequence_number += 1
            
            # Output Item Done
            final_assistant_item = ResponseOutputMessage(
                id=FAKE_RESPONSES_ID,
                content=[text_part],
                role="assistant",
                type="message",
                status="completed",
            )
            
            yield ResponseOutputItemDoneEvent(
                item=final_assistant_item,
                output_index=0,
                type="response.output_item.done",
                sequence_number=sequence_number
            )
            sequence_number += 1
            
            # Response Completed
            final_response = Response(
                id=FAKE_RESPONSES_ID,
                created_at=time.time(),
                model="gigachat",
                object="response",
                output=[final_assistant_item],
                tool_choice="auto",
                top_p=0,
                temperature=0,
                tools=[],
                parallel_tool_calls=False,
                reasoning=None,
                usage=ResponseUsage(
                    input_tokens=self._estimate_tokens(self._pending_system_prompt + follow_up_message),
                    output_tokens=self._estimate_tokens(final_cleaned_response),
                    total_tokens=self._estimate_tokens(self._pending_system_prompt + follow_up_message + final_cleaned_response),
                    input_tokens_details=InputTokensDetails(cached_tokens=0),
                    output_tokens_details=OutputTokensDetails(reasoning_tokens=0)
                )
            )
            
            yield ResponseCompletedEvent(
                response=final_response,
                type="response.completed",
                sequence_number=sequence_number
            )
        
        # Очищаем состояние
        delattr(self, '_pending_tool_calls')
        delattr(self, '_pending_system_prompt')
        delattr(self, '_pending_user_message')
        delattr(self, '_pending_sequence_number')
    
    def _convert_input_to_prompts(
        self, 
        system_instructions: str | None, 
        input: str | list[TResponseInputItem]
    ) -> tuple[str, str]:
        """Конвертирует входные данные в system_prompt и user_message."""
        
        system_prompt = system_instructions or ""
        user_messages = []
        assistant_messages = []
        
        if isinstance(input, str):
            user_messages.append(input)
        else:
            # Сначала проверяем - может быть это простые словари (как в playground)?
            if all(isinstance(item, dict) and 'role' in item for item in input):
                # Обрабатываем как список словарей
                for item in input:
                    role = item.get('role', 'user')
                    content = item.get('content', '')
                    
                    if role == "system":
                        system_prompt += f"\n{content}"
                    elif role == "user":
                        user_messages.append(content)
                    elif role == "assistant":
                        assistant_messages.append(content)
            else:
                # Пробуем использовать конвертер из agents SDK для сложных объектов
                try:
                    converted_messages = Converter.items_to_messages(input)
                    
                    for msg in converted_messages:
                        if hasattr(msg, 'role') and hasattr(msg, 'content'):
                            role = msg.role
                            content = self._extract_text_content(msg.content)
                            
                            if role == "system":
                                system_prompt += f"\n{content}"
                            elif role == "user":
                                user_messages.append(content)
                            elif role == "assistant":
                                assistant_messages.append(content)
                            elif role == "developer":
                                system_prompt += f"\nDeveloper note: {content}"
                            elif role == "tool":
                                system_prompt += f"\nTool output: {content}"
                                
                except Exception as e:
                    # Fallback: пробуем обработать как произвольные объекты
                    print(f"⚠️ Конвертер не сработал ({e}), используем fallback обработку")
                    
                    for item in input:
                        if hasattr(item, 'role') and hasattr(item, 'content'):
                            role = getattr(item, 'role', 'user')
                            content = self._extract_text_content(getattr(item, 'content', ''))
                            
                            if role == "system":
                                system_prompt += f"\n{content}"
                            elif role == "user":
                                user_messages.append(content)
                            elif role == "assistant":
                                assistant_messages.append(content)
                        elif isinstance(item, dict):
                            role = item.get('role', 'user')
                            content = item.get('content', '')
                            
                            if role == "system":
                                system_prompt += f"\n{content}"
                            elif role == "user":
                                user_messages.append(content)
                            elif role == "assistant":
                                assistant_messages.append(content)
                        else:
                            # Если не можем определить структуру, считаем это пользовательским сообщением
                            user_messages.append(str(item))
        
        # Собираем финальный user_message с историей диалога
        conversation_parts = []
        
        # Если нет сообщений, создаем пустое
        if not user_messages and not assistant_messages:
            return system_prompt.strip(), ""
        
        # Добавляем историю диалога (если есть несколько сообщений)
        if len(user_messages) > 1 or len(assistant_messages) > 0:
            # Восстанавливаем хронологический порядок диалога
            # Предполагаем что сообщения идут в хронологическом порядке
            all_messages = []
            
            # Перемешиваем пользовательские и ассистентские сообщения
            # Обычно последовательность: user -> assistant -> user -> assistant -> ... -> user (последний)
            min_length = min(len(user_messages), len(assistant_messages))
            
            for i in range(min_length):
                if i < len(user_messages):
                    all_messages.append(f"User: {user_messages[i]}")
                if i < len(assistant_messages):
                    all_messages.append(f"Assistant: {assistant_messages[i]}")
            
            # Добавляем оставшиеся пользовательские сообщения
            for i in range(min_length, len(user_messages)):
                all_messages.append(f"User: {user_messages[i]}")
            
            # Добавляем оставшиеся сообщения ассистента
            for i in range(min_length, len(assistant_messages)):
                all_messages.append(f"Assistant: {assistant_messages[i]}")
                
            if len(all_messages) > 1:
                conversation_parts.append("Previous conversation:")
                conversation_parts.extend(all_messages[:-1])  # Все кроме последнего
                conversation_parts.append("\nCurrent user message:")
                if all_messages:
                    # Убираем префикс "User: " из последнего сообщения если оно от пользователя
                    last_msg = all_messages[-1]
                    if last_msg.startswith("User: "):
                        conversation_parts.append(last_msg[6:])  # Убираем "User: "
                    else:
                        conversation_parts.append(last_msg)
            else:
                # Убираем префикс "User: " если есть только одно сообщение от пользователя
                msg = all_messages[0] if all_messages else ""
                if msg.startswith("User: "):
                    conversation_parts.append(msg[6:])
                else:
                    conversation_parts.append(msg)
        elif len(user_messages) == 1:
            conversation_parts.append(user_messages[0])
        else:
            # Если есть только сообщения ассистента, все равно нужно что-то вернуть
            conversation_parts.append("Please continue the conversation.")
        
        final_user_message = "\n".join(conversation_parts)
        
        return system_prompt.strip(), final_user_message.strip()
    
    def _extract_text_content(self, content) -> str:
        """Извлекает текстовое содержимое из различных форматов."""
        if isinstance(content, str):
            return content
        elif isinstance(content, list):
            text_parts = []
            for item in content:
                if hasattr(item, 'text'):
                    text_parts.append(item.text)
                elif isinstance(item, dict) and 'text' in item:
                    text_parts.append(item['text'])
            return " ".join(text_parts)
        else:
            return str(content)
    
    def _chat_with_gigachat(self, system_prompt: str, user_message: str, max_retries: int = 3) -> str:
        """Отправляет запрос в GigaChat с повторными попытками."""
        
        # Экранируем фигурные скобки для LangChain
        def escape_braces(text: str) -> str:
            """Экранирует одинарные фигурные скобки для LangChain."""
            # Заменяем одинарные { и } на двойные {{ и }}
            # Но сначала защищаем уже экранированные скобки
            text = text.replace('{{', '__DOUBLE_OPEN__')
            text = text.replace('}}', '__DOUBLE_CLOSE__')
            text = text.replace('{', '{{')
            text = text.replace('}', '}}')
            # Восстанавливаем уже экранированные скобки
            text = text.replace('__DOUBLE_OPEN__', '{{')
            text = text.replace('__DOUBLE_CLOSE__', '}}')
            return text
        
        escaped_system_prompt = escape_braces(system_prompt)
        escaped_user_message = escape_braces(user_message)
        
        messages = [
            ("system", escaped_system_prompt),
            ("user", escaped_user_message)
        ]
        
        chat_template = ChatPromptTemplate.from_messages(messages=messages)
        chain = chat_template | self.client | StrOutputParser()
        
        for attempt in range(max_retries):
            try:
                result = chain.invoke({})
                return result
            except Exception as e:
                if attempt < max_retries - 1:
                    print(f"⚠️ Попытка {attempt + 1} неудачна, повторяем...")
                    import time
                    time.sleep(2 ** attempt)  # Экспоненциальная задержка
                else:
                    raise e
    
    def _create_output_items(self, content: str) -> list:
        """Создает output items в формате agents SDK."""
        
        message_item = ResponseOutputMessage(
            id=FAKE_RESPONSES_ID,
            content=[
                ResponseOutputText(
                    text=content, 
                    type="output_text", 
                    annotations=[]
                )
            ],
            role="assistant",
            type="message",
            status="completed",
        )
        
        return [message_item]
    
    def _estimate_tokens(self, text: str) -> int:
        """Приблизительная оценка количества токенов."""
        if not text:
            return 0
        # Приблизительная оценка: 4 символа = 1 токен для русского языка
        return len(text) // 4


# Для обратной совместимости
class GigaChatProvider(GigaChatModel):
    """Deprecated: Use GigaChatModel instead."""
    
    def __init__(self):
        super().__init__()
        import warnings
        warnings.warn(
            "GigaChatProvider is deprecated. Use GigaChatModel instead.",
            DeprecationWarning,
            stacklevel=2
        )
    
    def create_chat_completion(self, messages: List[Dict[str, Any]], **kwargs) -> GigaChatResponse:
        """Legacy method for backward compatibility."""
        # Извлекаем system и user сообщения
        system_prompt = ""
        user_message = ""
        
        for msg in messages:
            if msg["role"] == "system":
                system_prompt += f"\n{msg['content']}"
            elif msg["role"] == "user":
                user_message += f"\n{msg['content']}"
            elif msg["role"] == "assistant":
                user_message += f"\nAssistant said: {msg['content']}"
        
        # Отправляем запрос
        response_content = self._chat_with_gigachat(system_prompt.strip(), user_message.strip())
        
        # Создаем объект ответа
        return GigaChatResponse(
            content=response_content,
            usage=GigaChatUsage(
                total_tokens=self._estimate_tokens(system_prompt + user_message + response_content),
                input_tokens=self._estimate_tokens(system_prompt + user_message),
                output_tokens=self._estimate_tokens(response_content)
            )
        )

    async def create_chat_completion_stream(self, messages: List[Dict[str, Any]], **kwargs):
        """Legacy streaming method - just yields the complete response."""
        response = self.create_chat_completion(messages, **kwargs)
        yield response 