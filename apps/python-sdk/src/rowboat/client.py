from typing import Dict, List, Optional, Any, Union
import requests
from .schema import (
    ApiRequest, 
    ApiResponse, 
    ApiMessage, 
    UserMessage, 
    AssistantMessage, 
    AssistantMessageWithToolCalls
)

class Client:
    def __init__(self, host: str, project_id: str, api_key: str) -> None:
        self.base_url: str = f'{host}/api/v1/{project_id}/chat'
        self.headers: Dict[str, str] = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        }

    def _call_api(
        self, 
        messages: List[ApiMessage],
        state: Optional[Dict[str, Any]] = None,
        workflow_id: Optional[str] = None,
        test_profile_id: Optional[str] = None
    ) -> ApiResponse:
        request = ApiRequest(
            messages=messages,
            state=state,
            workflowId=workflow_id,
            testProfileId=test_profile_id
        )
        json_data = request.model_dump()
        response = requests.post(self.base_url, headers=self.headers, json=json_data)

        if not response.status_code == 200:
            raise ValueError(f"Error: {response.status_code} - {response.text}")
    
        response_data = ApiResponse.model_validate(response.json())
        
        if not response_data.messages:
            raise ValueError("No response")
            
        # Ищем последнее сообщение ассистента вместо проверки только последнего сообщения
        last_assistant_message = None
        for message in reversed(response_data.messages):
            if isinstance(message, (AssistantMessage, AssistantMessageWithToolCalls)):
                last_assistant_message = message
                break
        
        if not last_assistant_message:
            raise ValueError("No assistant message found in response")

        return response_data

    def chat(
        self,
        messages: List[ApiMessage],
        state: Optional[Dict[str, Any]] = None,
        workflow_id: Optional[str] = None,
        test_profile_id: Optional[str] = None
    ) -> ApiResponse:
        """Stateless chat method that handles a single conversation turn"""
        
        # call api
        response_data = self._call_api(
            messages=messages,
            state=state,
            workflow_id=workflow_id,
            test_profile_id=test_profile_id
        )

        # Ищем последнее внешнее сообщение ассистента
        last_external_message = None
        for message in reversed(response_data.messages):
            if (isinstance(message, (AssistantMessage, AssistantMessageWithToolCalls)) and 
                hasattr(message, 'agenticResponseType') and 
                message.agenticResponseType == 'external'):
                last_external_message = message
                break
        
        if not last_external_message:
            # Если нет внешнего сообщения, ищем любое сообщение ассистента
            for message in reversed(response_data.messages):
                if isinstance(message, (AssistantMessage, AssistantMessageWithToolCalls)):
                    last_external_message = message
                    break
        
        if not last_external_message:
            raise ValueError("No assistant message found in response")

        return response_data

class StatefulChat:
    """Maintains conversation state across multiple turns"""
    
    def __init__(
        self,
        client: Client,
        workflow_id: Optional[str] = None,
        test_profile_id: Optional[str] = None
    ) -> None:
        self.client = client
        self.messages: List[ApiMessage] = []
        self.state: Optional[Dict[str, Any]] = None
        self.workflow_id = workflow_id
        self.test_profile_id = test_profile_id

    def run(self, message: Union[str]) -> str:
        """Handle a single user turn in the conversation"""
        
        # Process the message
        user_msg = UserMessage(role='user', content=message)
        self.messages.append(user_msg)

        # Get response using the client's chat method
        response_data = self.client.chat(
            messages=self.messages,
            state=self.state,
            workflow_id=self.workflow_id,
            test_profile_id=self.test_profile_id
        )
        
        # Update internal state
        self.messages.extend(response_data.messages)
        self.state = response_data.state
        
        # Ищем последнее внешнее сообщение ассистента для возврата
        last_external_content = None
        for message in reversed(response_data.messages):
            if (isinstance(message, (AssistantMessage, AssistantMessageWithToolCalls)) and 
                hasattr(message, 'agenticResponseType') and 
                message.agenticResponseType == 'external' and
                message.content):
                last_external_content = message.content
                break
        
        # Если нет внешнего сообщения, ищем любое сообщение ассистента с содержимым
        if not last_external_content:
            for message in reversed(response_data.messages):
                if (isinstance(message, (AssistantMessage, AssistantMessageWithToolCalls)) and 
                    message.content):
                    last_external_content = message.content
                    break
        
        # Если все еще нет содержимого, возвращаем сообщение по умолчанию
        if not last_external_content:
            last_external_content = "I'm sorry, I didn't receive a proper response."
        
        return last_external_content


def weather_lookup_tool(city_name: str) -> str:
    return f"The weather in {city_name} is 22°C."


if __name__ == "__main__":
    host: str = "<HOST>"
    project_id: str = "<PROJECT_ID>"
    api_key: str = "<API_KEY>"
    client = Client(host, project_id, api_key)

    result = client.chat(
        messages=[
            UserMessage(role='user', content="Hello")
        ]
    )
    print(result.messages[-1].content)

    chat_session = StatefulChat(client)
    resp = chat_session.run("Hello")
    print(resp)