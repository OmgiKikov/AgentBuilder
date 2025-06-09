import traceback
import json
import uuid
import asyncio
from typing import AsyncGenerator, Dict, List, Tuple, Optional
from abc import ABC, abstractmethod
from collections import defaultdict
from .helpers.access import get_agent_by_name, get_prompt_by_type
from .helpers.library_tools import handle_web_search_event
from .helpers.control import get_last_agent_name
from .execute_turn import run_streamed as swarm_run_streamed, get_agents
from .helpers.instructions import add_child_transfer_related_instructions
from .types import PromptType, outputVisibility, ResponseType
from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX


def set_sys_message(messages):
    """
    If the system message is empty, set it to the default message: "You are a helplful assistant."
    """
    messages = [msg.copy() for msg in messages]
    if messages[0].get("role") == "system" and messages[0].get("content") == "":
        messages[0]["content"] = "You are a helpful assistant."
        print("Updated system message: ", messages[0])

    return messages


def add_child_transfer_related_instructions_to_agents(agents):
    for agent in agents:
        add_child_transfer_related_instructions(agent)
    return agents


def add_openai_recommended_instructions_to_agents(agents):
    for agent in agents:
        agent.instructions = RECOMMENDED_PROMPT_PREFIX + "\n\n" + agent.instructions
    return agents


def check_internal_visibility(current_agent):
    """Check if an agent is internal based on its outputVisibility"""
    return current_agent.output_visibility == outputVisibility.INTERNAL.value


def add_sender_details_to_message(message, sender_agent_name):
    message = message.copy()
    message["content"] = (
        f"Agent `{sender_agent_name}` finished processing the request.\nResponse: {message.get('content')}"
    )
    return message


def add_sender_details_to_messages(messages):
    result_messages = []
    for msg in messages:
        if msg.get("sender"):
            result_messages.append(add_sender_details_to_message(message=msg, sender_agent_name=msg.get("sender")))
    return result_messages


def append_messages(messages, accumulated_messages):
    # Create a set of existing message contents for O(1) lookup
    existing_contents = {msg.get("content") for msg in messages}

    # Append messages that aren't already present, preserving order
    for msg in accumulated_messages:
        if msg.get("content") not in existing_contents:
            messages.append(msg)
            existing_contents.add(msg.get("content"))

    return messages


class TurnRunner(ABC):
    def __init__(self, start_agent_name: str) -> None:
        self._start_agent_name = start_agent_name
        self._tokens_used = {"total": 0, "prompt": 0, "completion": 0}
        self._accumulated_messages = []
        self._agent_message_counts = defaultdict(int)
        self._message_queue = asyncio.Queue()

    async def stream(self) -> AsyncGenerator:
        print("\n=== Starting new turn ===")
        print(f"Starting agent: {self._start_agent_name}")

        try:
            asyncio.create_task(self._produce_messages())
            async for msg in self._consume_messages():
                yield msg
        except Exception as e:
            print(traceback.format_exc())
            print(f"Error in stream processing: {str(e)}")
            yield ("error", {"error": str(e), "state": self._get_final_state()})

    async def _produce_messages(self) -> None:
        await self._produce_conversation_messages()
        await self._produce_final_message()

    async def _consume_messages(self) -> AsyncGenerator:
        while True:
            message = await self._message_queue.get()
            if message is None:
                break
            yield message

    @abstractmethod
    async def _produce_conversation_messages(self) -> None:
        pass

    async def _produce_final_message(self) -> None:
        await self._produce_message(message={"state": self._get_final_state()}, message_type="done")
        await self._close_stream()

    async def _produce_message(self, message, message_type="message", message_description=None) -> None:
        if message_description is None:
            message_description = message_type
        print("-" * 100)
        print(f"Yielding {message_description}: {message}")
        print("-" * 100)
        await self._message_queue.put((message_type, message))

    async def _close_stream(self) -> None:
        await self._message_queue.put(None)

    def _get_final_state(self) -> Dict:
        return {
            "last_agent_name": self._get_current_agent_name(),
            "tokens": self._tokens_used,
            "turn_messages": self._accumulated_messages,
        }

    @abstractmethod
    def _get_current_agent_name(self) -> Optional[str]:
        pass

    @abstractmethod
    def _is_current_agent_internal(self) -> bool:
        pass

    async def _produce_assistance_message(
        self,
        response_type: str,
        content: Optional[str] = None,
        citations: Optional[List] = None,
        tool_calls: Optional[List] = None,
    ) -> None:
        sender_agent_name = self._get_current_agent_name()
        message = {
            "content": content,
            "role": "assistant",
            "sender": sender_agent_name,
            "tool_calls": tool_calls,
            "tool_call_id": None,
            "tool_name": None,
            "response_type": response_type,
        }
        if citations:
            message["citations"] = citations
        await self._produce_message(message)
        self._accumulated_messages.append(
            add_sender_details_to_message(message=message, sender_agent_name=sender_agent_name)
        )

    async def _produce_assistance_content_message(self, content: str, citations: Optional[List] = None) -> None:
        self._agent_message_counts[self._get_current_agent_name()] += 1
        await self._produce_assistance_message(
            response_type=self._get_current_agent_response_type(),
            content=content,
            citations=citations,
        )

    def _get_current_agent_response_type(self) -> str:
        if self._is_current_agent_internal():
            return ResponseType.INTERNAL.value
        return ResponseType.EXTERNAL.value


