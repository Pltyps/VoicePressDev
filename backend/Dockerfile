FROM python:3.11-slim

WORKDIR /app/backend

# Install system deps for ffmpeg probing if needed (optional)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app/backend

ENV PORT=10000
EXPOSE 10000

CMD ["uvicorn", "gpt_api_server:app", "--host", "0.0.0.0", "--port", "10000"]
