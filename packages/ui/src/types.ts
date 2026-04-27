export type {
  NarrationClientRole,
  NarrationReadyMessage,
  NarrationSayMessage,
  NarrationServerMessage,
  NarrationStateMessage,
  NarrationStatusReason,
  NarrationStatusMessage,
  NarrationSuppressedMessage,
} from "@narration-runtime/protocol";

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

export type StreamMode = 'single' | 'multi'
export type StreamPhase =
  | 'idle'
  | 'starting'
  | 'playing'
  | 'transitioning'
  | 'paused'
  | 'stopped'

export interface BrowserState {
  mode: 'daemon' | 'cdp' | 'none'
  running: boolean
  cdpPort?: number
  launchedByUs: boolean
}

export interface StreamConfig {
  mode: StreamMode
  selectedGames?: string[]
  pauseBetweenGames?: number
  maxGames?: number
  aiAutoEnd?: boolean
  commentsEnabled?: boolean
  visualEndpoint?: string
  visualBatchInterval?: number
}

export interface StreamState {
  phase: StreamPhase
  mode: StreamMode
  currentGame: string | null
  currentGameConfig: unknown | null
  sessionId: string | null
  gamesPlayed: string[]
  gamesCompleted: number
  agentThought: string | null
  agentSpeech: string | null
  config: StreamConfig
  startedAt: number | null
  error: string | null
  browser: BrowserState
}

export interface AgentActivity {
  id: string
  type: string
  content: string
  toolName?: string
  toolStatus?: 'running' | 'completed' | 'error'
  timestamp: number
}

// Stream-UI specific types (TTS)
export interface TTSSentence {
  text: string;
  generationId: number;
  status: "pending" | "synthesizing" | "ready" | "playing" | "done" | "cancelled";
  audioData: ArrayBuffer | null;
}

export type NarrationEmotion = 'neutral' | 'happy' | 'angry' | 'sad' | 'thinking'
