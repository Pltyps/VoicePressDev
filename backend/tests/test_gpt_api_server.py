from unittest.mock import Mock
import gpt_api_server


def test_analyze_with_transcript_parses_json(monkeypatch):
    # Mock client.chat.completions.create to return a dict-like response
    fake_reply = '{"summary":"Short summary","quotes":[],"social_posts":{"linkedin":[],"instagram":[]}}'
    fake_resp = {"choices": [{"message": {"content": fake_reply}}]}

    mock_client = Mock()
    mock_client.chat.completions.create.return_value = fake_resp

    monkeypatch.setattr(gpt_api_server, "client", mock_client)

    # Call analyze synchronously through the event loop
    import asyncio
    data = asyncio.get_event_loop().run_until_complete(gpt_api_server.analyze_with_transcript("This is a test transcript"))

    assert isinstance(data, dict)
    assert data.get("summary") == "Short summary"


def test_transcribe_with_openai_returns_text(monkeypatch, tmp_path):
    # Create a small fake audio file
    audio_file = tmp_path / "fake.flac"
    audio_file.write_bytes(b"RIFF....")

    # Mock client.audio.transcriptions.create to accept a file-like and return text
    mock_client = Mock()
    mock_client.audio.transcriptions.create.return_value = {"text": "hello world"}

    monkeypatch.setattr(gpt_api_server, "client", mock_client)
    # Avoid duration check by faking a reasonable audio duration

    text = gpt_api_server.transcribe_with_openai(str(audio_file))
    assert text == "hello world"
