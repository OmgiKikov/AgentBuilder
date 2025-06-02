import os
import dotenv
from gigachat_client import gigachat_client
dotenv.load_dotenv()

PROVIDER_BASE_URL = os.getenv('PROVIDER_BASE_URL', '')
PROVIDER_API_KEY = os.getenv('PROVIDER_API_KEY')
PROVIDER_DEFAULT_MODEL = os.getenv('PROVIDER_DEFAULT_MODEL')
PROVIDER_COPILOT_MODEL = os.getenv('PROVIDER_COPILOT_MODEL')

if not PROVIDER_COPILOT_MODEL:
    PROVIDER_COPILOT_MODEL = 'gigachat'

if not PROVIDER_API_KEY:
    PROVIDER_API_KEY = os.getenv('ACCESS_TOKEN')

if not PROVIDER_API_KEY:
    raise(ValueError("No LLM Provider API key found"))

if not PROVIDER_DEFAULT_MODEL:
    PROVIDER_DEFAULT_MODEL = 'gigachat'

# Используем GigaChat вместо OpenAI
completions_client = gigachat_client