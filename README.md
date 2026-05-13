# Voice-Press

## App Summary

Voice-Press accepts interview MP4 uploads, extracts audio, transcribes speech (OpenAI Whisper), and uses an LLM to generate a short summary, curated verbatim quotes, and social-media-ready posts from the interview transcript. The primary workflow is upload → transcribe → analyze → return JSON results. The application does not persist transcripts by default; it is intentionally designed as a stateless batch processor.

## Tech Stack

- Backend: Python 3.10+ with FastAPI (single service in `backend/`)
- ASR / LLM: OpenAI hosted APIs (Whisper `whisper-1` for transcription; configurable chat model for analysis)
- Container: `backend/Dockerfile` provides a Docker image including `ffmpeg` for audio extraction
- Tests: `pytest` in `backend/tests/`
- CI: GitHub Actions workflow at `.github/workflows/ci.yml` runs backend tests and rejects committed `backend/.env`

## Repository artifacts of interest

- `backend/gpt_api_server.py` — FastAPI app, audio extraction, transcription, analysis
- `backend/requirements.txt` — runtime Python deps
- `backend/requirements-dev.txt` — test/dev deps
- `backend/Dockerfile` — container image used for Render / Docker deployment
- `backend/.env.example` — example env vars (copy to `.env` locally for development)
- `render.yaml` — Render manifest for quick Docker deployment
- `.github/workflows/ci.yml` — CI: runs tests and enforces `.env` not tracked

## Prerequisites

Install the following before running locally:

- Python 3.10+ and `pip`
- ffmpeg (if not using the Docker image) — used for audio extraction
- (Optional) Docker if you prefer containerized runs
- An OpenAI API key (do NOT commit it to the repo)

Verify:

```
python --version
pip --version
ffmpeg -version   # if running without Docker
```

## Local development setup

1. Clone the repo and change into it:

```bash
git clone <your-repo-url>
cd Voice-Press
```

2. Backend virtualenv and deps (recommended):

Windows:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
pip install -r backend/requirements-dev.txt
```

macOS / Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
pip install -r backend/requirements-dev.txt
```

3. Create a local `.env` for development from the example (DO NOT commit this file):

```bash
cp backend/.env.example backend/.env
# then edit backend/.env and set OPENAI_API_KEY
```

4. Run the backend locally:

```bash
cd backend
uvicorn gpt_api_server:app --host 0.0.0.0 --port 10000
```

Open `http://localhost:10000/` to verify the server responds. Upload flows use `/upload` (multipart form file field `file`).

## Testing

From the `backend/` folder run:

```bash
python -m pytest -q
```

The repo includes mocked unit tests which do not require a real OpenAI key.

## Security & Secrets

- **Do not commit secrets.** The repo now ignores `backend/.env` (see `backend/.gitignore`) and CI (`.github/workflows/ci.yml`) fails on pushes that contain a tracked `backend/.env`.
- If you accidentally checked a secret into git, rotate it immediately (OpenAI dashboard) and purge history using a tool like `bfg` or `git filter-repo`.

Example quick purge commands with BFG (coordination required):

```
# from repo root
bfg --delete-files backend/.env
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

## Deployment (Render.com)

This project is ready for Docker deployment on Render. Use the included `backend/Dockerfile` and `render.yaml` manifest.

Steps on Render:

1. Create a new Web Service using the Docker option and connect your GitHub repo.
2. Add the following environment variables in Render's dashboard (do NOT put them in repo files):
   - `OPENAI_API_KEY` (secret)
   - `GPT_MODEL` (optional; default `gpt-4`)
   - `WHISPER_API_MODEL` (default `whisper-1`)
   - `PORT` (should be `10000`)
3. Choose the free or paid plan depending on expected load and deploy.

Important Render notes:

- Render instances have ephemeral disk; this app writes temporary extracted audio files to `/tmp` and deletes them — this is compatible with Render.
- Ensure `ffmpeg` is available: the provided Dockerfile includes ffmpeg for the container build.
- For production, store `OPENAI_API_KEY` in Render's secret env var store — never in the repo.

## Whisper model and performance

- Default transcription model: `whisper-1` (hosted OpenAI ASR) — a well-supported, accurate hosted model for batch transcription.
- Tradeoffs:
  - If you need much lower latency or cheaper per-minute costs and you have GPU resources, consider running a local Whisper variant (operational overhead increases).
  - For streaming real-time transcription you will need a different architecture; current code performs batch transcription.

## Database / Persistence

- The current Voice-Press code intentionally does not persist transcripts or analyses.
- No database is required for the current feature set. If you later want persistence (store transcripts, user accounts, reports), add a `DATABASE_URL` env var and implement a thin persistence layer (Postgres/Neon recommended).

## Scaling & production considerations

- Concurrency: transcription + LLM calls are CPU/network heavy. For heavy traffic, run multiple instances and/or add a job queue with worker processes to avoid blocking HTTP request threads.
- Rate limiting & abuse: add rate limiting and/or authentication to avoid excessive API calls.
- Monitoring: add logging aggregation and an error monitoring service (Sentry) for production.

## CI / Tests

- The CI workflow `.github/workflows/ci.yml` runs tests and ensures `backend/.env` is not tracked — keep this in place.

## Development tips

- Use the Dockerfile for local parity if you want a dev environment with ffmpeg present without installing it locally:

```bash
docker build -t voicepress-backend:dev backend/
docker run -p 10000:10000 --env-file backend/.env voicepress-backend:dev
```

- The main endpoints:
  - `GET /` — basic health/info
  - `POST /upload` — multipart upload with `file` (MP4). The endpoint will extract audio, transcribe, analyze, and return JSON with summary/quotes/social posts.

## Troubleshooting

- If you see errors about missing `OPENAI_API_KEY`, set it either in `backend/.env` for local testing (never commit) or in your production secrets.
- If audio extraction fails, ensure `ffmpeg` is present in the runtime image or host.

## Contributing

- Add tests for new features under `backend/tests/` and update `requirements-dev.txt` if new dev deps are introduced.
- Keep secrets out of commits; use the CI checks and `.gitignore` to enforce this.

## Contact / Next steps

If you want, I can:

- Add an optional lightweight persistence layer (Postgres) wired to `DATABASE_URL` and example schema/migrations.
- Add a Render-specific health-check or a background worker manifest for queued jobs.
- Harden rate limiting and add a simple token-based auth layer for the `/upload` endpoint.
