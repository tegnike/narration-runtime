import { useCallback, useEffect, useRef } from 'react'
import { useStreamStore } from '../store/stream-store'
import { VOICEVOX_SPEAKER_ID, VOICEVOX_SPEAKERS, WS_URL } from '../constants'
import { normalizeNarrationEmotion } from '../services/narration-emotion'
import type {
  NarrationSayMessage,
  NarrationServerMessage,
  NarrationStatusMessage,
} from '../types'
import type { TTSPipeline } from '../services/tts-pipeline'

const RECONNECT_CONFIG = {
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
}

function speakerIdFor(message: NarrationSayMessage): number {
  if (message.speaker && VOICEVOX_SPEAKERS[message.speaker]) {
    return VOICEVOX_SPEAKERS[message.speaker]
  }
  if (message.speaker === 'zundamon') {
    const emotion = message.emotion ?? 'normal'
    const style =
      emotion === 'joy' || emotion === 'happy'
        ? 'zundamon_joy'
        : emotion === 'angry'
          ? 'zundamon_angry'
          : emotion === 'sad'
            ? 'zundamon_sad'
            : 'zundamon_normal'
    return VOICEVOX_SPEAKERS[style]
  }
  return VOICEVOX_SPEAKER_ID
}

export function useWebSocket(pipeline: TTSPipeline) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(RECONNECT_CONFIG.initialDelay)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const playbackQueue = useRef(Promise.resolve())
  const currentAbortController = useRef<AbortController | null>(null)

  const {
    setConnectionStatus,
    addEventLog,
    setIsLive,
    setEmotion,
  } = useStreamStore()

  const send = useCallback((message: NarrationStatusMessage | { type: 'narration:hello'; role: 'ui'; clientName: string }) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }, [])

  const playMessage = useCallback(async (msg: NarrationSayMessage) => {
    const emotion = normalizeNarrationEmotion(msg.emotion)

    if (msg.interrupt) {
      currentAbortController.current?.abort()
      pipeline.reset()
    }

    const controller = new AbortController()
    currentAbortController.current = controller
    setEmotion(emotion)
    send({ type: 'narration:started', id: msg.id, timestamp: Date.now() })
    addEventLog('say', msg.text.substring(0, 100))

    try {
      const durationMs = await pipeline.speakUtterance(
        msg.text,
        speakerIdFor(msg),
        controller.signal,
      )
      send({
        type: 'narration:completed',
        id: msg.id,
        durationMs,
        timestamp: Date.now(),
      })
    } catch (err) {
      send({
        type: 'narration:failed',
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      })
    } finally {
      if (currentAbortController.current === controller) {
        currentAbortController.current = null
      }
      setEmotion('neutral')
    }
  }, [addEventLog, pipeline, send, setEmotion])

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as NarrationServerMessage
        switch (msg.type) {
          case 'narration:ready':
            addEventLog('system', `Relay ready (UI clients: ${msg.uiClients})`)
            setIsLive(true)
            break
          case 'narration:state':
            addEventLog('state', `pending=${msg.pendingCount} ui=${msg.uiClients}`)
            break
          case 'narration:say':
            if (msg.interrupt) {
              currentAbortController.current?.abort()
              pipeline.reset()
              playbackQueue.current = Promise.resolve()
            }
            playbackQueue.current = playbackQueue.current.then(() => playMessage(msg))
            break
          case 'narration:started':
          case 'narration:completed':
          case 'narration:failed':
          case 'narration:skipped':
            break
          case 'error':
            addEventLog('error', msg.message)
            break
        }
      } catch {
        // Invalid message
      }
    },
    [addEventLog, pipeline, playMessage, setIsLive],
  )

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    setConnectionStatus('connecting')
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnectionStatus('connected')
      reconnectDelay.current = RECONNECT_CONFIG.initialDelay
      addEventLog('system', 'Narration WebSocket connected')
      send({ type: 'narration:hello', role: 'ui', clientName: 'narration-ui' })
    }

    ws.onmessage = handleMessage

    ws.onclose = () => {
      if (!mountedRef.current) return
      if (wsRef.current !== ws) return
      setConnectionStatus('reconnecting')
      addEventLog('system', 'Narration WebSocket disconnected, reconnecting...')
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null
        connect()
      }, reconnectDelay.current)
      reconnectDelay.current = Math.min(
        reconnectDelay.current * RECONNECT_CONFIG.backoffMultiplier,
        RECONNECT_CONFIG.maxDelay,
      )
    }

    ws.onerror = () => {
      // onclose will fire after this
    }
  }, [setConnectionStatus, addEventLog, handleMessage, send])

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      currentAbortController.current?.abort()
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
      wsRef.current?.close()
    }
  }, [connect])
}
