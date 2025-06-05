import os
import dotenv
from gigachat_client import gigachat_client
dotenv.load_dotenv()

PROVIDER_BASE_URL = os.getenv('PROVIDER_BASE_URL', '')
PROVIDER_DEFAULT_MODEL = os.getenv('PROVIDER_DEFAULT_MODEL')
PROVIDER_COPILOT_MODEL = os.getenv('PROVIDER_COPILOT_MODEL')

if not PROVIDER_COPILOT_MODEL:
    PROVIDER_COPILOT_MODEL = 'gigachat'

if not PROVIDER_DEFAULT_MODEL:
    PROVIDER_DEFAULT_MODEL = 'gigachat'

# Используем GigaChat вместо OpenAI
# Токен теперь получается через функцию get_access_token в gigachat_client
completions_client = gigachat_client