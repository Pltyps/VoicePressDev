Voice-Press backend — running & testing

Setup

1. Copy `.env.example` to `.env` and fill `OPENAI_API_KEY`.
2. (Optional) create a virtualenv and install deps:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
# for tests:
pip install -r requirements-dev.txt
```

Run locally

```bash
cd backend
uvicorn gpt_api_server:app --host 0.0.0.0 --port 10000
```

Docker

```bash
# build from project root
docker build -t voicepress-backend:latest ./backend
# run
docker run -p 10000:10000 --env-file backend/.env voicepress-backend:latest
```

Tests

```bash
# from backend/
pytest -q
```

Notes

- Copy `.env.example` to `.env` and set `OPENAI_API_KEY` before running.
- The tests mock the OpenAI client to avoid real network calls.
