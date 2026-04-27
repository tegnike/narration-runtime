# narration-runtime

Standalone narration runtime for producer apps.

## Packages

- `@narration-runtime/protocol`: WebSocket protocol types.
- `@narration-runtime/relay`: producer/UI/observer relay server.
- `@narration-runtime/client`: TypeScript producer client.
- `@narration-runtime/ui`: React UI for subtitles, character display, and VOICEVOX playback.

## Development

```bash
npm install
npm run build
npm test
npm run relay
npm run ui:dev
```

Default relay endpoint:

```text
ws://localhost:3010/ws/narration
```

Producer apps should send:

```json
{ "type": "narration:hello", "role": "producer", "clientName": "my-app" }
```

Then send `narration:say`. The relay returns one of `narration:completed`, `narration:failed`, or `narration:skipped` for each utterance.
