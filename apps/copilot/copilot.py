from openai import OpenAI
from flask import Flask, request, jsonify
from pydantic import BaseModel, ValidationError, Field
from typing import List, Dict, Any, Literal, Optional
import json
from lib import AgentContext, PromptContext, ToolContext, ChatContext
from client import PROVIDER_COPILOT_MODEL
from client import completions_client

class UserMessage(BaseModel):
    role: Literal["user"]
    content: str

class AssistantMessage(BaseModel):
    role: Literal["assistant"]
    content: str

class DataSource(BaseModel):
    id: str = Field(alias='_id')
    name: str
    description: Optional[str] = None
    active: bool = True
    status: str  # 'pending' | 'ready' | 'error' | 'deleted'
    error: Optional[str] = None
    data: dict  # The discriminated union based on type

    class Config:
        populate_by_name = True

with open('copilot_edit_agent.md', 'r', encoding='utf-8') as file:
    copilot_instructions_edit_agent = file.read()

def get_response(
        messages: List[UserMessage | AssistantMessage],
        workflow_schema: str,
        current_workflow_config: str,
        context: AgentContext | PromptContext | ToolContext | ChatContext | None = None,
        dataSources: Optional[List[DataSource]] = None,
        copilot_instructions: str = copilot_instructions_edit_agent
    ) -> str:
    # if context is provided, create a prompt for the context
    if context:
        match context:
            case AgentContext():
                context_prompt = f"""
**NOTE**: The user is currently working on the following agent:
{context.agentName}
"""
            case PromptContext():
                context_prompt = f"""
**NOTE**: The user is currently working on the following prompt:
{context.promptName}
"""
            case ToolContext():
                context_prompt = f"""
**NOTE**: The user is currently working on the following tool:
{context.toolName}
"""
            case ChatContext():
                context_prompt = f"""
**NOTE**: The user has just tested the following chat using the workflow above and has provided feedback / question below this json dump:
```json
{json.dumps(context.messages)}
```
"""
    else:
        context_prompt = ""

    # Add dataSources to the context if provided
    data_sources_prompt = ""
    if dataSources:
        data_sources_prompt = f"""
**NOTE**: The following data sources are available:
```json
{json.dumps([{"id": ds.id, "name": ds.name, "source_data": ds.model_dump()} for ds in dataSources])}
```
"""

    # add the workflow schema to the system prompt
    sys_prompt = copilot_instructions.replace("{workflow_schema}", workflow_schema)

    # add the current workflow config to the last user message
    last_message = messages[-1]
    last_message.content = f"""
Context:
The current workflow config is:
```
{current_workflow_config}
```

{context_prompt}
{data_sources_prompt}

User: {last_message.content}
"""

    updated_msgs = [{"role": "system", "content": sys_prompt}] + [
        message.model_dump() for message in messages
    ]

    # Используем GigaChat для получения ответа
    response = completions_client.chat_completion(updated_msgs)
    
    # Пытаемся преобразовать ответ в JSON, если не получается - возвращаем как есть
    try:
        json_response = json.loads(response)
        return json.dumps(json_response)
    except json.JSONDecodeError:
        return response
