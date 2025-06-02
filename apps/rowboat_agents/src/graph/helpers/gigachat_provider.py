from langchain_community.chat_models.gigachat import GigaChat
import os
import json
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class GigaChatUsage:
    total_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0

@dataclass
class GigaChatResponse:
    content: str
    usage: GigaChatUsage

class GigaChatProvider:
    def __init__(self):
        self.client = GigaChat(credentials=os.getenv("ACCESS_TOKEN"), verify_ssl_certs=False)
    
    def create_chat_completion(self, messages: List[Dict[str, Any]], **kwargs) -> GigaChatResponse:
        # Преобразуем сообщения в формат для GigaChat
        formatted_messages = []
        for msg in messages:
            role = msg["role"]
            content = msg["content"]
            if role == "system":
                formatted_messages.append({"role": "system", "content": content})
            elif role == "user":
                formatted_messages.append({"role": "user", "content": content})
            elif role == "assistant":
                formatted_messages.append({"role": "assistant", "content": content})
        
        # Отправляем запрос в GigaChat
        response = self.client.chat(formatted_messages)
        
        # Создаем объект ответа
        return GigaChatResponse(
            content=response.choices[0].message.content,
            usage=GigaChatUsage(
                total_tokens=response.usage.total_tokens,
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens
            )
        )

    async def create_chat_completion_stream(self, messages: List[Dict[str, Any]], **kwargs):
        # GigaChat не поддерживает стриминг, поэтому эмулируем его
        response = self.create_chat_completion(messages, **kwargs)
        yield response 