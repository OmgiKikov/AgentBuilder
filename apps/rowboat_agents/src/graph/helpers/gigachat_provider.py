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
)
from agents.models.fake_id import FAKE_RESPONSES_ID

# Для стриминга
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from agents.model_settings import ModelSettings

# Отключаем SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


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
    """GigaChat model implementation for the agents framework."""
    
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
        """Get a response from GigaChat model."""
        
        # Отключаем tracing для GigaChat чтобы избежать ошибок OpenAI
        tracing._disabled = True
        
        # Конвертируем входные данные в сообщения
        system_prompt, user_message = self._convert_input_to_prompts(system_instructions, input)
        
        # Отправляем запрос в GigaChat
        try:
            response_content = self._chat_with_gigachat(system_prompt, user_message)
            
            # Создаем объект ответа в формате agents
            output_items = self._create_output_items(response_content)
            
            # Создаем usage с оценочными значениями
            usage = Usage(
                requests=1,
                input_tokens=self._estimate_tokens(system_prompt + user_message),
                output_tokens=self._estimate_tokens(response_content),
                total_tokens=self._estimate_tokens(system_prompt + user_message + response_content),
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
        """Stream a response from GigaChat model."""
        
        # Отключаем tracing для GigaChat чтобы избежать ошибок OpenAI
        tracing._disabled = True
        
        # Получаем полный ответ
        model_response = await self.get_response(
            system_instructions,
            input,
            model_settings,
            tools,
            output_schema,
            handoffs,
            tracing,
            previous_response_id=previous_response_id,
        )
        
        # Эмулируем правильную последовательность событий стрима
        from openai.types.responses import (
            ResponseCreatedEvent,
            ResponseOutputItemAddedEvent,
            ResponseContentPartAddedEvent, 
            ResponseTextDeltaEvent,
            ResponseContentPartDoneEvent,
            ResponseOutputItemDoneEvent,
            ResponseCompletedEvent,
            ResponseOutputText,
            ResponseOutputMessage,
            Response,
            ResponseUsage
        )
        from openai.types.responses.response_usage import InputTokensDetails, OutputTokensDetails
        import time
        
        sequence_number = 0
        
        # Извлекаем текст из ответа модели
        response_text = ""
        if model_response.output and len(model_response.output) > 0:
            output_item = model_response.output[0]
            if hasattr(output_item, 'content') and output_item.content:
                for content_part in output_item.content:
                    if hasattr(content_part, 'text'):
                        response_text = content_part.text
                        break
        
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
        
        # 2. Output Item Added (начало сообщения)
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
        
        # 3. Content Part Added (начало текстового контента)
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
        
        # 4. Отправляем текст по кусочкам (имитируем стриминг)
        if response_text:
            # Разбиваем текст на слова для имитации стриминга
            words = response_text.split()
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
            text_part.text = response_text.strip()
        
        # 5. Content Part Done (конец текстового контента)
        yield ResponseContentPartDoneEvent(
            content_index=0,
            item_id=FAKE_RESPONSES_ID,
            output_index=0,
            part=text_part,
            type="response.content_part.done",
            sequence_number=sequence_number
        )
        sequence_number += 1
        
        # 6. Output Item Done (конец сообщения)
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
        
        # 7. Response Completed (финальное событие)
        final_response = Response(
            id=FAKE_RESPONSES_ID,
            created_at=time.time(),
            model="gigachat",
            object="response",
            output=[final_assistant_item],
            tool_choice="auto",
            top_p=model_settings.top_p,
            temperature=model_settings.temperature,
            tools=[],
            parallel_tool_calls=False,
            reasoning=None,
            usage=ResponseUsage(
                input_tokens=model_response.usage.input_tokens,
                output_tokens=model_response.usage.output_tokens,
                total_tokens=model_response.usage.total_tokens,
                input_tokens_details=InputTokensDetails(cached_tokens=0),
                output_tokens_details=OutputTokensDetails(reasoning_tokens=0)
            )
        )
        
        yield ResponseCompletedEvent(
            response=final_response,
            type="response.completed",
            sequence_number=sequence_number
        )
    
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
        
        messages = [
            ("system", system_prompt),
            ("user", user_message)
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