from openai import OpenAI
from flask import Flask, request, jsonify, Response, stream_with_context
from pydantic import BaseModel, ValidationError, Field
from typing import List, Dict, Any, Literal, Optional
import json
import re
from lib import AgentContext, PromptContext, ToolContext, ChatContext
from client import PROVIDER_COPILOT_MODEL, PROVIDER_DEFAULT_MODEL
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

with open('copilot_multi_agent.md', 'r', encoding='utf-8') as file:
    copilot_instructions_multi_agent = file.read()

with open('copilot_edit_agent.md', 'r', encoding='utf-8') as file:
    copilot_instructions_edit_agent = file.read()

with open('example_multi_agent_1.md', 'r', encoding='utf-8') as file:
    copilot_multi_agent_example1 = file.read()

with open('current_workflow.md', 'r', encoding='utf-8') as file:
    current_workflow_prompt = file.read()

# Combine the instruction files to create the full multi-agent instructions
streaming_instructions = "\n\n".join([
    copilot_instructions_multi_agent,
    copilot_multi_agent_example1,
    current_workflow_prompt
])

def format_gigachat_response(content: str) -> str:
    """
    Автоматически форматирует ответы от GigaChat, исправляя copilot_change блоки
    """
    # Паттерн для поиска блоков copilot_change (включая неправильно отформатированные)
    pattern = r'```copilot_change([^`]*?)```'
    
    def fix_copilot_block(match):
        block_content = match.group(1).strip()
        
        # Если блок уже правильно отформатирован, не трогаем
        lines = block_content.split('\n')
        if len(lines) > 10:  # Много строк = вероятно уже отформатирован
            return match.group(0)
        
        try:
            # Ищем JSON объект
            json_start = block_content.find('{')
            
            if json_start >= 0:
                # Разделяем на комментарии и JSON
                comments_part = block_content[:json_start].strip()
                json_part = block_content[json_start:].strip()
                
                # Парсим JSON
                try:
                    parsed_json = json.loads(json_part)
                    
                    # Форматируем JSON с отступами
                    formatted_json = json.dumps(parsed_json, ensure_ascii=False, indent=2)
                    
                    # Форматируем комментарии
                    result_lines = []
                    if comments_part:
                        # Разбиваем комментарии по ключевым словам
                        comment_parts = comments_part.split('//')
                        for part in comment_parts:
                            part = part.strip()
                            if part and not part.startswith('//'):
                                if any(keyword in part for keyword in ['action:', 'config_type:', 'name:']):
                                    result_lines.append('// ' + part)
                    
                    # Собираем результат
                    result = '\n'.join(result_lines)
                    if result:
                        result += '\n'
                    result += formatted_json
                    
                    return f'```copilot_change\n{result}\n```'
                    
                except json.JSONDecodeError:
                    print(f"JSON parse error in copilot_change block: {json_part[:100]}...")
                    return match.group(0)
            else:
                print(f"No JSON found in copilot_change block: {block_content[:100]}...")
                return match.group(0)
                
        except Exception as e:
            print(f"Error processing copilot_change block: {e}")
            return match.group(0)
    
    # Применяем форматирование
    formatted_content = re.sub(pattern, fix_copilot_block, content, flags=re.DOTALL)
    
    # Логируем результат
    if '```copilot_change' in content:
        print(f"Original copilot_change blocks: {content.count('```copilot_change')}")
        print(f"Applied formatting to copilot_change blocks")
        if formatted_content != content:
            print("✅ Formatting was applied!")
            print("До:")
            print(content)
            print("После:")
            print(formatted_content)
        else:
            print("⚠️ No formatting changes made")
            print("До:")
            print(content)
    
    return formatted_content

def get_streaming_response(
        messages: List[UserMessage | AssistantMessage],
        workflow_schema: str,
        current_workflow_config: str,
        context: AgentContext | PromptContext | ToolContext | ChatContext | None = None,
        dataSources: Optional[List[DataSource]] = None,
) -> Any:
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
        print(f"Data sources found at project level: {dataSources}")
        print(f"Data source Names: {[ds.name for ds in dataSources]}")
        data_sources_prompt = f"""
**NOTE**: The following data sources are available:
```json
{json.dumps([{"id": ds.id, "name": ds.name, "source_data": ds.model_dump()} for ds in dataSources])}
```
"""
    else:
        print("No data sources found at project level")

    # add the workflow schema to the system prompt
    sys_prompt = streaming_instructions.replace("{workflow_schema}", workflow_schema)

    # add the agent model to the system prompt
    sys_prompt = sys_prompt.replace("{agent_model}", PROVIDER_DEFAULT_MODEL)

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
    print(f"Input to copilot chat completions: {updated_msgs}")
    
    return completions_client.chat.completions.create(
        model=PROVIDER_COPILOT_MODEL,
        messages=updated_msgs,
        temperature=0.0,
        stream=True
    )

def create_app():
    app = Flask(__name__)

    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({'status': 'ok'})

    @app.route('/chat_stream', methods=['POST'])
    def chat_stream():
        try:
            request_data = request.json
            if not request_data or 'messages' not in request_data:
                return jsonify({'error': 'No messages provided'}), 400

            print(f"Raw request data: {request_data}")

            messages = [
                UserMessage(**msg) if msg['role'] == 'user' else AssistantMessage(**msg)
                for msg in request_data['messages']
            ]

            workflow_schema = request_data.get('workflow_schema', '')
            current_workflow_config = request_data.get('current_workflow_config', '')
            context = None  # You can add context handling if needed
            dataSources = None
            if 'dataSources' in request_data and request_data['dataSources']:
                print(f"Raw dataSources from request: {request_data['dataSources']}")
                dataSources = [DataSource(**ds) for ds in request_data['dataSources']]
                print(f"Parsed dataSources: {dataSources}")

            def generate():
                stream = get_streaming_response(
                    messages=messages,
                    workflow_schema=workflow_schema,
                    current_workflow_config=current_workflow_config,
                    context=context,
                    dataSources=dataSources
                )

                # Для GigaChat собираем полный ответ и форматируем его
                full_content = ""
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_content += content

                # Применяем форматирование к полному ответу
                formatted_content = format_gigachat_response(full_content)
                
                # Отправляем отформатированный ответ как один чанк
                yield f"data: {json.dumps({'content': formatted_content})}\n\n"
                yield "event: done\ndata: {}\n\n"

            return Response(
                stream_with_context(generate()),
                mimetype='text/event-stream',
                headers={
                    'Cache-Control': 'no-cache',
                    'X-Accel-Buffering': 'no'
                }
            )

        except ValidationError as ve:
            return jsonify({
                'error': 'Invalid request format',
                'details': str(ve)
            }), 400
        except Exception as e:
            return jsonify({
                'error': 'Internal server error',
                'details': str(e)
            }), 500

    return app

if __name__ == '__main__':
    app = create_app()
    print("Starting Flask server...")
    app.run(port=3002, host='0.0.0.0', debug=True) 