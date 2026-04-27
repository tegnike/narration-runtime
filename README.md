# narration-runtime

Standalone narration runtime shared by producer applications such as
`ai-agent-game-streamer`.

This repository owns the WebSocket protocol, relay server, producer client,
and narration UI. Producer apps send `narration:say`; the UI performs
VOICEVOX synthesis/playback and reports completion through the relay.

## Packages

| Package | Role |
|---|---|
| `@narration-runtime/protocol` | Shared WebSocket message types |
| `@narration-runtime/client` | TypeScript producer client |
| `@narration-runtime/relay` | WebSocket relay for producer/UI/observer clients |
| `@narration-runtime/ui` | React UI for subtitles, character display, and VOICEVOX playback |

## Requirements

- Node.js 18+
- npm
- VOICEVOX Engine when real TTS playback is needed

The relay and smoke tests do not require VOICEVOX. The UI can open without it,
but synthesis will fail until the engine is available.

## Setup

```bash
npm install
npm run build
npm test
```

## Run

Start the relay:

```bash
npm run relay
```

Start the UI in another terminal:

```bash
npm run ui:dev
```

Default endpoints:

| Service | URL |
|---|---|
| Relay WebSocket | `ws://localhost:3010/ws/narration` |
| Relay status API | `http://localhost:3010/api/narration/status` |
| UI dev server | `http://localhost:5175` |
| VOICEVOX Engine | `http://127.0.0.1:50021` via `/voicevox` proxy |

## Scripts

| Script | Description |
|---|---|
| `npm run build` | Builds protocol/client/relay and the UI production bundle |
| `npm test` | Runs relay/client integration tests |
| `npm run relay` | Starts the relay on port `3010` |
| `npm run ui:dev` | Starts the UI dev server on port `5175` |
| `npm run ui:build` | Builds only the UI |
| `npm run smoke` | Starts relay + mock UI + runtime client and verifies completion |
| `npm run smoke:ai-agent-game-streamer` | Starts this relay and verifies the sibling `ai-agent-game-streamer` adapter can complete a narration round trip |

## Protocol

Every WebSocket client first sends `narration:hello`:

```json
{ "type": "narration:hello", "role": "producer", "clientName": "my-app" }
```

Roles:

| Role | Description |
|---|---|
| `producer` | Sends utterances |
| `ui` | Receives utterances, plays TTS, sends statuses |
| `observer` | Receives state/status events for monitoring |

Producer utterance:

```json
{
  "type": "narration:say",
  "id": "utt_001",
  "text": "ここは慎重にいきます。",
  "speaker": "nike",
  "emotion": "thinking",
  "interrupt": false,
  "metadata": {
    "source": "my-app"
  }
}
```

Emotion types:

| Input emotion | UI display emotion | Description |
|---|---|---|
| `neutral` | `neutral` | Default calm expression |
| `normal` | `neutral` | Compatibility alias for neutral |
| `happy` | `happy` | Positive or pleased expression |
| `joy` | `happy` | Compatibility alias for happy |
| `angry` | `angry` | Angry or frustrated expression |
| `sad` | `sad` | Sad, worried, or unfavorable expression |
| `thinking` | `thinking` | Thinking or considering expression |
| unknown string | `neutral` | Unknown values are accepted and rendered as neutral |

The protocol type exposes `emotion?: NarrationEmotion | string` so producers
can send future custom values without breaking the relay. The bundled UI maps
values to the five available character asset directories: `neutral`, `happy`,
`angry`, `sad`, and `thinking`.

There is no `surprised` character asset. If an older or custom producer sends
`surprised`, the current UI treats it as `happy` for backward compatibility,
but new producers should not rely on it as an official emotion.

Terminal statuses returned to producers:

- `narration:completed`
- `narration:failed`
- `narration:skipped`

If no UI client is connected, the relay returns `narration:skipped`. If the UI
does not acknowledge before the timeout, the relay returns `narration:failed`.

## Producer Client

```ts
import { NarrationClient } from "@narration-runtime/client";

const client = new NarrationClient({
  url: "ws://localhost:3010/ws/narration",
  clientName: "my-app",
  timeoutMs: 45_000,
});

await client.connect();
const result = await client.say({
  text: "ここは慎重にいきます。",
  speaker: "nike",
  emotion: "thinking",
});
await client.close();
```

By default, unavailable relay connections resolve as `narration:skipped`
instead of throwing, so producer applications can keep running.

## ai-agent-game-streamer Integration

During local development, `ai-agent-game-streamer` depends on these sibling
workspace packages through `file:../narration-runtime/packages/...`.

Typical flow:

```bash
cd /Users/user/WorkSpace/narration-runtime
npm run relay
npm run ui:dev
```

```bash
cd /Users/user/WorkSpace/ai-agent-game-streamer
npm run stream:managed -- --narration-url=ws://localhost:3010/ws/narration
```

Cross-repo verification:

```bash
cd /Users/user/WorkSpace/narration-runtime
npm run smoke:ai-agent-game-streamer
```

That smoke test starts the external relay, attaches a mock UI, sends an
utterance through the `ai-agent-game-streamer` producer adapter, and asserts
that `narration:completed` is returned.
