export type NarrationClientRole = "ui" | "producer" | "observer";

export type NarrationEmotion =
  | "neutral"
  | "happy"
  | "angry"
  | "sad"
  | "thinking";

export interface NarrationSayMessage {
  type: "narration:say";
  id: string;
  text: string;
  speaker?: string;
  emotion?: NarrationEmotion | string;
  interrupt?: boolean;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export type NarrationSayInput = Omit<NarrationSayMessage, "type" | "id"> & {
  id?: string;
};

export interface NarrationStatusMessage {
  type: "narration:started" | "narration:completed" | "narration:failed" | "narration:skipped";
  id: string;
  durationMs?: number;
  error?: string;
  timestamp?: number;
}

export interface NarrationHelloMessage {
  type: "narration:hello";
  role: NarrationClientRole;
  clientName?: string;
}

export interface NarrationReadyMessage {
  type: "narration:ready";
  role: NarrationClientRole;
  uiClients: number;
  pendingCount: number;
}

export interface NarrationStateMessage {
  type: "narration:state";
  uiClients: number;
  pendingCount: number;
  busy: boolean;
}

export interface NarrationErrorMessage {
  type: "error";
  message: string;
}

export type NarrationClientMessage =
  | NarrationHelloMessage
  | NarrationSayMessage
  | NarrationStatusMessage;

export type NarrationServerMessage =
  | NarrationReadyMessage
  | NarrationStateMessage
  | NarrationSayMessage
  | NarrationStatusMessage
  | NarrationErrorMessage;
