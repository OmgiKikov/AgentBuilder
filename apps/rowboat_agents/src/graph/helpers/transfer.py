from src.utils.common import common_logger
from agents import FunctionTool
logger = common_logger

def create_transfer_function_to_agent(agent):
    agent_name = agent.name

    fn_spec = {
        "name": f"transfer_to_{agent_name.lower().replace(' ', '_')}",
        "description": f"Function to transfer the chat to {agent_name}.",
        "return_value": agent
    }

    def generated_function(*args, **kwargs):
        logger.info(f"Transferring chat to {agent_name}")
        return fn_spec.get('return_value', None)
    
    generated_function.__name__ = fn_spec['name']
    generated_function.__doc__ = fn_spec.get('description', '')
    
    return generated_function

def create_transfer_tool_to_agent(from_agent, to_agent):
    """Create a FunctionTool for transferring from one agent to another."""
    tool_name = f"transfer_to_{to_agent.name.lower().replace(' ', '_')}"
    
    def transfer_function(*args, **kwargs):
        logger.info(f"Transferring chat from {from_agent.name} to {to_agent.name}")
        return to_agent
    
    return FunctionTool(
        name=tool_name,
        description=f"Transfer the conversation to {to_agent.name}",
        params_json_schema={
            "type": "object",
            "properties": {},
            "additionalProperties": False,
            "required": []
        },
        on_invoke_tool=lambda ctx, args: transfer_function()
    )

def create_transfer_function_to_parent_agent(parent_agent, children_aware_of_parent, transfer_functions):
    if children_aware_of_parent:
        name = f"{transfer_functions[parent_agent.name].__name__}_from_child"
        description = f"Function to transfer the chat to your parent agent: {parent_agent.name}."
    else:
        name = "give_up_chat_control"
        description = "Function to give up control of the chat when you are unable to handle it."
    

    fn_spec = {
        "name": name,
        "description": description,
        "return_value": parent_agent
    }

    def generated_function(*args, **kwargs):
        logger.info(f"Transferring chat to parent agent: {parent_agent.name}")
        return fn_spec.get('return_value', None)
    
    generated_function.__name__ = fn_spec['name']
    generated_function.__doc__ = fn_spec.get('description', '')
    
    return generated_function