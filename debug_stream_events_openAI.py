import asyncio
import json
import sys
import os

# Добавляем путь к модулю agents
sys.path.append(os.path.join(os.path.dirname(__file__), 'apps', 'rowboat_agents', 'src'))

from agents import TracingProcessor
import logging
from datetime import datetime, timedelta
import json
from agents import OpenAIChatCompletionsModel, trace, add_trace_processor
from agents import Agent as NewAgent, Runner, FunctionTool, RunContextWrapper, ModelSettings, WebSearchTool
from openai import AsyncOpenAI

trace_processor_added = False

class AgentTurnTraceProcessor(TracingProcessor):
    """Custom trace processor to print detailed information about agent turns."""
    
    def __init__(self):
        self.span_depth = {}  # Track depth of each span
        self.handoff_chain = []  # Track sequence of agent handoffs
        self.message_flow = []  # Track message flow between agents
        
    def _get_indent_level(self, span):
        """Calculate indent level based on parent_id chain."""
        depth = 0
        current_id = span.parent_id
        while current_id:
            depth += 1
            current_id = self.span_depth.get(current_id)
        return depth

    def _format_time(self, timestamp_str):
        """Convert ISO timestamp string to formatted time string in IST timezone."""
        try:
            dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            # Add 5 hours and 30 minutes for IST timezone
            dt = dt + timedelta(hours=5, minutes=30)
            return dt.strftime("%H:%M:%S.%f")[:-3]
        except (ValueError, AttributeError):
            return "00:00:00.000"

    def _calculate_duration(self, start_str, end_str):
        """Calculate duration between two ISO timestamp strings in seconds."""
        try:
            start = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
            end = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
            return (end - start).total_seconds()
        except (ValueError, AttributeError):
            return 0.0

    def _get_span_id(self, span):
        """Safely get span identifier."""
        for attr in ['span_id', 'id', 'trace_id']:
            if hasattr(span, attr):
                return getattr(span, attr)
        return None

    def _print_handoff_chain(self, indent=""):
        """Print the current handoff chain."""
        if self.handoff_chain:
            print(f"{indent}Current Handoff Chain:")
            print(f"{indent}  {' -> '.join(self.handoff_chain)}")

    def _print_message_flow(self, indent=""):
        """Print the message flow history."""
        if self.message_flow:
            print(f"{indent}Message Flow History:")
            for msg in self.message_flow:
                print(f"{indent}  {msg}")

    def on_trace_start(self, trace):
        """Called when a trace starts."""
        separator = "="*100
        print("\n" + separator)
        print("🚀 TRACE START")
        print(f"Name: {trace.name}")
        print(f"ID: {trace.trace_id}")
        if trace.metadata:
            print("\nMetadata:")
            for key, value in trace.metadata.items():
                print(f"  {key}: {value}")
        print(separator + "\n")
        
        # Reset tracking for new trace
        self.handoff_chain = []
        self.message_flow = []

    def on_trace_end(self, trace):
        """Called when a trace ends."""
        separator = "="*100
        print("\n" + separator)
        print("✅ TRACE END")
        print(f"Name: {trace.name}")
        print(f"ID: {trace.trace_id}")
        
        # Print final chain state
        print("\nFinal State:")
        self._print_handoff_chain("  ")
        self._print_message_flow("  ")
        
        print(separator + "\n")
        
        # Clear tracking
        self.span_depth.clear()
        self.handoff_chain = []
        self.message_flow = []

    def on_span_start(self, span):
        """Called when a span starts."""
        try:
            indent = "  " * self._get_indent_level(span)
            start_time = self._format_time(span.started_at)
            span_id = self._get_span_id(span)
            
            # Track span depth
            if span.parent_id and span_id:
                self.span_depth[span_id] = span.parent_id

            # Print span header with clear section separator
            print(f"\n{indent}{'>'*40}")
            print(f"{indent}▶ [{start_time}] {span.span_data.type.upper()} SPAN START")
            print(f"{indent}  ID: {span_id}")
            print(f"{indent}  Parent ID: {span.parent_id}")
            
            data = span.span_data.export()
            
            # Print span-specific information
            if span.span_data.type == "agent":
                agent_name = data.get('name', 'Unknown')
                print(f"{indent}  Agent: {agent_name}")
                print(f"{indent}  Handoffs: {', '.join(data.get('handoffs', []))}")
                
                # Track agent in handoff chain
                if agent_name not in self.handoff_chain:
                    self.handoff_chain.append(agent_name)
                self._print_handoff_chain(indent + "  ")
                
            elif span.span_data.type == "generation":
                print(f"{indent}  Model: {data.get('model', 'Unknown')}")
                messages = data.get('messages', [])
                if messages:
                    print(f"{indent}  Messages: {len(messages)} message(s)")
                    
            elif span.span_data.type == "function":
                print(f"{indent}  Function: {data.get('name', 'Unknown')}")
                args = data.get('arguments')
                if args:
                    print(f"{indent}  Arguments: {args}")
                    
            elif span.span_data.type == "handoff":
                from_agent = data.get('from_agent', 'Unknown')
                to_agent = data.get('to_agent', 'Unknown')
                print(f"{indent}  From: {from_agent}")
                print(f"{indent}  To: {to_agent}")
                
                # Track handoff in message flow
                flow_msg = f"{from_agent} -> {to_agent}"
                self.message_flow.append(flow_msg)
                print(f"{indent}  Message Flow:")
                for msg in self.message_flow[-3:]:  # Show last 3 flows
                    print(f"{indent}    {msg}")
                
            print(f"{indent}{'>'*40}")
                
        except Exception as e:
            print(f"\n❌ Error in on_span_start: {str(e)}")
            import traceback
            print(traceback.format_exc())

    def on_span_end(self, span):
        """Called when a span ends."""
        try:
            indent = "  " * self._get_indent_level(span)
            end_time = self._format_time(span.ended_at)
            duration = self._calculate_duration(span.started_at, span.ended_at)
            
            # Print span end information with clear section separator
            print(f"\n{indent}{'<'*40}")
            print(f"{indent}◀ [{end_time}] {span.span_data.type.upper()} SPAN END")
            print(f"{indent}  Duration: {duration:.3f}s")
            
            data = span.span_data.export()
            
            # Print span-specific output
            if span.span_data.type == "generation":
                output = data.get('output')
                if output:
                    print(f"{indent}  Output: {str(output)}...")
                    
            elif span.span_data.type == "function":
                output = data.get('output')
                if output:
                    print(f"{indent}  Output: {str(output)[:200]}...")
            
            elif span.span_data.type == "handoff":
                self._print_handoff_chain(indent + "  ")
                self._print_message_flow(indent + "  ")
            
            print(f"{indent}{'<'*40}")
            
            # Clean up span depth tracking
            span_id = self._get_span_id(span)
            if span_id and span_id in self.span_depth:
                del self.span_depth[span_id]
                
        except Exception as e:
            print(f"\n❌ Error in on_span_end: {str(e)}")
            import traceback
            print(traceback.format_exc())

    def shutdown(self):
        """Called when the processor is shutting down."""
        self.span_depth.clear()
        self.handoff_chain = []
        self.message_flow = []

    def force_flush(self):
        """Called to force flush any buffered traces/spans."""
        pass 

