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

with open('additional_prompt.md', 'r', encoding='utf-8') as file:
    additional_prompt = file.read()

# Combine the instruction files to create the full multi-agent instructions
streaming_instructions = "\n\n".join([
    copilot_instructions_multi_agent,
    copilot_multi_agent_example1,
    current_workflow_prompt,
    additional_prompt
])

def format_gigachat_response(content: str) -> str:
    """
    Автоматически форматирует ответы от GigaChat, исправляя copilot_change блоки
    """
    # Паттерн для поиска блоков copilot_change (включая неправильно отформатированные)
    # Ищем как полные блоки с закрывающими кавычками, так и незакрытые блоки
    pattern_complete = r'```copilot_change([^`]*?)```'
    pattern_incomplete = r'copilot_change\s*([^`]*?)(?=\n\n|\Z)'
    
    def fix_copilot_block(match):
        block_content = match.group(1).strip()
        
        try:
            # Ищем JSON объект
            json_start = block_content.find('{')
            
            if json_start >= 0:
                # Разделяем на комментарии и JSON
                comments_part = block_content[:json_start].strip()
                json_part = block_content[json_start:].strip()
                
                # Пытаемся найти конец JSON объекта
                brace_count = 0
                json_end = -1
                in_string = False
                escape_next = False
                
                for i, char in enumerate(json_part):
                    if escape_next:
                        escape_next = False
                        continue
                    
                    if char == '\\':
                        escape_next = True
                        continue
                    
                    if char == '"' and not escape_next:
                        in_string = not in_string
                        continue
                    
                    if not in_string:
                        if char == '{':
                            brace_count += 1
                        elif char == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                json_end = i + 1
                                break
                
                if json_end > 0:
                    json_part = json_part[:json_end]
                
                # Парсим JSON
                try:
                    parsed_json = json.loads(json_part)
                    
                    # Всегда форматируем JSON с отступами для единообразия
                    formatted_json = json.dumps(parsed_json, ensure_ascii=False, indent=2)
                    
                    # Форматируем комментарии
                    result_lines = []
                    if comments_part:
                        # Ищем комментарии в разных форматах - исправлено для имен с пробелами
                        comment_patterns = [
                            r'//\s*action:\s*([^\n/]+?)(?:\s*//|\s*$)',
                            r'//\s*config_type:\s*([^\n/]+?)(?:\s*//|\s*$)', 
                            r'//\s*name:\s*([^\n/]+?)(?:\s*//|\s*$)',
                            r'action:\s*([^\n/]+?)(?:\s*//|\s*$)',
                            r'config_type:\s*([^\n/]+?)(?:\s*//|\s*$)',
                            r'name:\s*([^\n/]+?)(?:\s*//|\s*$)'
                        ]
                        
                        # Извлекаем значения
                        action = None
                        config_type = None
                        name = None
                        
                        for pattern_regex in comment_patterns:
                            matches = re.findall(pattern_regex, comments_part, re.IGNORECASE)
                            if matches:
                                if 'action' in pattern_regex:
                                    action = matches[0].strip()
                                elif 'config_type' in pattern_regex:
                                    config_type = matches[0].strip()
                                elif 'name' in pattern_regex:
                                    name = matches[0].strip()
                        
                        # Добавляем отформатированные комментарии
                        if action:
                            result_lines.append(f'// action: {action}')
                        if config_type:
                            result_lines.append(f'// config_type: {config_type}')
                        if name:
                            result_lines.append(f'// name: {name}')
                    
                    # Собираем результат
                    result = '\n'.join(result_lines)
                    if result:
                        result += '\n'
                    result += formatted_json
                    
                    return f'```copilot_change\n{result}\n```'
                    
                except json.JSONDecodeError as e:
                    print(f"JSON parse error in copilot_change block: {e}")
                    print(f"Problematic JSON: {json_part[:200]}...")
                    
                    # Попытка исправить незавершенный JSON
                    if 'Unterminated string' in str(e):
                        # Пытаемся найти и закрыть незавершенную строку
                        lines = json_part.split('\n')
                        fixed_lines = []
                        for line in lines:
                            if line.strip().endswith('"') and line.count('"') % 2 == 0:
                                fixed_lines.append(line)
                            elif line.strip() and not line.strip().endswith('"') and '"' in line:
                                # Добавляем закрывающую кавычку если строка не закрыта
                                if line.count('"') % 2 == 1:
                                    fixed_lines.append(line + '"')
                                else:
                                    fixed_lines.append(line)
                            else:
                                fixed_lines.append(line)
                        
                        # Добавляем недостающие закрывающие скобки
                        fixed_json = '\n'.join(fixed_lines)
                        open_braces = fixed_json.count('{') - fixed_json.count('}')
                        if open_braces > 0:
                            fixed_json += '\n' + '  ' * (open_braces - 1) + '}\n' * open_braces
                        
                        try:
                            parsed_json = json.loads(fixed_json)
                            formatted_json = json.dumps(parsed_json, ensure_ascii=False, indent=2)
                            
                            # Форматируем комментарии как выше
                            result_lines = []
                            if comments_part:
                                comment_patterns = [
                                    r'//\s*action:\s*([^\n/]+?)(?:\s*//|\s*$)',
                                    r'//\s*config_type:\s*([^\n/]+?)(?:\s*//|\s*$)', 
                                    r'//\s*name:\s*([^\n/]+?)(?:\s*//|\s*$)',
                                    r'action:\s*([^\n/]+?)(?:\s*//|\s*$)',
                                    r'config_type:\s*([^\n/]+?)(?:\s*//|\s*$)',
                                    r'name:\s*([^\n/]+?)(?:\s*//|\s*$)'
                                ]
                                
                                action = None
                                config_type = None
                                name = None
                                
                                for pattern_regex in comment_patterns:
                                    matches = re.findall(pattern_regex, comments_part, re.IGNORECASE)
                                    if matches:
                                        if 'action' in pattern_regex:
                                            action = matches[0].strip()
                                        elif 'config_type' in pattern_regex:
                                            config_type = matches[0].strip()
                                        elif 'name' in pattern_regex:
                                            name = matches[0].strip()
                                
                                if action:
                                    result_lines.append(f'// action: {action}')
                                if config_type:
                                    result_lines.append(f'// config_type: {config_type}')
                                if name:
                                    result_lines.append(f'// name: {name}')
                            
                            result = '\n'.join(result_lines)
                            if result:
                                result += '\n'
                            result += formatted_json
                            
                            print("✅ Successfully fixed malformed JSON!")
                            return f'```copilot_change\n{result}\n```'
                            
                        except json.JSONDecodeError:
                            print("❌ Could not fix malformed JSON")
                            return match.group(0)
                    
                    return match.group(0)
            else:
                print(f"No JSON found in copilot_change block: {block_content[:100]}...")
                return match.group(0)
                
        except Exception as e:
            print(f"Error processing copilot_change block: {e}")
            return match.group(0)
    
    def detect_and_wrap_standalone_json(content: str) -> str:
        """
        Обнаруживает и оборачивает отдельно стоящий JSON в copilot_change блок
        """
        # Более точный поиск JSON объектов с правильным подсчетом скобок
        def find_json_objects(text):
            results = []
            i = 0
            while i < len(text):
                if text[i] == '{':
                    # Найдена открывающая скобка, ищем соответствующую закрывающую
                    brace_count = 0
                    start = i
                    in_string = False
                    escape_next = False
                    
                    while i < len(text):
                        char = text[i]
                        
                        if escape_next:
                            escape_next = False
                        elif char == '\\':
                            escape_next = True
                        elif char == '"' and not escape_next:
                            in_string = not in_string
                        elif not in_string:
                            if char == '{':
                                brace_count += 1
                            elif char == '}':
                                brace_count -= 1
                                if brace_count == 0:
                                    # Найден полный JSON объект
                                    json_str = text[start:i+1]
                                    results.append((start, i+1, json_str))
                                    break
                        i += 1
                    
                    if brace_count != 0:
                        # Незакрытый JSON, пропускаем
                        i = start + 1
                else:
                    i += 1
            
            return results
        
        json_objects = find_json_objects(content)
        
        if not json_objects:
            return content
        
        # Обрабатываем JSON объекты в обратном порядке, чтобы не сбить индексы
        modified_content = content
        
        for start, end, json_str in reversed(json_objects):
            try:
                parsed = json.loads(json_str)
                
                # Проверяем, что это похоже на copilot_change JSON
                if isinstance(parsed, dict) and ('config_changes' in parsed or 'change_description' in parsed):
                    print(f"🔍 Found standalone JSON that looks like copilot_change: {json_str[:100]}...")
                    
                    # Пытаемся определить action, config_type и name из контекста или содержимого
                    action = "edit"  # по умолчанию
                    config_type = "agent"  # по умолчанию
                    name = "Calculator Agent"  # по умолчанию для этого случая
                    
                    # Пытаемся извлечь имя из config_changes
                    if 'config_changes' in parsed and isinstance(parsed['config_changes'], dict):
                        if 'name' in parsed['config_changes']:
                            name = parsed['config_changes']['name']
                    
                    # Форматируем JSON с отступами
                    formatted_json = json.dumps(parsed, ensure_ascii=False, indent=2)
                    
                    # Создаем правильно отформатированный блок
                    result = f"// action: {action}\n// config_type: {config_type}\n// name: {name}\n{formatted_json}"
                    replacement = f'```copilot_change\n{result}\n```'
                    
                    # Заменяем JSON на отформатированный блок
                    modified_content = modified_content[:start] + replacement + modified_content[end:]
                    
                    print("✅ Successfully wrapped standalone JSON in copilot_change block!")
                
            except json.JSONDecodeError:
                continue
            except Exception as e:
                print(f"Error processing standalone JSON: {e}")
                continue
        
        return modified_content
    
    # Сначала обрабатываем полные блоки
    formatted_content = re.sub(pattern_complete, fix_copilot_block, content, flags=re.DOTALL)
    
    # Затем обрабатываем незакрытые блоки
    formatted_content = re.sub(pattern_incomplete, fix_copilot_block, formatted_content, flags=re.DOTALL)
    
    # Если не найдено copilot_change блоков, ищем отдельно стоящий JSON
    if '```copilot_change' not in formatted_content and 'copilot_change' not in formatted_content:
        print("🔍 No copilot_change blocks found, checking for standalone JSON...")
        formatted_content = detect_and_wrap_standalone_json(formatted_content)
    
    # Логируем результат
    if '```copilot_change' in content or 'copilot_change' in content or '{' in content:
        total_blocks = content.count('```copilot_change') + len(re.findall(r'copilot_change(?!\s*```)', content))
        print(f"Original copilot_change blocks: {total_blocks}")
        print(f"Applied formatting to copilot_change blocks")
        if formatted_content != content:
            print("✅ Formatting was applied!")
            # Логируем только первые 500 символов для читаемости
            print("До (первые 500 символов):")
            print(content[:500])
            print("После (первые 500 символов):")
            print(formatted_content[:500])
        else:
            print("⚠️ No formatting changes made")
            print("Контент (первые 500 символов):")
            print(content[:500])
    
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
**ПРИМЕЧАНИЕ**: В настоящее время пользователь работает над следующим агентом:
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