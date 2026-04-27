import { createServer } from "node:net";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { NarrationClient } from "@narration-runtime/client";
import { NarrationRelayServer } from "@narration-runtime/relay";
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

async function main(): Promise<void> {
  const port = await getFreePort();
  const relay = new NarrationRelayServer(port, 1000);
  await relay.start();
  const url = `ws://127.0.0.1:${port}/ws/narration`;

  const ui = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ui.once("open", () => {
      ui.send(JSON.stringify({ type: "narration:hello", role: "ui", clientName: "smoke-ui" }));
      resolve();
    });
    ui.once("error", reject);
  });
  ui.on("message", (raw) => {
    const message = JSON.parse(raw.toString()) as NarrationServerMessage;
    if (message.type === "narration:say") {
      ui.send(JSON.stringify({
        type: "narration:completed",
        id: message.id,
        durationMs: 1,
      }));
    }
  });

  const client = new NarrationClient({ url, clientName: "smoke-producer", timeoutMs: 1000 });
  await client.connect();
  const result = await client.say({ text: "疎通確認です。", speaker: "nike" });
  assert.equal(result.type, "narration:completed");
  assert.equal(result.durationMs, 1);

  await client.close();
  ui.close();
  await relay.stop();
  console.info("narration-runtime smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
