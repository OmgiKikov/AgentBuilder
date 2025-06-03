# Use official Python runtime as base image
FROM python:3.12-slim

# Set working directory in container
WORKDIR /app

# Install poetry
RUN pip install poetry

# Copy poetry files
COPY pyproject.toml poetry.lock ./

# Configure poetry to not create virtual environment in container
RUN poetry config virtualenvs.create false

# Install dependencies
RUN poetry install --no-interaction --no-ansi

# Дополнительно устанавливаем недостающие пакеты
RUN pip install gigachat langchain-community langchain-gigachat

# Copy project files
COPY . .

# Set environment variables
ENV QUART_APP=src.app.main
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV ACCESS_TOKEN=dummy_token
ENV PROVIDER_API_KEY=dummy_key

# Command to run Flask development server
CMD ["quart", "run", "--host=0.0.0.0", "--port=3001"]
