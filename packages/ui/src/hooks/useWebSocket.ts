import { useCallback, useEffect, useRef } from 'react'
import { useStreamStore } from '../store/stream-store'
import { VOICEVOX_SPEAKER_ID, VOICEVOX_SPEAKERS, WS_URL } from '../constants'
import { normalizeNarrationEmotion } from '../services/narration-emotion'
import type {
  NarrationSayMessage,
  NarrationServerMessage,
  NarrationStatusReason,
  NarrationStatusMessage,
} from '../types'
import type { TTSPipeline } from '../services/tts-pipeline'
import type { VoiceSynthesisOptions } from '../services/voicevox-client'

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

interface QueuedMessage {
  message: NarrationSayMessage;
  enqueuedAt: number;
  sequence: number;
}

interface AbortReason {
  reason: NarrationStatusReason;
  error: string;
}

function priorityFor(message: NarrationSayMessage): number {
  return Number.isFinite(message.priority) ? message.priority! : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function synthesisOptionsFor(message: NarrationSayMessage): VoiceSynthesisOptions {
  const speedScale =
    typeof message.pace === 'number'
      ? clamp(message.pace, 0.5, 2)
      : message.pace === 'slow'
        ? 0.9
        : message.pace === 'fast'
          ? 1.25
          : 1.1

  const intensity =
    typeof message.intensity === 'number'
      ? clamp(message.intensity, 0, 2)
      : message.intensity === 'low'
        ? 0.8
        : message.intensity === 'high'
          ? 1.2
          : 1

  return {
    speedScale,
    intonationScale: clamp(intensity, 0.5, 2),
    volumeScale: clamp(0.85 + intensity * 0.15, 0.5, 2),
  }
}

function subtitleDurationMs(text: string): number {
  return clamp(800 + text.length * 45, 1000, 3500)
}

function logPreview(text: string, maxLength = 180): string {
  const trimmed = text.trim()
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed
}

function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

export function useWebSocket(pipeline: TTSPipeline) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelay = useRef(RECONNECT_CONFIG.initialDelay)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const queuedMessages = useRef<QueuedMessage[]>([])
  const currentMessage = useRef<NarrationSayMessage | null>(null)
  const currentAbortController = useRef<AbortController | null>(null)
  const currentAbortReason = useRef<AbortReason | null>(null)
  const processingPlayback = useRef(false)
  const queueSequence = useRef(0)

  const {
    setConnectionStatus,
    addEventLog,
    addThoughtLog,
    setIsLive,
    setEmotion,
    setSubtitle,
  } = useStreamStore()

  const send = useCallback((message: NarrationStatusMessage | { type: 'narration:hello'; role: 'ui'; clientName: string }) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }, [])

  const sendSkipped = useCallback((id: string, reason: NarrationStatusReason, error: string) => {
    send({
      type: 'narration:skipped',
      id,
      reason,
      error,
      timestamp: Date.now(),
    })
  }, [send])

  const skipQueuedMessages = useCallback((reason: NarrationStatusReason, error: string) => {
    const skipped = queuedMessages.current.splice(0)
    for (const item of skipped) {
      sendSkipped(item.message.id, reason, error)
    }
  }, [sendSkipped])

  const playMessage = useCallback(async (msg: NarrationSayMessage) => {
    const emotion = normalizeNarrationEmotion(msg.emotion)

    const controller = new AbortController()
    currentAbortController.current = controller
    currentMessage.current = msg
    setEmotion(emotion)
    send({ type: 'narration:started', id: msg.id, timestamp: Date.now() })
    if (msg.thought?.trim()) {
      addThoughtLog(msg.thought)
      addEventLog('thought', logPreview(msg.thought))
    }
    addEventLog('say', logPreview(msg.text, 100))

    try {
      let durationMs = 0
      let reason: NarrationStatusReason = 'ui_completed'
      if (msg.subtitleOnly) {
        setSubtitle(msg.text)
        await waitFor(subtitleDurationMs(msg.text), controller.signal)
        setSubtitle('')
        reason = 'subtitle_only'
      } else {
        durationMs = await pipeline.speakUtterance(
          msg.text,
          speakerIdFor(msg),
          controller.signal,
          synthesisOptionsFor(msg),
        )
      }
      send({
        type: 'narration:completed',
        id: msg.id,
        durationMs,
        reason,
        timestamp: Date.now(),
      })
    } catch (err) {
      if (controller.signal.aborted) {
        const abortReason = currentAbortReason.current ?? {
          reason: 'interrupted' as const,
          error: 'Narration was interrupted',
        }
        sendSkipped(msg.id, abortReason.reason, abortReason.error)
      } else {
        send({
          type: 'narration:failed',
          id: msg.id,
          reason: 'ui_failed',
          error: err instanceof Error ? err.message : String(err),
          timestamp: Date.now(),
        })
      }
    } finally {
      if (currentAbortController.current === controller) {
        currentAbortController.current = null
      }
      if (currentMessage.current?.id === msg.id) {
        currentMessage.current = null
      }
      currentAbortReason.current = null
      setEmotion('neutral')
    }
  }, [addEventLog, addThoughtLog, pipeline, send, sendSkipped, setEmotion, setSubtitle])

  const processPlaybackQueue = useCallback(async () => {
    if (processingPlayback.current) return
    processingPlayback.current = true

    try {
      while (queuedMessages.current.length > 0) {
        queuedMessages.current.sort((a, b) => {
          const priorityDiff = priorityFor(b.message) - priorityFor(a.message)
          return priorityDiff || a.sequence - b.sequence
        })
        const next = queuedMessages.current.shift()!
        const maxQueueMs = next.message.maxQueueMs
        if (maxQueueMs !== undefined && Date.now() - next.enqueuedAt > maxQueueMs) {
          sendSkipped(next.message.id, 'queue_expired', 'Narration expired before playback started')
          continue
        }
        await playMessage(next.message)
      }
    } finally {
      processingPlayback.current = false
      if (queuedMessages.current.length > 0) {
        void processPlaybackQueue()
      }
    }
  }, [playMessage, sendSkipped])

  const enqueueMessage = useCallback((msg: NarrationSayMessage) => {
    const busy = currentMessage.current !== null || queuedMessages.current.length > 0
    const incomingPriority = priorityFor(msg)

    if (msg.interrupt) {
      currentAbortReason.current = { reason: 'interrupted', error: 'Narration was interrupted' }
      currentAbortController.current?.abort()
      pipeline.reset()
      skipQueuedMessages('interrupted', 'Narration was interrupted')
    } else if (msg.queuePolicy === 'dropIfBusy' && busy) {
      sendSkipped(msg.id, 'queue_drop_busy', 'Narration was dropped because playback is busy')
      return
    } else if (msg.queuePolicy === 'replaceIfHigherPriority' && busy) {
      const activePriority = Math.max(
        currentMessage.current ? priorityFor(currentMessage.current) : Number.NEGATIVE_INFINITY,
        ...queuedMessages.current.map((item) => priorityFor(item.message)),
      )
      if (incomingPriority <= activePriority) {
        sendSkipped(msg.id, 'queue_drop_busy', 'Narration was dropped because an equal or higher priority item is active')
        return
      }
      currentAbortReason.current = {
        reason: 'queue_replaced_by_priority',
        error: 'Narration was replaced by a higher priority item',
      }
      currentAbortController.current?.abort()
      pipeline.reset()
      skipQueuedMessages('queue_replaced_by_priority', 'Narration was replaced by a higher priority item')
    }

    queuedMessages.current.push({
      message: msg,
      enqueuedAt: Date.now(),
      sequence: ++queueSequence.current,
    })
    void processPlaybackQueue()
  }, [pipeline, processPlaybackQueue, sendSkipped, skipQueuedMessages])

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
            enqueueMessage(msg)
            break
          case 'narration:suppressed':
            addEventLog('suppressed', msg.reason ? `${msg.reason}: ${msg.text ?? ''}` : (msg.text ?? msg.id))
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
    [addEventLog, enqueueMessage, setIsLive],
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
      skipQueuedMessages('interrupted', 'Narration UI unmounted')
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
      wsRef.current?.close()
    }
  }, [connect, skipQueuedMessages])
}
