import os
import requests
import json
import time
from typing import List, Dict, Any, Iterator, Optional

class ChatCompletionChunk:
    def __init__(self, content: str):
        self.choices = [Choice(content)]

class Choice:
    def __init__(self, content: str):
        self.delta = Delta(content)

class Delta:
    def __init__(self, content: str):
        self.content = content

class ChatCompletions:
    def __init__(self, client):
        self.client = client
    
    def create(self, model: str, messages: List[Dict[str, Any]], temperature: float = 0.0, stream: bool = False, **kwargs):
        if stream:
            return self.client._stream_chat_completion(messages, temperature)
        else:
            return self.client.chat_completion(messages)

class Chat:
    def __init__(self, client):
        self.completions = ChatCompletions(client)

class GigaChatClient:
    def __init__(self):
        self.access_token = os.getenv("ACCESS_TOKEN")  # Используем готовый токен
        self.chat = Chat(self)
    
    def _get_access_token(self):
        """Получение токена доступа"""
        # Если токен уже есть, используем его
        if self.access_token:
            return
            
        oauth_url = os.getenv('OAUTH_URL')
        secret_key = os.getenv('SECRET_KEY')
        scope = os.getenv('SCOPE', 'GIGACHAT_API_PERS')
        
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "RqUID": "6f0b1291-c7f3-43c6-bb2e-9f3efb2dc98e",
            "Authorization": f"Bearer {secret_key}"
        }
        
        data = {
            "scope": scope
        }
        
        response = requests.post(oauth_url, headers=headers, data=data, verify=False)
        if response.status_code == 200:
            self.access_token = response.json()['access_token']
        else:
            raise Exception(f"Failed to get access token: {response.status_code} {response.text}")
    
    def chat_completion(self, messages: List[Dict[str, Any]]) -> str:
        """Отправка запроса в GigaChat"""
        if not self.access_token:
            self._get_access_token()
        
        url = "https://gigachat.devices.sberbank.ru/api/v1" + '/chat/completions'
        
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Bearer {self.access_token}'
        }
        
        payload = {
            'model': os.getenv('GIGA_MODEL', 'GigaChat'),
            'messages': messages,
            'temperature': 0.0,
            'max_tokens': 1000
        }
        
        response = requests.post(url, headers=headers, json=payload, verify=False)
        
        if response.status_code == 200:
            result = response.json()
            return result['choices'][0]['message']['content']
        else:
            raise Exception(f"GigaChat API error: {response.status_code} {response.text}")
    
    def _stream_chat_completion(self, messages: List[Dict[str, Any]], temperature: float = 0.0) -> Iterator[ChatCompletionChunk]:
        """Имитация streaming для GigaChat"""
        # Получаем полный ответ
        full_response = self.chat_completion(messages)
        
        # Разбиваем ответ на части и отправляем incremental chunks
        words = full_response.split()
        
        for i, word in enumerate(words):
            # Отправляем каждое слово как отдельный chunk
            chunk_content = word
            if i < len(words) - 1:  # Добавляем пробел если это не последнее слово
                chunk_content += " "
                
            yield ChatCompletionChunk(chunk_content)
            # Небольшая задержка для имитации реального streaming
            time.sleep(0.05)

# Создаем глобальный экземпляр клиента без инициализации токена
gigachat_client = GigaChatClient() 