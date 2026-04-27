import { createServer } from "node:net";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { NarrationClient } from "@narration-runtime/client";
import { NarrationRelayServer } from "../src/index.js";
import {
  NARRATION_SUPPORTED_EMOTIONS,
  type NarrationServerMessage,
} from "@narration-runtime/protocol";

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
      assert.equal(result.reason, "no_ui_clients");
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

  it("exposes supported emotions through the status API", async () => {
    const port = await getFreePort();
    const relay = new NarrationRelayServer(port, 500);
    await relay.start();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/narration/status`);
      assert.equal(res.status, 200);
      const body = await res.json() as { supportedEmotions: string[] };
      assert.deepEqual(body.supportedEmotions, [...NARRATION_SUPPORTED_EMOTIONS]);
    } finally {
      await relay.stop();
    }
  });

  it("relays style and queue controls to the UI", async () => {
    const port = await getFreePort();
    const relay = new NarrationRelayServer(port, 1000);
    await relay.start();
    const url = `ws://127.0.0.1:${port}/ws/narration`;
    let relayed: NarrationServerMessage | null = null;
    const ui = await connectUi(url, (ws, message) => {
      relayed = message;
      ws.send(JSON.stringify({
        type: "narration:completed",
        id: message.id,
        durationMs: 42,
      }));
    });

    const client = new NarrationClient({
      url,
      clientName: "test-producer",
      timeoutMs: 1000,
    });

    try {
      await client.connect();
      await client.say({
        text: "Fast callout.",
        thought: "This line needs to interrupt lower-priority narration.",
        pace: "fast",
        intensity: "high",
        priority: 10,
        queuePolicy: "replaceIfHigherPriority",
        maxQueueMs: 250,
      });
      assert.ok(relayed);
      assert.equal(relayed.type, "narration:say");
      assert.equal(relayed.thought, "This line needs to interrupt lower-priority narration.");
      assert.equal(relayed.pace, "fast");
      assert.equal(relayed.intensity, "high");
      assert.equal(relayed.priority, 10);
      assert.equal(relayed.queuePolicy, "replaceIfHigherPriority");
      assert.equal(relayed.maxQueueMs, 250);
    } finally {
      ui.close();
      await client.close();
      await relay.stop();
    }
  });

  it("broadcasts suppressed messages to observers", async () => {
    const port = await getFreePort();
    const relay = new NarrationRelayServer(port, 1000);
    await relay.start();
    const url = `ws://127.0.0.1:${port}/ws/narration`;
    const observer = new WebSocket(url);
    const received = new Promise<NarrationServerMessage>((resolve, reject) => {
      observer.once("error", reject);
      observer.on("message", (raw) => {
        const message = JSON.parse(raw.toString()) as NarrationServerMessage;
        if (message.type === "narration:suppressed") {
          resolve(message);
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      observer.once("open", () => {
        observer.send(JSON.stringify({ type: "narration:hello", role: "observer", clientName: "test-observer" }));
        resolve();
      });
      observer.once("error", reject);
    });
    const client = new NarrationClient({
      url,
      clientName: "test-producer",
      timeoutMs: 1000,
    });

    try {
      await client.connect();
      const id = await client.suppress({ text: "Hidden line", reason: "producer_suppressed" });
      const message = await received;
      assert.equal(message.type, "narration:suppressed");
      assert.equal(message.id, id);
      assert.equal(message.text, "Hidden line");
      assert.equal(message.reason, "producer_suppressed");
    } finally {
      observer.close();
      await client.close();
      await relay.stop();
    }
  });
});