class GreetingTurnRunner(TurnRunner):
    def __init__(self, start_agent_name: str, prompt_configs: Dict) -> None:
        super().__init__(start_agent_name=start_agent_name)
        self._prompt_configs = prompt_configs

    async def _produce_conversation_messages(self) -> None:
        await self._produce_assistance_content_message(content=self._get_greeting_prompt())

    def _get_current_agent_name(self) -> Optional[str]:
        return self._start_agent_name

    def _is_current_agent_internal(self) -> bool:
        return False

    def _get_greeting_prompt(self) -> str:
        return get_prompt_by_type(self._prompt_configs, PromptType.GREETING) or "Как я могу вам помочь?"


class MultiAgentsTurnRunner(TurnRunner):
    def __init__(
        self,
        messages,
        start_agent_name,
        agent_configs,
        tool_configs,
        start_turn_with_start_agent,
        state=None,
        complete_request=None,
        enable_tracing=False,
    ) -> None:
        super().__init__(start_agent_name=start_agent_name)
        self._messages = messages
        self._agent_configs = agent_configs
        self._tool_configs = tool_configs
        self._start_turn_with_start_agent = start_turn_with_start_agent
        self._state = state or {}
        self._complete_request = complete_request or {}
        self._enable_tracing = enable_tracing
        self._child_call_counts = defaultdict(int)
        self._current_agent = None
        self._parent_stack = []
        self._iter = 0

    async def _produce_conversation_messages(self) -> None:
        self._iter = 0
        self._initialize_agent()

        while True:
            self._on_new_iteration_start()

            is_internal_agent = self._is_current_agent_internal()

            stream_result = await swarm_run_streamed(
                agent=self._current_agent,
                messages=self._messages,
                external_tools=None,
                tokens_used=self._tokens_used,
                enable_tracing=self._enable_tracing,
            )

            async for event in stream_result.stream_events():
                try:
                    if event.type == "raw_response_event":
                        if self._event_has_tokens_usage_info(event=event):
                            self._update_tokens_usage_info(event=event)

                        await self._produce_web_search_messages(event=event)
                    elif event.type == "agent_updated_stream_event":
                        if self._should_skip_transfer_control(event=event):
                            continue

                        await self._produce_control_transition_messages(
                            new_agent_name=event.new_agent.name, response_type=ResponseType.INTERNAL.value
                        )

                        if check_internal_visibility(event.new_agent):
                            self._child_call_counts[
                                self._get_parent_child_key(new_agent_name=event.new_agent.name)
                            ] += 1
                            self._parent_stack.append(self._current_agent)
                        self._current_agent = event.new_agent
                    elif event.type == "run_item_stream_event":
                        if event.item.type == "tool_call_item":
                            if hasattr(event.item.raw_item, "type") and event.item.raw_item.type == "web_search_call":
                                await self._produce_web_search_messages(event=event)
                            else:
                                await self._produce_tool_call_message(
                                    tool_call_id=event.item.raw_item.call_id,
                                    tool_name=event.item.raw_item.name,
                                    tool_args=event.item.raw_item.arguments,
                                )
                        elif event.item.type == "tool_call_output_item":
                            tool_call_id, tool_name = self._extract_tool_call_id_and_name_from_event(event=event)

                            await self._produce_tool_response_message(
                                content=str(event.item.output), tool_call_id=tool_call_id, tool_name=tool_name
                            )
                        elif event.item.type == "message_output_item":
                            content, url_citations = self._extract_content_and_citations_from_event(event=event)

                            await self._produce_assistance_content_message(content=content, citations=url_citations)

                            if self._is_current_agent_internal() and self._parent_stack:
                                await self._produce_control_transition_messages(
                                    new_agent_name=self._parent_stack[-1].name,
                                    response_type=self._get_current_agent_response_type(),
                                )
                                self._current_agent = self._parent_stack.pop()
                            elif not self._is_current_agent_internal():
                                break

                except Exception as e:
                    print("\n=== Error in stream event processing ===")
                    print(f"Error: {str(e)}")
                    print("Event details:")
                    print(f"Event type: {event.type if hasattr(event, 'type') else 'unknown'}")
                    if hasattr(event, "__dict__"):
                        print(f"Event attributes: {event.__dict__}")
                    print(f"Full event object: {event}")
                    print(f"Traceback: {traceback.format_exc()}")
                    print("=" * 50)
                    raise

            if not is_internal_agent and self._get_current_agent_name() in self._agent_message_counts:
                break

    def _on_new_iteration_start(self) -> None:
        self._iter += 1
        self._messages = append_messages(self._messages, self._accumulated_messages)
        print("-" * 100)
        print(f"Iteration {iter} of turn loop")
        print(f"Current agent: {self._get_current_agent_name()} (internal: {self._is_current_agent_internal()})")
        print(f"Parent stack: {[agent.name for agent in self._parent_stack]}")
        print("-" * 100)

    def _should_skip_transfer_control(self, event):
        if self._get_current_agent_name() == event.new_agent.name:
            print(
                f"\nSkipping agent transfer attempt: {self._get_current_agent_name()} -> "
                f"{event.new_agent.name} (self-transfer)"
            )
            return True

        current_count = self._child_call_counts[self._get_parent_child_key(new_agent_name=event.new_agent.name)]
        if current_count >= event.new_agent.max_calls_per_parent_agent:
            print(
                f"Skipping transfer from {self._get_current_agent_name()} to "
                f"{event.new_agent.name} (max calls reached from parent to child)"
            )
            return True
        return False

    def _get_parent_child_key(self, new_agent_name: str) -> str:
        return f"{self._get_current_agent_name()}:{new_agent_name}"

    async def _produce_web_search_messages(self, event) -> None:
        web_search_messages = handle_web_search_event(event, self._current_agent)
        for message in web_search_messages:
            message["response_type"] = ResponseType.INTERNAL.value
            await self._produce_message(message)
            if message.get("role") != "tool":
                self._accumulated_messages.append(
                    add_sender_details_to_message(message=message, sender_agent_name=self._get_current_agent_name())
                )

    def _update_tokens_usage_info(self, event):
        self._tokens_used["total"] += event.data.response.usage.total_tokens
        self._tokens_used["prompt"] += event.data.response.usage.input_tokens
        self._tokens_used["completion"] += event.data.response.usage.output_tokens
        print("-" * 50)
        print(f"Found usage information. Updated cumulative tokens: {self._tokens_used}")
        print("-" * 50)

    @staticmethod
    def _event_has_tokens_usage_info(event):
        return (
            hasattr(event.data, "type")
            and event.data.type == "response.completed"
            and hasattr(event.data.response, "usage")
        )

    @staticmethod
    def _extract_tool_call_id_and_name_from_event(event) -> Tuple:
        tool_call_id = None
        tool_name = None

        if hasattr(event.item.raw_item, "call_id"):
            tool_call_id = event.item.raw_item.call_id
        elif isinstance(event.item.raw_item, dict) and "call_id" in event.item.raw_item:
            tool_call_id = event.item.raw_item["call_id"]

        if hasattr(event.item.raw_item, "name"):
            tool_name = event.item.raw_item.name
        elif isinstance(event.item.raw_item, dict):
            if "name" in event.item.raw_item:
                tool_name = event.item.raw_item["name"]
            elif "type" in event.item.raw_item and event.item.raw_item["type"] == "function_call_output":
                tool_name = "recommendation"

        if not tool_name and hasattr(event.item, "tool_name"):
            tool_name = event.item.tool_name
        if not tool_call_id and hasattr(event.item, "tool_call_id"):
            tool_call_id = event.item.tool_call_id

        return tool_call_id, tool_name

    @staticmethod
    def _extract_content_and_citations_from_event(event) -> Tuple:
        content = ""
        url_citations = []
        if hasattr(event.item.raw_item, "content"):
            for content_item in event.item.raw_item.content:
                if hasattr(content_item, "text"):
                    content += content_item.text
                if hasattr(content_item, "annotations"):
                    for annotation in content_item.annotations:
                        if hasattr(annotation, "type") and annotation.type == "url_citation":
                            citation = {
                                "url": annotation.url if hasattr(annotation, "url") else "",
                                "title": (annotation.title if hasattr(annotation, "title") else ""),
                                "start_index": (annotation.start_index if hasattr(annotation, "start_index") else 0),
                                "end_index": (annotation.end_index if hasattr(annotation, "end_index") else 0),
                            }
                            url_citations.append(citation)
        return content, url_citations

    async def _produce_tool_call_message(
        self, tool_call_id: Optional[str], tool_name: Optional[str], tool_args: Optional[str]
    ) -> None:
        await self._produce_assistance_message(
            response_type=ResponseType.INTERNAL.value,
            tool_calls=[
                {
                    "function": {
                        "name": tool_name,
                        "arguments": tool_args,
                    },
                    "id": tool_call_id,
                    "type": "function",
                }
            ],
        )

    async def _produce_tool_response_message(
        self, content: str, tool_call_id: Optional[str], tool_name: Optional[str]
    ) -> None:
        await self._produce_message(
            message={
                "content": content,
                "role": "tool",
                "sender": None,
                "tool_calls": None,
                "tool_call_id": tool_call_id,
                "tool_name": tool_name,
                "response_type": ResponseType.INTERNAL.value,
            },
            message_description="tool call output message",
        )

    async def _produce_control_transition_messages(self, new_agent_name: str, response_type: str) -> None:
        tool_call_id = str(uuid.uuid4())
        await self._produce_control_transition_call_message(
            tool_call_id=tool_call_id, new_agent_name=new_agent_name, response_type=response_type
        )
        await self._produce_control_transition_response_message(
            tool_call_id=tool_call_id, new_agent_name=new_agent_name
        )

    async def _produce_control_transition_call_message(
        self, tool_call_id: str, new_agent_name: str, response_type: str
    ) -> None:
        await self._produce_message(
            message={
                "content": None,
                "role": "assistant",
                "sender": self._get_current_agent_name(),
                "tool_calls": [
                    {
                        "function": {
                            "name": "transfer_to_agent",
                            "arguments": json.dumps({"assistant": new_agent_name}),
                        },
                        "id": tool_call_id,
                        "type": "function",
                    }
                ],
                "tool_call_id": None,
                "tool_name": None,
                "response_type": response_type,
            },
            message_description="control transition message",
        )

    async def _produce_control_transition_response_message(self, tool_call_id: str, new_agent_name: str) -> None:
        await self._produce_message(
            message={
                "content": json.dumps({"assistant": new_agent_name}),
                "role": "tool",
                "sender": None,
                "tool_calls": None,
                "tool_call_id": tool_call_id,
                "tool_name": "transfer_to_agent",
            },
            message_description="control transition response",
        )

    def _is_current_agent_internal(self) -> bool:
        return check_internal_visibility(self._current_agent)

    def _initialize_agent(self):
        agents = get_agents(
            agent_configs=self._agent_configs,
            tool_configs=self._tool_configs,
            complete_request=self._complete_request,
        )
        agents = add_child_transfer_related_instructions_to_agents(agents)
        agents = add_openai_recommended_instructions_to_agents(agents)
        last_agent_name = get_last_agent_name(
            state=self._state,
            agent_configs=self._agent_configs,
            start_agent_name=self._start_agent_name,
            msg_type="user",
            latest_assistant_msg=None,
            start_turn_with_start_agent=self._start_turn_with_start_agent,
        )
        self._current_agent = get_agent_by_name(last_agent_name, agents)

    def _get_current_agent_name(self) -> Optional[str]:
        return self._current_agent.name if self._current_agent else None


