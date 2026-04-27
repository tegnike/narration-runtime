import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type {
  NarrationClientMessage,
  NarrationClientRole,
  NarrationSayMessage,
  NarrationServerMessage,
  NarrationStatusMessage,
} from "@narration-runtime/protocol";

const DEFAULT_ACK_TIMEOUT_MS = 45_000;

interface Client {
  ws: WebSocket;
  role: NarrationClientRole;
  clientName?: string;
}

interface PendingUtterance {
  message: NarrationSayMessage;
  timer: ReturnType<typeof setTimeout>;
}

export class NarrationRelayServer {
  private server: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Set<Client>();
  private pending = new Map<string, PendingUtterance>();
  private counter = 0;
  private busyListeners = new Set<(busy: boolean) => void>();

  constructor(
    private readonly port = 3010,
    private readonly ackTimeoutMs = DEFAULT_ACK_TIMEOUT_MS,
  ) {}

  async start(): Promise<void> {
    this.server = createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ server: this.server, path: "/ws/narration" });
    this.wss.on("connection", (ws) => this.handleConnection(ws));
    this.wss.on("error", (err) => console.error("Narration WebSocket error:", err));

    return new Promise<void>((resolve, reject) => {
      this.server!.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(`Narration relay port ${this.port} is already in use.`);
        }
        reject(err);
      });
      this.server!.listen(this.port, () => {
        console.info(`Narration relay listening on http://localhost:${this.port}`);
        console.info(`Narration WebSocket endpoint: ws://localhost:${this.port}/ws/narration`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
    }
    this.pending.clear();
    this.emitBusy();

    for (const client of this.clients) {
      client.ws.close(1001, "Narration relay shutting down");
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this.server) {
      return new Promise<void>((resolve) => {
        this.server!.close(() => {
          console.info("Narration relay stopped");
          this.server = null;
          resolve();
        });
      });
    }
  }

  onBusyChange(listener: (busy: boolean) => void): void {
    this.busyListeners.add(listener);
  }

  offBusyChange(listener: (busy: boolean) => void): void {
    this.busyListeners.delete(listener);
  }

  getUiClientCount(): number {
    return this.getUiClients().length;
  }

  isBusy(): boolean {
    return this.pending.size > 0;
  }

  publishSay(input: Omit<NarrationSayMessage, "type" | "id"> & { id?: string }): string {
    const id = input.id ?? `utt_${Date.now()}_${++this.counter}`;
    const message: NarrationSayMessage = {
      type: "narration:say",
      id,
      text: input.text,
      speaker: input.speaker,
      emotion: input.emotion ?? "neutral",
      interrupt: input.interrupt ?? false,
      metadata: input.metadata,
      timestamp: Date.now(),
    };

    if (!message.text.trim()) {
      this.broadcastStatus({ type: "narration:skipped", id, timestamp: Date.now() });
      return id;
    }

    if (this.getUiClientCount() === 0) {
      console.debug(`[Narration] skipped ${id}: no UI clients`);
      this.broadcastStatus({ type: "narration:skipped", id, timestamp: Date.now() });
      return id;
    }

    const timer = setTimeout(() => {
      console.warn(`[Narration] timed out waiting for completion: ${id}`);
      this.finishPending({
        type: "narration:failed",
        id,
        error: "Narration UI acknowledgement timed out",
        timestamp: Date.now(),
      });
    }, this.ackTimeoutMs);

    const uiClient = this.getUiClients()[0];
    if (!uiClient) {
      console.debug(`[Narration] skipped ${id}: no UI clients`);
      this.broadcastStatus({ type: "narration:skipped", id, timestamp: Date.now() });
      return id;
    }

    this.pending.set(id, { message, timer });
    this.emitBusy();
    this.send(uiClient, message);
    this.broadcast(message, (client) => client.role === "observer");
    this.broadcastState();
    return id;
  }

  private getUiClients(): Client[] {
    return [...this.clients].filter((client) => client.role === "ui");
  }

  private handleConnection(ws: WebSocket): void {
    const client: Client = { ws, role: "observer" };
    this.clients.add(client);
    this.send(client, {
      type: "narration:ready",
      role: client.role,
      uiClients: this.getUiClientCount(),
      pendingCount: this.pending.size,
    });
    this.broadcastState();

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as NarrationClientMessage;
        this.handleMessage(client, msg);
      } catch (err) {
        console.error("Invalid narration WebSocket message:", err);
      }
    });

    ws.on("close", () => {
      this.clients.delete(client);
      this.broadcastState();
    });

    ws.on("error", (err) => {
      console.error("Narration WebSocket client error:", err);
      this.clients.delete(client);
      this.broadcastState();
    });
  }

  private handleMessage(client: Client, msg: NarrationClientMessage): void {
    switch (msg.type) {
      case "narration:hello":
        client.role = msg.role;
        client.clientName = msg.clientName;
        console.info(`[Narration] client role=${client.role}${client.clientName ? ` name=${client.clientName}` : ""}`);
        this.send(client, {
          type: "narration:ready",
          role: client.role,
          uiClients: this.getUiClientCount(),
          pendingCount: this.pending.size,
        });
        this.broadcastState();
        break;

      case "narration:say":
        this.publishSay(msg);
        break;

      case "narration:started":
        this.broadcastStatus({ ...msg, timestamp: msg.timestamp ?? Date.now() });
        break;

      case "narration:completed":
      case "narration:failed":
      case "narration:skipped":
        this.finishPending({ ...msg, timestamp: msg.timestamp ?? Date.now() });
        break;
    }
  }

  private finishPending(status: NarrationStatusMessage): void {
    const pending = this.pending.get(status.id);
    if (pending) {
      clearTimeout(pending.timer);
      this.pending.delete(status.id);
      this.emitBusy();
    }
    this.broadcastStatus(status);
    this.broadcastState();
  }

  private broadcastStatus(status: NarrationStatusMessage): void {
    this.broadcast(status, (client) => client.role === "producer" || client.role === "observer");
  }

  private broadcastState(): void {
    this.broadcast({
      type: "narration:state",
      uiClients: this.getUiClientCount(),
      pendingCount: this.pending.size,
      busy: this.isBusy(),
    });
  }

  private broadcast(
    message: NarrationServerMessage,
    filter: (client: Client) => boolean = () => true,
  ): void {
    for (const client of this.clients) {
      if (filter(client)) {
        this.send(client, message);
      }
    }
  }

  private send(client: Client, message: NarrationServerMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  private emitBusy(): void {
    const busy = this.isBusy();
    for (const listener of this.busyListeners) {
      listener(busy);
    }
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === "/api/narration/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        uiClients: this.getUiClientCount(),
        pendingCount: this.pending.size,
        busy: this.isBusy(),
      }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }
}
