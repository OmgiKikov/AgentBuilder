import logging
import json
import aiohttp
import jwt
import hashlib
from agents import OpenAIChatCompletionsModel, trace, add_trace_processor
import pprint
from .helpers.gigachat_provider import GigaChatModel

# Import helper functions needed for get_agents
from .helpers.access import (
    get_tool_config_by_name,
    get_tool_config_by_type
)
from .helpers.instructions import (
    add_rag_instructions_to_agent
)
from .types import outputVisibility
from agents import Agent as NewAgent, Runner, FunctionTool, RunContextWrapper, ModelSettings, WebSearchTool
from .tracing import AgentTurnTraceProcessor
# Add import for OpenAI functionality
from src.utils.common import generate_openai_output
from typing import Any
import asyncio
from mcp import ClientSession
from mcp.client.sse import sse_client

from pydantic import BaseModel
from typing import List, Optional, Dict
from .tool_calling import call_rag_tool
from pymongo import MongoClient
import os
MONGO_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/rowboat").strip()
mongo_client = MongoClient(MONGO_URI)
db = mongo_client["rowboat"]

from src.utils.client import client, PROVIDER_DEFAULT_MODEL

class NewResponse(BaseModel):
    messages: List[Dict]
    agent: Optional[Any] = None
    tokens_used: Optional[dict] = {}
    error_msg: Optional[str] = ""

async def mock_tool(tool_name: str, args: str, description: str, mock_instructions: str) -> str:
    try:
        print(f"Mock tool called for: {tool_name}")

        messages = [
            {"role": "system", "content": f"You are simulating the execution of a tool called '{tool_name}'.Here is the description of the tool: {description}. Here are the instructions for the mock tool: {mock_instructions}. Generate a realistic response as if the tool was actually executed with the given parameters."},
            {"role": "user", "content": f"Generate a realistic response for the tool '{tool_name}' with these parameters: {args}. The response should be concise and focused on what the tool would actually return."}
        ]

        print(f"Generating simulated response for tool: {tool_name}")
        response_content = None
        response_content = generate_openai_output(messages, output_type='text', model=PROVIDER_DEFAULT_MODEL)
        return response_content
    except Exception as e:
        print(f"Error in mock_tool: {str(e)}")
        return f"Error: {str(e)}"

async def call_webhook(tool_name: str, args: str, webhook_url: str, signing_secret: str) -> str:
    try:
        print(f"Calling webhook for tool: {tool_name}")
        content_dict = {
            "toolCall": {
                "function": {
                    "name": tool_name,
                    "arguments": args
                }
            }
        }
        request_body = {
            "content": json.dumps(content_dict)
        }

        # Prepare headers
        headers = {}
        if signing_secret:
            content_str = request_body["content"]
            body_hash = hashlib.sha256(content_str.encode('utf-8')).hexdigest()
            payload = {"bodyHash": body_hash}
            signature_jwt = jwt.encode(payload, signing_secret, algorithm="HS256")
            headers["X-Signature-Jwt"] = signature_jwt

        async with aiohttp.ClientSession() as session:
            async with session.post(webhook_url, json=request_body, headers=headers) as response:
                if response.status == 200:
                    response_json = await response.json()
                    return response_json.get("result", "")
                else:
                    error_msg = await response.text()
                    print(f"Webhook error: {error_msg}")
                    return f"Error: {error_msg}"
    except Exception as e:
        print(f"Exception in call_webhook: {str(e)}")
        return f"Error: Failed to call webhook - {str(e)}"

async def call_mcp(tool_name: str, args: str, mcp_server_url: str) -> str:
    try:
        print(f"MCP tool called for: {tool_name} with args: {args} at url: {mcp_server_url}")
        async with sse_client(url=mcp_server_url) as streams:
            async with ClientSession(*streams) as session:
                await session.initialize()
                jargs = json.loads(args)
                response = await session.call_tool(tool_name, arguments=jargs)
                json_output = json.dumps(response.content, default=lambda x: x.__dict__ if hasattr(x, '__dict__') else str(x), indent=2)

        return json_output
    except Exception as e:
        print(f"Error in call_mcp: {str(e)}")
        return f"Error: {str(e)}"

