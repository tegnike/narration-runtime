# Narration Runtime UI

Standalone WebSocket-driven narration viewer.

- Connects to `ws://localhost:3010/ws/narration`
- Receives `narration:say` messages
- Synthesizes and plays speech with VOICEVOX
- Sends `narration:started`, `narration:completed`, or `narration:failed`

Run it with:

```bash
npm run ui:dev
```

The UI expects the relay to be running first:

```bash
npm run relay
```

Open `http://localhost:5175`, click the audio enable button, and then start a
producer application. VOICEVOX should be reachable through the Vite proxy at
`/voicevox`, which targets `http://127.0.0.1:50021`.
