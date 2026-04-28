import { create } from 'zustand'
import type {
  StreamState,
  AgentActivity,
  ConnectionStatus,
  NarrationEmotion,
} from '../types'
import { MAX_ACTIVITIES, MAX_EVENT_LOG } from '../constants'

interface StreamStore {
  // Connection
  connectionStatus: ConnectionStatus
  setConnectionStatus: (status: ConnectionStatus) => void

  // Stream state
  state: StreamState
  setState: (state: StreamState) => void
  updateState: (partial: Partial<StreamState>) => void

  // Activities
  activities: AgentActivity[]
  addActivity: (activity: AgentActivity) => void

  // Event log
  eventLog: { time: string; type: string; content: string }[]
  addEventLog: (type: string, content: string) => void
  thoughtLog: { time: string; content: string }[]
  addThoughtLog: (content: string) => void

  // TTS state
  isSpeaking: boolean
  setIsSpeaking: (speaking: boolean) => void
  isTTSBusy: boolean
  setIsTTSBusy: (busy: boolean) => void
  currentSubtitle: string
  setSubtitle: (text: string) => void
  currentEmotion: NarrationEmotion
  setEmotion: (emotion: NarrationEmotion) => void

  // VOICEVOX
  voicevoxStatus: 'connected' | 'unavailable' | 'checking'
  setVoicevoxStatus: (status: 'connected' | 'unavailable' | 'checking') => void

  // Live mode (filter initial history from TTS)
  isLive: boolean
  setIsLive: (live: boolean) => void
}

const DEFAULT_STATE: StreamState = {
  phase: 'idle',
  mode: 'single',
  currentGame: null,
  currentGameConfig: null,
  sessionId: null,
  gamesPlayed: [],
  gamesCompleted: 0,
  agentThought: null,
  agentSpeech: null,
  config: { mode: 'single' },
  startedAt: null,
  error: null,
  browser: { mode: 'none', running: false, launchedByUs: false },
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ja-JP', { hour12: false })
}

export const useStreamStore = create<StreamStore>((set) => ({
  connectionStatus: 'disconnected',
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  state: DEFAULT_STATE,
  setState: (state) => set({ state }),
  updateState: (partial) =>
    set((prev) => ({
      state: { ...prev.state, ...partial },
    })),

  activities: [],
  addActivity: (activity) =>
    set((prev) => {
      const next = [...prev.activities, activity]
      if (next.length > MAX_ACTIVITIES) next.shift()
      return { activities: next }
    }),

  eventLog: [],
  addEventLog: (type, content) =>
    set((prev) => {
      const next = [
        ...prev.eventLog,
        { time: formatTime(new Date()), type, content },
      ]
      if (next.length > MAX_EVENT_LOG) next.shift()
      return { eventLog: next }
    }),
  thoughtLog: [],
  addThoughtLog: (content) =>
    set((prev) => {
      const next = [
        ...prev.thoughtLog,
        { time: formatTime(new Date()), content: content.trim() },
      ]
      if (next.length > MAX_EVENT_LOG) next.shift()
      return { thoughtLog: next }
    }),

  isSpeaking: false,
  setIsSpeaking: (speaking) => set({ isSpeaking: speaking }),
  isTTSBusy: false,
  setIsTTSBusy: (busy) => set({ isTTSBusy: busy }),
  currentSubtitle: '',
  setSubtitle: (text) => set({ currentSubtitle: text }),
  currentEmotion: 'neutral',
  setEmotion: (emotion) => set({ currentEmotion: emotion }),

  voicevoxStatus: 'checking',
  setVoicevoxStatus: (status) => set({ voicevoxStatus: status }),

  isLive: false,
  setIsLive: (live) => set({ isLive: live }),
}))
