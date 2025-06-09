import os
import logging
from openai import AsyncOpenAI, OpenAI
import dotenv

dotenv.load_dotenv()

# DeepSeek configuration via OpenRouter
BASE_URL = "https://openrouter.ai/api/v1"
MODEL = "anthropic/claude-sonnet-4"
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")

# Legacy environment variables for backward compatibility
PROVIDER_BASE_URL = os.getenv("PROVIDER_BASE_URL", BASE_URL)
PROVIDER_API_KEY = os.getenv("PROVIDER_API_KEY", OPENROUTER_API_KEY)
PROVIDER_DEFAULT_MODEL = os.getenv("PROVIDER_DEFAULT_MODEL", MODEL)

client = None
if not PROVIDER_API_KEY:
    PROVIDER_API_KEY = os.getenv("OPENAI_API_KEY")

if not PROVIDER_API_KEY:
    raise (ValueError("No LLM Provider API key found. Please set OPENROUTER_API_KEY or PROVIDER_API_KEY"))

if not PROVIDER_DEFAULT_MODEL:
    PROVIDER_DEFAULT_MODEL = MODEL

# Use OpenRouter/DeepSeek by default
print(f"Using provider {PROVIDER_BASE_URL} with model {PROVIDER_DEFAULT_MODEL}")
client = AsyncOpenAI(
    base_url=PROVIDER_BASE_URL, 
    api_key=PROVIDER_API_KEY,
    timeout=60.0,  # Увеличиваем таймаут
    max_retries=3  # Добавляем повторные попытки
)

completions_client = None
print(f"Using provider {PROVIDER_BASE_URL} for completions with model {PROVIDER_DEFAULT_MODEL}")
completions_client = OpenAI(
    base_url=PROVIDER_BASE_URL, 
    api_key=PROVIDER_API_KEY,
    timeout=60.0,  # Увеличиваем таймаут
    max_retries=3  # Добавляем повторные попытки
)