async def run_streamed(
    agent,
    messages,
    external_tools=None,
    tokens_used=None,
    enable_tracing=False
):
    """
    Wrapper function for initializing and running the Swarm client in streaming mode.
    """
    print(f"Initializing streaming client for agent: {agent.name}")

    # Initialize default parameters
    if external_tools is None:
        external_tools = []
    if tokens_used is None:
        tokens_used = {}

    # Format messages to ensure they're compatible with the OpenAI API
    formatted_messages = []
    for msg in messages:
        if isinstance(msg, dict) and "content" in msg:
            formatted_msg = {
                "role": msg.get("role", "user"),
                "content": msg["content"]
            }
            formatted_messages.append(formatted_msg)
        else:
            formatted_messages.append({
                "role": "user",
                "content": str(msg)
            })

    print("Beginning streaming run")

    try:
        # Add our custom trace processor only if tracing is enabled
        global trace_processor_added
        if enable_tracing and not trace_processor_added:
            trace_processor = AgentTurnTraceProcessor()
            add_trace_processor(trace_processor)
            trace_processor_added = True

        # Get the stream result without trace context first
        stream_result = Runner.run_streamed(agent, formatted_messages)
        
        # If tracing is enabled, wrap the stream_events to handle tracing
        if enable_tracing:
            original_stream_events = stream_result.stream_events
            
            async def wrapped_stream_events():
                # Create trace context inside the async function
                with trace(f"Agent turn: {agent.name}") as trace_ctx:
                    try:
                        async for event in original_stream_events():
                            yield event
                    except GeneratorExit:
                        # Handle generator exit gracefully
                        raise
                    except Exception as e:
                        print(f"Error in stream events: {str(e)}")
                        raise
            
            stream_result.stream_events = wrapped_stream_events
        
        return stream_result
    except Exception as e:
        print(f"Error during streaming run: {str(e)}")
        raise

# Создаем простой внешний инструмент
async def simple_tool():
    """simple_tool который выдает ответ"""
    return "Бим бам бом"

# Создаем FunctionTool для агента
simple_function_tool = FunctionTool(
    name="simple_tool",
    description="simple_tool который выдает ответ",
    params_json_schema={
        "type": "object",
        "properties": {},
        "required": []
    },
    on_invoke_tool=lambda ctx, args: simple_tool()
)

external_tools = [simple_tool]

# Простые сообщения
messages = [
    {"role": "user", "content": "Вызови simple_tool"}
]

# Создаем агента правильно
openai_client = AsyncOpenAI()  # Асинхронный клиент для поддержки stream

model = OpenAIChatCompletionsModel(
    model="gpt-4o",
    openai_client=openai_client
)

agent = NewAgent(
    name="debug_agent",
    model=model,
    instructions="Ты полезный помощник",
    tools=[simple_function_tool]  # Добавляем инструмент к агенту
)

# Счетчик токенов
tokens_used = {"total": 0, "prompt": 0, "completion": 0}

async def debug_stream_events():
    print("=== Начинаем отладку stream_events ===")
    
    # Запускаем swarm_run_streamed
    stream_result = await run_streamed(
        agent=agent,
        messages=messages,
        external_tools=external_tools,
        tokens_used=tokens_used,
        enable_tracing=True
    )
    
    print("=== Обрабатываем события ===")
    
    # Обрабатываем события
    async for event in stream_result.stream_events():
        print(f"\n--- Событие: {event.type} ---")
        print(f"Полный объект события: {event}")
        
        if hasattr(event, '__dict__'):
            print(f"Атрибуты события: {event.__dict__}")
        
        if hasattr(event, 'data'):
            print(f"Данные события: {event.data}")
        
        if hasattr(event, 'item'):
            print(f"Элемент события: {event.item}")
            if hasattr(event.item, 'raw_item'):
                print(f"Raw item: {event.item.raw_item}")
        
        print("-" * 50)

if __name__ == "__main__":
    asyncio.run(debug_stream_events()) 