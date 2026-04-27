import { useEffect, useRef } from 'react'
import { useStreamStore } from '../store/stream-store'

export function EventLog() {
  const eventLog = useStreamStore((s) => s.eventLog)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自動スクロール
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [eventLog])

  return (
    <div
      ref={scrollRef}
      className="biim-log h-full"
    >
      {eventLog.length === 0 ? (
        <div className="text-center py-2" style={{ color: '#666' }}>
          &gt; Waiting for narration...
        </div>
      ) : (
        eventLog.slice(-50).map((entry, i) => (
          <div
            key={i}
            className="biim-log-entry"
            style={{ color: '#cccccc', whiteSpace: 'normal', wordBreak: 'break-word' }}
          >
            [{entry.type}] {entry.content}
          </div>
        ))
      )}
    </div>
  )
}
