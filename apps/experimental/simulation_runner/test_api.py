#!/usr/bin/env python3
"""
Тест Rowboat API
"""

import requests
import json
import sys
import os

# Добавляем текущую директорию в путь для поиска модулей
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from db import get_collection

def test_rowboat_api():
    """
    Тестирует Rowboat API напрямую
    """
    print("🧪 Тестирование Rowboat API...")
    
    # Используем данные из обновленного runtime.json
    project_id = "5212767e-dadc-49b7-860f-38fa6197c4a2"
    workflow_id = "684813acaef1e0382f855c9b"
    
    # Получаем API key
    api_keys_collection = get_collection('api_keys')
    api_key_doc = api_keys_collection.find_one({"projectId": project_id})
    
    if not api_key_doc:
        print(f"❌ API key не найден для проекта {project_id}")
        return
    
    api_key = api_key_doc['key']
    print(f"✅ API key найден: {api_key[:20]}...")
    
    # Тестовый запрос
    url = f"http://127.0.0.1:3000/api/v1/{project_id}/chat"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    
    payload = {
        "messages": [
            {
                "role": "user",
                "content": "Узнай кто сидит в жёлтом доме?"
            }
        ],
        "state": None,
        "skipToolCalls": False,
        "maxTurns": 3,
        "workflowId": workflow_id
    }
    
    print(f"📤 Отправляю запрос к: {url}")
    print(f"📤 Headers: {headers}")
    print(f"📤 Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=100)
        print(f"📥 Статус: {response.status_code}")
        print(f"📥 Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            print(f"✅ Успешный ответ: {response.text}...")
        else:
            print(f"❌ Ошибка {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"❌ Исключение: {e}")

if __name__ == "__main__":
    test_rowboat_api() 