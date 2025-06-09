import json
import urllib.request
import urllib.parse
import urllib.error
import os
from typing import List, Optional, Dict, Any, Generator
from openai import OpenAI
import asyncio


MODEL_NAME = "gpt-4o-mini"
openai_client = OpenAI()

def evaluation(pass_criteria, transcript_str):
    evaluation_prompt = [
        {
            "role": "system",
            "content": (
                f"You are a neutral evaluator. Evaluate based on these criteria:\n"
                f"{pass_criteria}\n\n"
                "Return ONLY a JSON object in this format:\n"
                '{"verdict": "pass", "details": <reason>} or '
                '{"verdict": "fail", "details": <reason>}.'
            )
        },
        {
            "role": "user",
            "content": (
                f"Here is the conversation transcript:\n\n{transcript_str}\n\n"
                "Did the support bot answer correctly or not? "
                "Return only 'pass' or 'fail' for verdict, and a brief explanation for details."
            )
        }
    ]

    # Run evaluation in a separate thread
    print(f"🧠 Вызов OpenAI API для оценки...")
    eval_response = openai_client.chat.completions.create(
            model=MODEL_NAME,
            messages=evaluation_prompt,
            temperature=0.0,
            response_format={"type": "json_object"}
        )

    if not eval_response.choices:
        raise Exception("No evaluation response received from model")

    response_json_str = eval_response.choices[0].message.content
    # Attempt to parse the JSON
    response_json = json.loads(response_json_str)
    evaluation_result = response_json.get("verdict")
    details = response_json.get("details")
    return evaluation_result, details


class UserMessage:
    def __init__(self, content: str):
        self.role = "user"
        self.content = content


class AssistantMessage:
    def __init__(self, content: str):
        self.role = "assistant"
        self.content = content


class DataSource:
    def __init__(self, id: str, name: str, description: str = None, 
                 active: bool = True, status: str = "ready", 
                 error: str = None, data: Dict[str, Any] = None):
        self.id = id
        self.name = name
        self.description = description
        self.active = active
        self.status = status
        self.error = error
        self.data = data or {}


