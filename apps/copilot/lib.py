from pydantic import BaseModel
from typing import Literal, List, Any


class AgentContext(BaseModel):
    type: Literal["agent"]
    agentName: str


class PromptContext(BaseModel):
    type: Literal["prompt"]
    promptName: str


class ToolContext(BaseModel):
    type: Literal["tool"]
    toolName: str


class ChatContext(BaseModel):
    type: Literal["chat"]
    messages: List[Any]