async def catch_all(ctx: RunContextWrapper[Any], args: str, tool_name: str, tool_config: dict, complete_request: dict) -> str:
    try:
        print(f"Catch all called for tool: {tool_name}")
        # Pretty print the complete tool call information
        logging.info("Tool Call Details:\n%s", pprint.pformat({
            'tool_name': tool_name,
            'arguments': json.loads(args) if args else {},
            'config': {
                'description': tool_config.get('description', ''),
                'isMcp': tool_config.get('isMcp', False),
                'mcpServerName': tool_config.get('mcpServerName', ''),
                'parameters': tool_config.get('parameters', {})
            }
        }, indent=2))

        # Create event loop for async operations
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        response_content = None
        if tool_config.get("mockTool", False) or complete_request.get("testProfile", {}).get("mockTools", False):
            # Call mock_tool to handle the response (it will decide whether to use mock instructions or generate a response)
            if complete_request.get("testProfile", {}).get("mockPrompt", ""):
                response_content = await mock_tool(tool_name, args, tool_config.get("description", ""), complete_request.get("testProfile", {}).get("mockPrompt", ""))
            else:
                response_content = await mock_tool(tool_name, args, tool_config.get("description", ""), tool_config.get("mockInstructions", ""))
            print(response_content)
        elif tool_config.get("isMcp", False):

            mcp_server_url = tool_config.get("mcpServerURL", "")
            if not mcp_server_url:
                # Backwards compatibility for old projects
                mcp_server_name = tool_config.get("mcpServerName", "")
                mcp_servers = complete_request.get("mcpServers", {})
                mcp_server_url = next((server.get("url", "") for server in mcp_servers if server.get("name") == mcp_server_name), "")
            response_content = await call_mcp(tool_name, args, mcp_server_url)
        else:
            collection = db["projects"]
            doc = collection.find_one({"_id": complete_request.get("projectId", "")})
            signing_secret = doc.get("secret", "")
            webhook_url = complete_request.get("toolWebhookUrl", "")
            response_content = await call_webhook(tool_name, args, webhook_url, signing_secret)
        return response_content
    except Exception as e:
        print(f"Error in catch_all: {str(e)}")
        return f"Error: {str(e)}"


def get_rag_tool(config: dict, complete_request: dict) -> FunctionTool:
    """
    Creates a RAG tool based on the provided configuration.
    """
    project_id = complete_request.get("projectId", "")
    if config.get("ragDataSources", None):
        print(f"Creating rag_search tool with params:\n-Data Sources: {config.get('ragDataSources', [])}\n-Return Type: {config.get('ragReturnType', 'chunks')}\n-K: {config.get('ragK', 3)}")
        params = {
            "type": "object",
            "properties": {
                "query": {
                "type": "string",
                "description": "The query to search for"
                }
            },
            "additionalProperties": False,
            "required": [
                "query"
            ]
        }
        tool = FunctionTool(
                name="rag_search",
                description="Get information about an article",
                params_json_schema=params,
                on_invoke_tool=lambda ctx, args: call_rag_tool(project_id, json.loads(args)['query'], config.get("ragDataSources", []), config.get("ragReturnType", "chunks"), config.get("ragK", 3))
        )
        return tool
    else:
        return None
    
DEFAULT_MAX_CALLS_PER_PARENT_AGENT = 3

