FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy only the requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the server code
COPY server.py .
COPY models.py .
COPY utils.py .

# Expose the port the server runs on
EXPOSE 5000

# Command to run the server
CMD ["python", "server.py"]