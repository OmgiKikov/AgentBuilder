import os
from openai import OpenAI
import dotenv

dotenv.load_dotenv()

# Legacy environment variables for backward compatibility
PROVIDER_BASE_URL = os.getenv("PROVIDER_BASE_URL")
PROVIDER_API_KEY = os.getenv("PROVIDER_API_KEY")
PROVIDER_DEFAULT_MODEL = os.getenv("PROVIDER_DEFAULT_MODEL")
PROVIDER_COPILOT_MODEL = os.getenv("PROVIDER_COPILOT_MODEL")

if not PROVIDER_API_KEY:
    raise ValueError("No API key found. Please set OPENROUTER_API_KEY environment variable")

# Initialize client with OpenRouter configuration
completions_client = OpenAI(
    base_url=PROVIDER_BASE_URL,
    api_key=PROVIDER_API_KEY,
)

print(f"Using DeepSeek model: {PROVIDER_COPILOT_MODEL} via {PROVIDER_BASE_URL}")
