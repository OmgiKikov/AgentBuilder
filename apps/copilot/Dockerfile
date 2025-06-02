# Use official Python runtime as base image
FROM python:3.11-slim-buster

# Set working directory in container
WORKDIR /app

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Дополнительно устанавливаем недостающие пакеты
RUN pip install --no-cache-dir gigachat langchain-community

# Copy project files
COPY . .

# Expose port if your app needs it (adjust as needed)
ENV PORT=3002
ENV PYTHONUNBUFFERED=1
ENV ACCESS_TOKEN=dummy_token
ENV PROVIDER_API_KEY=dummy_key

EXPOSE $PORT

# Command to run Flask development server
CMD [ "gunicorn", "--bind", "0.0.0.0:3002", "app:app", "--timeout", "600", "--workers", "1", "--threads", "8" ]