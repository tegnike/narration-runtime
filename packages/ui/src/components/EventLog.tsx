import { useEffect, useRef, useState } from 'react'
import { useStreamStore } from '../store/stream-store'

type LogTab = 'thought' | 'event'

export function EventLog() {
  const eventLog = useStreamStore((s) => s.eventLog)
  const thoughtLog = useStreamStore((s) => s.thoughtLog)
  const [activeTab, setActiveTab] = useState<LogTab>('thought')
  const scrollRef = useRef<HTMLDivElement>(null)

  // 自動スクロール
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [activeTab, eventLog, thoughtLog])

  return (
    <div className="biim-log-panel h-full">
      <div className="biim-log-tabs" role="tablist" aria-label="ログ種別">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'thought'}
          className={`biim-log-tab ${activeTab === 'thought' ? 'biim-log-tab-active' : ''}`}
          onClick={() => setActiveTab('thought')}
        >
          思考
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'event'}
          className={`biim-log-tab ${activeTab === 'event' ? 'biim-log-tab-active' : ''}`}
          onClick={() => setActiveTab('event')}
        >
          イベント
        </button>
      </div>

      <div
        ref={scrollRef}
        className={`biim-log ${activeTab === 'thought' ? 'biim-thought-log' : ''}`}
      >
        {activeTab === 'thought' ? (
          thoughtLog.length === 0 ? (
            <div className="text-center py-2" style={{ color: '#666' }}>
              &gt; Waiting for thought...
            </div>
          ) : (
            thoughtLog.slice(-50).map((entry, i) => (
              <div key={i} className="biim-thought-entry">
                <span className="biim-log-time">[{entry.time}]</span>
                {entry.content}
              </div>
            ))
          )
        ) : eventLog.length === 0 ? (
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
    </div>
  )
}