class SimpleCopilotClient:
    def __init__(self, base_url: str = "http://localhost:3002", api_key: str = None, workflow: Dict[str, Any] = None, rowboat_base_url: str = "http://localhost:3000"):
        """
        Простой клиент для работы с Copilot API без внешних зависимостей
        
        Args:
            base_url: Базовый URL сервера Copilot
            api_key: API ключ для авторизации
            workflow: Готовый workflow с агентами (опционально)
            rowboat_base_url: Базовый URL сервера Rowboat для получения проектов и workflows
        """
        self.base_url = base_url.rstrip('/')
        self.rowboat_base_url = rowboat_base_url.rstrip('/')
        self.api_key = api_key or os.getenv('API_KEY', '')
        self.workflow = workflow

    def get_projects(self) -> List[Dict[str, Any]]:
        """
        Получает список проектов из Rowboat API
        """
        try:
            url = f"{self.rowboat_base_url}/api/projects"
            req = urllib.request.Request(url)
            
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
                    return data
        except Exception as e:
            print(f"Ошибка получения проектов: {e}")
            
        return []

    def get_workflows(self, project_id: str) -> List[Dict[str, Any]]:
        """
        Получает список workflows для проекта из Rowboat API
        """
        try:
            url = f"{self.rowboat_base_url}/api/projects/{project_id}/workflows"
            req = urllib.request.Request(url)
            
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
                    return data
        except Exception as e:
            print(f"Ошибка получения workflows: {e}")
            
        return []
    
    def get_datasource(self, project_id: str) -> List[Dict[str, Any]]:
        """
        Получает список datasource для проекта из Rowboat API
        """
        try:
            url = f"{self.rowboat_base_url}/api/projects/{project_id}/sources"
            headers = {
                'Content-Type': 'application/json'
            }
            if self.api_key:
                headers['Authorization'] = f'Bearer {self.api_key}'
                
            req = urllib.request.Request(url, headers=headers)
            
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode('utf-8'))
                    return data
            
            return DataSource(**response.json())
        except Exception as e:
            print(f"Ошибка получения datasources: {e}")
            
        return []

    def load_workflow_from_project(self, project_id: str, workflow_id: str = None) -> bool:
        """
        Загружает workflow из проекта и добавляет MCP инструменты
        
        Args:
            project_id: ID проекта
            workflow_id: ID workflow (если не указан, берется первый)
            
        Returns:
            bool: True если workflow успешно загружен
        """
        try:
            # Получаем проект для извлечения MCP инструментов
            projects = self.get_projects()
            current_project = next((p for p in projects if p.get('_id') == project_id), None)
            
            workflows = self.get_workflows(project_id)
            if not workflows:
                print(f"Не найдено workflows для проекта {project_id}")
                return False
            
            # Выбираем workflow
            selected_workflow = None
            if workflow_id:
                selected_workflow = next((w for w in workflows if w.get('_id') == workflow_id), None)
            else:
                selected_workflow = workflows[0]  # Берем первый
            
            if not selected_workflow:
                print(f"Workflow не найден")
                return False
            
            # получаем data source
            selected_workflow["datasource"] = self.get_datasource(project_id)
            
            # Добавляем MCP инструменты из проекта в workflow
            if current_project and 'mcpServers' in current_project:
                mcp_tools = []
                for server in current_project['mcpServers']:
                    if server.get('isActive', False) and server.get('isReady', False):
                        for tool in server.get('tools', []):
                            # Преобразуем MCP инструмент в формат workflow
                            workflow_tool = {
                                "name": tool.get('name', tool.get('id')),
                                "description": tool.get('description', ''),
                                "parameters": tool.get('parameters', {}),
                                "isLibrary": False,  # MCP инструменты не являются библиотечными
                                "mcpServer": server.get('name'),  # Добавляем информацию о сервере
                                "mcpToolId": tool.get('id')  # Добавляем ID инструмента
                            }
                            mcp_tools.append(workflow_tool)
                
                # Объединяем существующие инструменты workflow с MCP инструментами
                existing_tools = selected_workflow.get('tools', [])
                selected_workflow['tools'] = existing_tools + mcp_tools
                
                print(f"Добавлено MCP инструментов: {len(mcp_tools)}")
                for tool in mcp_tools:
                    print(f"  - {tool['name']}: {tool['description']}")
            
            self.workflow = selected_workflow
            print(f"Загружен workflow: {selected_workflow.get('name', 'Без имени')}")
            print(f"Агентов: {len(selected_workflow.get('agents', []))}")
            print(f"Всего инструментов: {len(selected_workflow.get('tools', []))}")
            return True
            
        except Exception as e:
            print(f"Ошибка загрузки workflow: {e}")
            return False

    def _get_default_workflow(self) -> Dict[str, Any]:
        """
        Возвращает дефолтный workflow с Example Agent
        """
        return {
            "name": "Default Workflow",
            "agents": [
                {
                    "name": "Example Agent",
                    "description": "An example agent",
                    "instructions": "## 🧑‍ Role:\nYou are an helpful customer support assistant\n\n---\n## ⚙️ Steps to Follow:\n1. Ask the user what they would like help with\n2. Ask the user for their email address and let them know someone will contact them soon.\n\n---\n## 🎯 Scope:\n✅ In Scope:\n- Asking the user their issue\n- Getting their email\n\n❌ Out of Scope:\n- Questions unrelated to customer support\n- If a question is out of scope, politely inform the user and avoid providing an answer.\n\n---\n## 📋 Guidelines:\n✔️ Dos:\n- ask user their issue\n\n❌ Don'ts:\n- don't ask user any other detail than email",
                    "model": "gpt-4.1",
                    "type": "conversation",
                    "disabled": False,
                    "order": 0
                }
            ],
            "tools": [],
            "prompts": [],
            "startAgent": "Example Agent"
        }

    def set_workflow(self, workflow: Dict[str, Any]):
        """
        Устанавливает workflow
        """
        self.workflow = workflow

    def get_workflow_schema(self) -> str:
        """
        Возвращает JSON схему для workflow
        """
        # Упрощенная схема workflow для Copilot
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "agents": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "instructions": {"type": "string"},
                            "model": {"type": "string"},
                            "type": {"type": "string", "enum": ["conversation", "post_process", "escalation"]},
                            "disabled": {"type": "boolean"},
                            "order": {"type": "number"}
                        }
                    }
                },
                "tools": {"type": "array"},
                "prompts": {"type": "array"},
                "startAgent": {"type": "string"}
            }
        }
        return json.dumps(schema)

    def chat_stream(
        self,
        messages: List[UserMessage | AssistantMessage],
        workflow_schema: str = None,
        current_workflow_config: str = None,
        context: Optional[Dict[str, Any]] = None,
        data_sources: Optional[List[DataSource]] = None
    ) -> Generator[str, None, None]:
        """
        Отправляет запрос на /chat_stream и возвращает генератор с потоковым ответом
        """
        # Используем workflow если не передан
        if workflow_schema is None:
            workflow_schema = self.get_workflow_schema()
        if current_workflow_config is None:
            workflow = self.workflow or self._get_default_workflow()
            current_workflow_config = json.dumps(workflow)
        
        # Подготовка данных запроса
        request_data = {
            "messages": [self._message_to_dict(msg) for msg in messages],
            "workflow_schema": workflow_schema,
            "current_workflow_config": current_workflow_config
        }
        
        if context:
            request_data["context"] = context
            
        if data_sources:
            request_data["dataSources"] = [self._datasource_to_dict(ds) for ds in data_sources]
        else:
            request_data["dataSources"] = [self._datasource_to_dict(ds) for ds in self.workflow["datasource"]]

        # Подготовка запроса
        url = f"{self.base_url}/chat_stream"
        data = json.dumps(request_data).encode('utf-8')
        
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
        }
        
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'

        req = urllib.request.Request(url, data=data, headers=headers, method='POST')
        
        try:
            with urllib.request.urlopen(req) as response:
                # Читаем поток данных построчно
                for line in response:
                    line = line.decode('utf-8').strip()
                    
                    # Обрабатываем SSE формат
                    if line.startswith('data: '):
                        data_part = line[6:]  # Убираем 'data: '
                        
                        if data_part == '{}':  # Конец потока
                            break
                            
                        try:
                            data_json = json.loads(data_part)
                            if 'content' in data_json:
                                yield data_json['content']
                        except json.JSONDecodeError:
                            continue
                    elif line.startswith('event: done'):
                        break
                        
        except urllib.error.HTTPError as e:
            error_msg = e.read().decode('utf-8') if e.fp else str(e)
            raise Exception(f"HTTP ошибка {e.code}: {error_msg}")
        except urllib.error.URLError as e:
            raise Exception(f"Ошибка соединения: {e}")

    def chat_stream_simple(
        self,
        user_message: str,
        workflow_schema: str = None,
        current_workflow_config: str = None
    ) -> Generator[str, None, None]:
        """
        Упрощенная версия для отправки одного сообщения пользователя
        """
        messages = [UserMessage(content=user_message)]
        yield from self.chat_stream(messages, workflow_schema, current_workflow_config)

    def get_full_response(
        self,
        messages: List[UserMessage | AssistantMessage],
        workflow_schema: str = None,
        current_workflow_config: str = None,
        context: Optional[Dict[str, Any]] = None,
        data_sources: Optional[List[DataSource]] = None
    ) -> str:
        """
        Получает полный ответ от Copilot (не потоковый)
        """
        full_response = ""
        for chunk in self.chat_stream(messages, workflow_schema, current_workflow_config, context, data_sources):
            full_response += chunk
        return full_response

    def health_check(self) -> bool:
        """
        Проверяет доступность сервера
        """
        try:
            url = f"{self.base_url}/health"
            req = urllib.request.Request(url)
            
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status == 200
        except:
            return False

    def _message_to_dict(self, message: UserMessage | AssistantMessage) -> Dict[str, str]:
        """Преобразует сообщение в словарь"""
        return {
            "role": message.role,
            "content": message.content
        }

    def _datasource_to_dict(self, datasource: DataSource) -> Dict[str, Any]:
        """Преобразует источник данных в словарь"""
        return {
            "_id": datasource["_id"],
            "name": datasource["name"],
            "description": datasource["description"],
            "active": datasource["active"],
            "status": datasource["status"],
            "data": datasource["data"]
        }