from openai import OpenAI
from flask import Flask, request, jsonify
from pydantic import BaseModel, ValidationError
from typing import List, Dict, Any, Literal
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

with open('copilot_edit_agent.md', 'r', encoding='utf-8') as file:
    copilot_instructions_edit_agent = file.read()

def get_response(
        messages: List[UserMessage | AssistantMessage],
        workflow_schema: str,
        current_workflow_config: str,
        context: AgentContext | PromptContext | ToolContext | ChatContext | None = None,
        data_sources: List[dict] = [],
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

    # prepare data sources information if available
    data_sources_info = ""
    if data_sources:
        data_sources_info = f"""
**Available Data Sources**: These can be used with RAG for agents
```json
{json.dumps([{"id": ds.get("_id"), "name": ds.get("name")} for ds in data_sources])}
```

**IMPORTANT**: When creating or editing agents, always use the Data Source ID (not name) in the `ragDataSources` array.
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
{data_sources_info}

User: {last_message.content}
"""

    updated_msgs = [{"role": "system", "content": sys_prompt}] + [
        message.model_dump() for message in messages
    ]

    response = completions_client.chat.completions.create(
        model=PROVIDER_COPILOT_MODEL,
        messages=updated_msgs,
        temperature=0.0,
        response_format={"type": "json_object"}
    )

    return response.choices[0].message.content
