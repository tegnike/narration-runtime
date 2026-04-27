export type NarrationClientRole = "ui" | "producer" | "observer";

export const NARRATION_SUPPORTED_EMOTIONS = [
  "neutral",
  "happy",
  "angry",
  "sad",
  "thinking",
] as const;

export type NarrationEmotion =
  (typeof NARRATION_SUPPORTED_EMOTIONS)[number];

export const NARRATION_SUPPORTED_PACES = ["slow", "normal", "fast"] as const;
export type NarrationPace = (typeof NARRATION_SUPPORTED_PACES)[number];

export const NARRATION_SUPPORTED_INTENSITIES = ["low", "normal", "high"] as const;
export type NarrationIntensity = (typeof NARRATION_SUPPORTED_INTENSITIES)[number];

export const NARRATION_SUPPORTED_QUEUE_POLICIES = [
  "enqueue",
  "dropIfBusy",
  "replaceIfHigherPriority",
] as const;
export type NarrationQueuePolicy = (typeof NARRATION_SUPPORTED_QUEUE_POLICIES)[number];

export const NARRATION_STATUS_REASONS = [
  "empty_text",
  "client_closed",
  "relay_unavailable",
  "relay_not_connected",
  "send_failed",
  "connection_closed",
  "timeout",
  "no_ui_clients",
  "ui_completed",
  "ui_failed",
  "ui_skipped",
  "interrupted",
  "subtitle_only",
  "queue_drop_busy",
  "queue_replaced_by_priority",
  "queue_expired",
  "producer_suppressed",
] as const;
export type NarrationStatusReason = (typeof NARRATION_STATUS_REASONS)[number];

export interface NarrationSayMessage {
  type: "narration:say";
  id: string;
  text: string;
  thought?: string;
  speaker?: string;
  emotion?: NarrationEmotion | string;
  interrupt?: boolean;
  pace?: NarrationPace | number;
  intensity?: NarrationIntensity | number;
  priority?: number;
  subtitleOnly?: boolean;
  queuePolicy?: NarrationQueuePolicy;
  maxQueueMs?: number;
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
  reason?: NarrationStatusReason | string;
  error?: string;
  timestamp?: number;
}

export interface NarrationSuppressedMessage {
  type: "narration:suppressed";
  id: string;
  text?: string;
  speaker?: string;
  emotion?: NarrationEmotion | string;
  reason?: NarrationStatusReason | string;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

export type NarrationSuppressedInput = Omit<NarrationSuppressedMessage, "type" | "id"> & {
  id?: string;
};

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
  supportedEmotions: readonly NarrationEmotion[];
  supportedPaces: readonly NarrationPace[];
  supportedIntensities: readonly NarrationIntensity[];
  supportedQueuePolicies: readonly NarrationQueuePolicy[];
}

export interface NarrationStateMessage {
  type: "narration:state";
  uiClients: number;
  pendingCount: number;
  busy: boolean;
  supportedEmotions?: readonly NarrationEmotion[];
  supportedPaces?: readonly NarrationPace[];
  supportedIntensities?: readonly NarrationIntensity[];
  supportedQueuePolicies?: readonly NarrationQueuePolicy[];
}

export interface NarrationErrorMessage {
  type: "error";
  message: string;
}

export type NarrationClientMessage =
  | NarrationHelloMessage
  | NarrationSayMessage
  | NarrationSuppressedMessage
  | NarrationStatusMessage;

export type NarrationServerMessage =
  | NarrationReadyMessage
  | NarrationStateMessage
  | NarrationSayMessage
  | NarrationSuppressedMessage
  | NarrationStatusMessage
  | NarrationErrorMessage;
