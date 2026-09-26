# AI voice notes

The four employee voice-note controls on `car-information.html` record audio with `MediaRecorder`. Clicking the same button again stops the recording. The browser sends the recording to `/api/summarize-voice-note`; that endpoint verifies the signed-in Supabase employee, transcribes the audio, and asks the OpenAI Responses API for a short note in the spoken language. Only the resulting summary is inserted into the selected service detail field.

## Deployment setup

1. Add `OPENAI_API_KEY` to the hosting project's server-side environment variables. Do not put it in browser code or `supabase-config.js`.
2. Optionally set `OPENAI_TRANSCRIPTION_MODEL` (default `gpt-4o-mini-transcribe`) and `OPENAI_VOICE_SUMMARY_MODEL` (default `gpt-4.1-mini`).
3. Deploy the project with the API route. Recording requires a signed-in employee and a secure browser context (HTTPS or localhost). Each recording is limited to 2 MB.

The microphone stream remains active until the employee clicks stop. Browser permission failures and unsupported recording formats are reported in the page; audio is not stored as a service record.
