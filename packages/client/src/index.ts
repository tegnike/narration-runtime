import { WebSocket } from "ws";
import type {
  NarrationClientMessage,
  NarrationSayInput,
  NarrationSayMessage,
  NarrationServerMessage,
  NarrationStatusMessage,
  NarrationStatusReason,
  NarrationSuppressedInput,
  NarrationSuppressedMessage,
} from "@narration-runtime/protocol";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;

export type NarrationUnavailableBehavior = "skipped" | "throw";

export interface NarrationClientAdapterOptions {
  url: string;
  clientName?: string;
  timeoutMs?: number;
  connectTimeoutMs?: number;
  reconnectOnSend?: boolean;
  unavailableBehavior?: NarrationUnavailableBehavior;
  onBusyChange?: (busy: boolean) => void;
}

interface PendingUtterance {
  id: string;
  timer: ReturnType<typeof setTimeout>;
  resolve: (status: NarrationStatusMessage) => void;
  reject: (error: Error) => void;
}

export class NarrationClientAdapter {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingUtterance>();
  private counter = 0;
  private connectPromise: Promise<void> | null = null;
  private closed = false;
  private lastBusy = false;
  private busyListeners = new Set<(busy: boolean) => void>();

  private readonly timeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly reconnectOnSend: boolean;
  private readonly unavailableBehavior: NarrationUnavailableBehavior;

  constructor(private readonly options: NarrationClientAdapterOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.reconnectOnSend = options.reconnectOnSend ?? true;
    this.unavailableBehavior = options.unavailableBehavior ?? "skipped";
  }

  async connect(): Promise<void> {
    this.closed = false;

    if (this.isOpen()) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.connectWithFallback();
    return this.connectPromise;
  }

