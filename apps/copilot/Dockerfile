# Use official Python runtime as base image
FROM python:3.11-slim-buster

# Set working directory in container
WORKDIR /app

# Установка системных зависимостей для PyAudio и SpeechRecognition
RUN apt-get update && apt-get install -y \
    portaudio19-dev \
    python3-pyaudio \
    flac \
    ffmpeg \
    libsndfile1 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Установка дополнительных Python пакетов для работы с аудио
RUN pip install --no-cache-dir pyaudio

# Copy project files
COPY . .

# Expose port if your app needs it (adjust as needed)
ENV PORT=3002

EXPOSE $PORT

# Command to run Flask development server
CMD [ "gunicorn", "--bind", "0.0.0.0:3002", "app:app", "--timeout", "600", "--workers", "1", "--threads", "8" ]