def _is_greeting_turn(messages) -> bool:
    return all(msg.get("role") == "system" for msg in messages)


async def run_turn_streamed(
    messages,
    start_agent_name,
    agent_configs,
    tool_configs,
    prompt_configs,
    start_turn_with_start_agent,
    state={},
    complete_request={},
    enable_tracing=None,
):
    """
    Run a turn of the conversation with streaming responses.

    A turn consists of all messages between user inputs and must follow these rules:
    1. Each turn must have exactly one external message from an agent with external visibility
    2. A turn can have multiple internal messages from internal agents
    3. Each agent can output at most one regular message per parent
    4. Control flows from parent to child, and child must return to parent after responding
    5. Turn ends when an external agent outputs a message
    """
    if _is_greeting_turn(messages):
        turn_runner = GreetingTurnRunner(start_agent_name=start_agent_name, prompt_configs=prompt_configs)
    else:
        messages = set_sys_message(messages)
        messages = add_sender_details_to_messages(messages)
        enable_tracing = complete_request.get("enable_tracing", False) if enable_tracing is None else enable_tracing

        turn_runner = MultiAgentsTurnRunner(
            messages=messages,
            start_agent_name=start_agent_name,
            agent_configs=agent_configs,
            tool_configs=tool_configs,
            start_turn_with_start_agent=start_turn_with_start_agent,
            state=state,
            complete_request=complete_request,
            enable_tracing=enable_tracing,
        )

    async for event in turn_runner.stream():
        yield event