def get_agents(agent_configs, tool_configs, complete_request):
    """
    Creates and initializes Agent objects based on their configurations and connections.
    """
    if not isinstance(agent_configs, list):
        raise ValueError("Agents config is not a list in get_agents")
    if not isinstance(tool_configs, list):
        raise ValueError("Tools config is not a list in get_agents")

    new_agents = []
    new_agent_to_children = {}
    new_agent_name_to_index = {}

    # Create Agent objects from config
    for agent_config in agent_configs:
        print("="*100)
        print(f"Processing config for agent: {agent_config['name']}")

        # Create agent tools
        agent_tools = []
        
        # Add RAG tool if configured
        rag_tool = get_rag_tool(agent_config, complete_request)
        if rag_tool:
            agent_tools.append(rag_tool)
            add_rag_instructions_to_agent(agent_config)

        # Add web search tool if configured
        if agent_config.get("webSearch", False):
            agent_tools.append(WebSearchTool())

        # Add other tools
        for tool_name in agent_config.get("tools", []):
            tool_config = get_tool_config_by_name(tool_configs, tool_name)
            if tool_config:
                params = tool_config.get("parameters", {})
                tool = FunctionTool(
                    name=tool_name,
                    description=tool_config.get("description", ""),
                    params_json_schema=params,
                    on_invoke_tool=lambda ctx, args, tn=tool_name, tc=tool_config: catch_all(ctx, args, tn, tc, complete_request)
                )
                agent_tools.append(tool)
                print(f"Added tool {tool_name} to agent {agent_config['name']}")
            else:
                print(f"WARNING: Tool {tool_name} not found in tool_configs")

        # Create agent with GigaChat model
        model = GigaChatModel()
        
        # add the name and description to the agent instructions
        agent_instructions = f"## Your Name\n{agent_config['name']}\n\n## Description\n{agent_config.get('description', '')}\n\n## Instructions\n{agent_config.get('instructions', '')}"
        
        new_agent = NewAgent(
            name=agent_config["name"],
            instructions=agent_instructions,
            handoff_description=agent_config.get("description", ""),
            model=model,
            tools=agent_tools,
            model_settings=ModelSettings(
                temperature=agent_config.get("temperature", 0),
                max_tokens=agent_config.get("maxTokens", None),
                top_p=agent_config.get("topP", None),
                frequency_penalty=agent_config.get("frequencyPenalty", None),
                presence_penalty=agent_config.get("presencePenalty", None)
            )
        )

        # Set the max calls per parent agent
        new_agent.max_calls_per_parent_agent = agent_config.get("maxCallsPerParentAgent", DEFAULT_MAX_CALLS_PER_PARENT_AGENT)
        if not agent_config.get("maxCallsPerParentAgent", None):
            print(f"WARNING: Max calls per parent agent not received for agent {new_agent.name}. Using rowboat_agents default of {DEFAULT_MAX_CALLS_PER_PARENT_AGENT}")
        else:
            print(f"Max calls per parent agent for agent {new_agent.name}: {new_agent.max_calls_per_parent_agent}")

        # Set output visibility as an attribute (always set it)
        new_agent.output_visibility = agent_config.get("outputVisibility", outputVisibility.EXTERNAL.value)

        # Handle the connected agents
        new_agent_to_children[agent_config["name"]] = agent_config.get("connectedAgents", [])
        new_agent_name_to_index[agent_config["name"]] = len(new_agents)
        new_agents.append(new_agent)
        print(f"Successfully created agent: {agent_config['name']}")

    # Set up agent connections
    for new_agent in new_agents:
        # Initialize the handoffs attribute if it doesn't exist
        if not hasattr(new_agent, 'handoffs'):
            new_agent.handoffs = []
        # Look up the agent's children and create handoffs
        new_agent.handoffs = [new_agents[new_agent_name_to_index[child]] for child in new_agent_to_children[new_agent.name]]
    
    print("Returning created agents")
    print("="*100)
    return new_agents

# Initialize a flag to track if the trace processor is added
trace_processor_added = False

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
    
    # Логируем информацию об агенте и инструментах
    print(f"🔍 Agent information:")
    print(f"   📛 Agent name: {agent.name}")
    print(f"   🤖 Agent model: {type(agent.model).__name__}")
    print(f"   🛠️ Agent tools count: {len(agent.tools) if hasattr(agent, 'tools') and agent.tools else 0}")
    if hasattr(agent, 'tools') and agent.tools:
        print(f"   🔧 Agent tools: {[tool.name for tool in agent.tools]}")
    print(f"   💬 Formatted messages: {formatted_messages}")

    try:
        # Add our custom trace processor only if tracing is enabled
        global trace_processor_added
        if enable_tracing and not trace_processor_added:
            trace_processor = AgentTurnTraceProcessor()
            add_trace_processor(trace_processor)
            trace_processor_added = True

        # Get the stream result without trace context first
        print(f"   🚀 Calling Runner.run_streamed...")
        stream_result = Runner.run_streamed(agent, formatted_messages)
        print(f"   ✅ Runner.run_streamed completed successfully")
        
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
        print(f"❌ Error during streaming run: {str(e)}")
        import traceback
        traceback.print_exc()
        raise