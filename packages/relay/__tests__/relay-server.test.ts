import { createServer } from "node:net";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { NarrationClient } from "@narration-runtime/client";
import { NarrationRelayServer } from "../src/index.js";
import type { NarrationServerMessage } from "@narration-runtime/protocol";

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function connectUi(url: string, onSay: (ws: WebSocket, message: NarrationServerMessage) => void): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => {
      ws.send(JSON.stringify({ type: "narration:hello", role: "ui", clientName: "test-ui" }));
      resolve(ws);
    });
    ws.once("error", reject);
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString()) as NarrationServerMessage;
      if (message.type === "narration:say") {
        onSay(ws, message);
      }
    });
  });
}

describe("NarrationRelayServer", () => {
  it("returns skipped when no UI is connected", async () => {
    const port = await getFreePort();
    const relay = new NarrationRelayServer(port, 500);
    await relay.start();

    const client = new NarrationClient({
      url: `ws://127.0.0.1:${port}/ws/narration`,
      clientName: "test-producer",
      timeoutMs: 500,
    });

    try {
      await client.connect();
      const result = await client.say({ text: "No UI should skip." });
      assert.equal(result.type, "narration:skipped");
    } finally {
      await client.close();
      await relay.stop();
    }
  });

  it("relays producer say to UI and returns completed", async () => {
    const port = await getFreePort();
    const relay = new NarrationRelayServer(port, 1000);
    await relay.start();
    const url = `ws://127.0.0.1:${port}/ws/narration`;
    const ui = await connectUi(url, (ws, message) => {
      ws.send(JSON.stringify({
        type: "narration:completed",
        id: message.id,
        durationMs: 123,
      }));
    });

    const client = new NarrationClient({
      url,
      clientName: "test-producer",
      timeoutMs: 1000,
    });

    try {
      await client.connect();
      const result = await client.say({ text: "Relay this.", speaker: "nike" });
      assert.equal(result.type, "narration:completed");
      assert.equal(result.durationMs, 123);
    } finally {
      ui.close();
      await client.close();
      await relay.stop();
    }
  });
});
