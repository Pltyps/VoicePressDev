Migration notes: OpenAI SDK and Voice-Press

This project previously used the OpenAI SDK patterns (e.g. `openai.ChatCompletion.create` and `openai.Audio.transcribe`) from older releases.

What changed:

- Uses the modern `OpenAI` client class from the `openai` python package.
  - Initialize once: `client = OpenAI(api_key=...)` and reuse.
- Chat completions now use `client.chat.completions.create(...)`.
- Audio transcription now uses `client.audio.transcriptions.create(...)`.
- Calls are wrapped with basic retry/backoff using `tenacity` to improve robustness.

Files changed:

- `requirements.txt` -> `openai>=1.0.0`
- `gpt_api_server.py` -> switched to `OpenAI` client, added retries and comments
- Added `.env.example` for environment variable guidance.

Notes and next steps:

- After updating dependencies (pip install -r requirements.txt), copy `.env.example` to `.env` and populate `OPENAI_API_KEY`.
- Test transcription and chat endpoints in a dev environment before production.
- Consider adding unit tests with mocked `client` to assert behavior without calling the real API.
- If you want streaming responses or more advanced features, we can add streaming handlers.
