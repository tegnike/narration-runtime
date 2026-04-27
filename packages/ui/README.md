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