  async say(input: NarrationSayInput): Promise<NarrationStatusMessage> {
    const id = input.id ?? this.nextId();
    const text = input.text.trim();

    if (!text) {
      return this.skippedStatus(id, "empty_text", "Narration text is empty");
    }

    if (this.closed) {
      return this.handleUnavailable(id, "client_closed", "Narration client is closed");
    }

    if (!this.isOpen()) {
      if (!this.reconnectOnSend) {
        return this.handleUnavailable(id, "relay_not_connected", "Narration relay is not connected");
      }

      await this.connect();
    }

    if (!this.isOpen()) {
      return this.handleUnavailable(id, "relay_not_connected", "Narration relay is not connected");
    }

    const message: NarrationSayMessage = {
      type: "narration:say",
      id,
      text,
      thought: input.thought?.trim() || undefined,
      speaker: input.speaker,
      emotion: input.emotion ?? "neutral",
      interrupt: input.interrupt ?? false,
      pace: input.pace,
      intensity: input.intensity,
      priority: input.priority,
      subtitleOnly: input.subtitleOnly,
      queuePolicy: input.queuePolicy,
      maxQueueMs: input.maxQueueMs,
      metadata: input.metadata,
      timestamp: input.timestamp ?? Date.now(),
    };

    return new Promise<NarrationStatusMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.finishPending({
          type: "narration:failed",
          id,
          reason: "timeout",
          error: "Narration completion timed out",
          timestamp: Date.now(),
        });
      }, this.timeoutMs);

      this.pending.set(id, { id, timer, resolve, reject });
      this.emitBusyIfChanged();

      try {
        this.ws!.send(JSON.stringify(message), (error) => {
          if (error) {
            this.finishUnavailablePending(id, "send_failed", `Narration send failed: ${error.message}`);
          }
        });
      } catch (error) {
        this.finishUnavailablePending(id, "send_failed", error instanceof Error ? error.message : "Narration send failed");
      }
    });
  }

  async suppress(input: NarrationSuppressedInput): Promise<string> {
    const id = input.id ?? this.nextId();

    if (this.closed) {
      this.handleUnavailable(id, "client_closed", "Narration client is closed");
      return id;
    }

    if (!this.isOpen()) {
      if (!this.reconnectOnSend) {
        this.handleUnavailable(id, "relay_not_connected", "Narration relay is not connected");
        return id;
      }

      await this.connect();
    }

    if (!this.isOpen()) {
      this.handleUnavailable(id, "relay_not_connected", "Narration relay is not connected");
      return id;
    }

    const message: NarrationSuppressedMessage = {
      type: "narration:suppressed",
      id,
      text: input.text?.trim() || undefined,
      speaker: input.speaker,
      emotion: input.emotion,
      reason: input.reason ?? "producer_suppressed",
      metadata: input.metadata,
      timestamp: input.timestamp ?? Date.now(),
    };

    try {
      await new Promise<void>((resolve, reject) => {
        this.ws!.send(JSON.stringify(message), (error) => {
          if (error) {
            reject(new Error(`Narration suppress send failed: ${error.message}`));
            return;
          }
          resolve();
        });
      });
    } catch (error) {
      if (this.unavailableBehavior === "throw") {
        throw error;
      }
    }

    return id;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.connectPromise = null;
    this.finishAllPending("Narration client closed");

    const ws = this.ws;
    this.ws = null;

    if (!ws || ws.readyState === WebSocket.CLOSED) {
      this.emitBusyIfChanged();
      return;
    }

    await new Promise<void>((resolve) => {
      const finish = () => resolve();

      ws.once("close", finish);
      ws.once("error", finish);
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Narration client closed");
      }
    });

    this.emitBusyIfChanged();
  }

  isBusy(): boolean {
    return this.pending.size > 0;
  }

  onBusyChange(listener: (busy: boolean) => void): void {
    this.busyListeners.add(listener);
  }

  offBusyChange(listener: (busy: boolean) => void): void {
    this.busyListeners.delete(listener);
  }

  private openSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.options.url);
      this.ws = ws;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.terminate();
        reject(new Error(`Narration relay connection timed out after ${this.connectTimeoutMs}ms`));
      }, this.connectTimeoutMs);

      ws.once("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.sendHello(ws);
        resolve();
      });

      ws.once("error", (error) => {
        if (settled) {
          console.debug("[Narration] WebSocket error:", error);
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      });

      ws.on("message", (raw) => this.handleMessage(raw.toString()));
      ws.on("close", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error("Narration relay connection closed before opening"));
        }
        if (this.ws === ws) {
          this.ws = null;
        }
        this.finishAllPending("Narration relay connection closed");
      });
    });
  }

  private async connectWithFallback(): Promise<void> {
    try {
      await this.openSocket();
    } catch (error) {
      this.disconnectSocket();
      if (this.unavailableBehavior === "throw") {
        throw error;
      }
      console.warn(`[Narration] relay unavailable at ${this.options.url}; narration will be skipped`);
    } finally {
      this.connectPromise = null;
    }
  }

  private sendHello(ws: WebSocket): void {
    const message: NarrationClientMessage = {
      type: "narration:hello",
      role: "producer",
      clientName: this.options.clientName,
    };
    ws.send(JSON.stringify(message));
  }

  private handleMessage(raw: string): void {
    let message: NarrationServerMessage;

    try {
      message = JSON.parse(raw) as NarrationServerMessage;
    } catch (error) {
      console.warn("[Narration] received invalid relay message:", error);
      return;
    }

    if (this.isTerminalStatus(message)) {
      this.finishPending(message);
    }
  }

  private isTerminalStatus(message: NarrationServerMessage): message is NarrationStatusMessage {
    return (
      message.type === "narration:completed" ||
      message.type === "narration:failed" ||
      message.type === "narration:skipped"
    );
  }

  private finishPending(status: NarrationStatusMessage): void {
    const pending = this.pending.get(status.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(status.id);
    pending.resolve(status);
    this.emitBusyIfChanged();
  }

  private finishAllPending(reason: string): void {
    for (const id of [...this.pending.keys()]) {
      const pending = this.pending.get(id);
      if (!pending) continue;

      clearTimeout(pending.timer);
      this.pending.delete(id);

      if (this.unavailableBehavior === "throw") {
        pending.reject(new Error(reason));
      } else {
        pending.resolve(this.skippedStatus(id, "connection_closed", reason));
      }
    }

    this.emitBusyIfChanged();
  }

  private finishUnavailablePending(id: string, reason: NarrationStatusReason, error: string): void {
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (this.unavailableBehavior === "throw") {
      pending.reject(new Error(error));
    } else {
      pending.resolve(this.skippedStatus(id, reason, error));
    }

    this.emitBusyIfChanged();
  }

  private handleUnavailable(id: string, reason: NarrationStatusReason, error: string): NarrationStatusMessage {
    if (this.unavailableBehavior === "throw") {
      throw new Error(error);
    }

    return this.skippedStatus(id, reason, error);
  }

  private skippedStatus(id: string, reason: NarrationStatusReason, error: string): NarrationStatusMessage {
    return {
      type: "narration:skipped",
      id,
      reason,
      error,
      timestamp: Date.now(),
    };
  }

  private nextId(): string {
    return `utt_${Date.now()}_${++this.counter}`;
  }

  private isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private disconnectSocket(): void {
    const ws = this.ws;
    this.ws = null;

    if (ws?.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    } else if (ws?.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }

  private emitBusyIfChanged(): void {
    const busy = this.isBusy();
    if (busy === this.lastBusy) {
      return;
    }

    this.lastBusy = busy;
    this.options.onBusyChange?.(busy);
    for (const listener of this.busyListeners) {
      listener(busy);
    }
  }
}

export { NarrationClientAdapter as NarrationClient };
