import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { NarrationRelayServer } from "@narration-runtime/relay";
import { NarrationClientAdapter } from "../../ai-agent-game-streamer/src/narration/narration-client-adapter.ts";

const port = 31_071;
const url = `ws://127.0.0.1:${port}/ws/narration`;

async function waitForOpen(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

async function main(): Promise<void> {
  const relay = new NarrationRelayServer(port, 2_000);
  const producer = new NarrationClientAdapter({
    url,
    clientName: "ai-agent-game-streamer-e2e",
    timeoutMs: 2_000,
    connectTimeoutMs: 1_000,
    unavailableBehavior: "throw",
  });
  const ui = new WebSocket(url);

  try {
    await relay.start();
    await waitForOpen(ui);

    ui.send(JSON.stringify({
      type: "narration:hello",
      role: "ui",
      clientName: "mock-external-ui",
    }));

    ui.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "narration:say") {
        ui.send(JSON.stringify({
          type: "narration:completed",
          id: message.id,
          durationMs: 1,
          timestamp: Date.now(),
        }));
      }
    });

    await producer.connect();
    const result = await producer.say({
      text: "external runtime smoke",
      speaker: "zundamon",
      emotion: "happy",
    });

    assert.equal(result.type, "narration:completed");
    console.info("ai-agent-game-streamer -> external narration-runtime smoke passed");
  } finally {
    await producer.close();
    ui.close();
    await relay.stop();
  }
}

await main();
