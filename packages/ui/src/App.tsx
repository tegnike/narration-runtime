import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTTS } from './hooks/useTTS'
import { useWebSocket } from './hooks/useWebSocket'
import { CharacterDisplay } from './components/CharacterDisplay'
import { EventLog } from './components/EventLog'
import { Subtitle } from './components/Subtitle'
import { ConnectionStatus } from './components/ConnectionStatus'
import { useStreamStore } from './store/stream-store'
import type { TTSPipeline } from './services/tts-pipeline'

const MAIN_GAP_PX = 8
const DIALOGUE_HEIGHT_PX = 105
const MIN_SIDEBAR_WIDTH_PX = 220

type LayoutVars = CSSProperties & {
  '--game-width': string
  '--game-height': string
  '--sidebar-width': string
}

function calculateLayoutVars(width: number, height: number): LayoutVars {
  const maxGameWidthByWidth = Math.max(0, width - MAIN_GAP_PX - MIN_SIDEBAR_WIDTH_PX)
  const maxGameWidthByHeight = Math.max(
    0,
    (height - MAIN_GAP_PX - DIALOGUE_HEIGHT_PX) * (16 / 9),
  )
  const gameWidth = Math.min(maxGameWidthByWidth, maxGameWidthByHeight)
  const gameHeight = gameWidth * (9 / 16)
  const sidebarWidth = Math.max(MIN_SIDEBAR_WIDTH_PX, width - MAIN_GAP_PX - gameWidth)

  return {
    '--game-width': `${gameWidth.toFixed(3)}px`,
    '--game-height': `${gameHeight.toFixed(3)}px`,
    '--sidebar-width': `${sidebarWidth.toFixed(3)}px`,
  }
}

function NarrationLayout({ pipeline }: { pipeline: TTSPipeline }) {
  useWebSocket(pipeline)

  const mainRef = useRef<HTMLDivElement>(null)
  const [layoutVars, setLayoutVars] = useState<LayoutVars>(() =>
    calculateLayoutVars(1024, 576),
  )
  const isSpeaking = useStreamStore((s) => s.isSpeaking)
  const isTTSBusy = useStreamStore((s) => s.isTTSBusy)
  const voicevoxStatus = useStreamStore((s) => s.voicevoxStatus)

  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    const update = () => {
      const style = window.getComputedStyle(el)
      const width =
        el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const height =
        el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      setLayoutVars(calculateLayoutVars(width, height))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-black">
      <div
        className="biim-layout flex flex-col overflow-hidden"
        style={{
          width: 'min(100vw, calc(100vh / 9 * 16))',
          height: 'min(100vh, calc(100vw / 16 * 9))',
        }}
      >
        <div ref={mainRef} className="biim-main" style={layoutVars}>
          <div
            className="biim-game-area biim-border biim-border-inset bg-black"
            data-testid="biim-game-area"
          />

          <div className="biim-dialogue-cell">
            <Subtitle />
          </div>

          <div className="biim-sidebar">
            <div className="biim-section biim-border biim-status-section">
              <div className="biim-section-title">ナレーション</div>
              <div className="biim-section-content text-xs space-y-1">
                <div className="biim-connection-row">
                  <span>接続:</span>
                  <div className="biim-connection-status">
                    <ConnectionStatus />
                  </div>
                </div>
                <div className="flex justify-between">
                  <span>VOICEVOX:</span>
                  <span>{voicevoxStatus}</span>
                </div>
                <div className="flex justify-between">
                  <span>再生:</span>
                  <span className={isSpeaking || isTTSBusy ? 'text-green-600 font-bold' : ''}>
                    {isSpeaking || isTTSBusy ? 'speaking' : 'idle'}
                  </span>
                </div>
              </div>
            </div>

            <div className="biim-section biim-border flex-1 flex flex-col min-h-0">
              <div className="biim-section-title">イベント</div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <EventLog />
              </div>
            </div>

            <div className="biim-section biim-border biim-character-panel">
              <CharacterDisplay />
            </div>
          </div>
        </div>

        <div className="biim-panel biim-border flex items-center gap-4 px-4 py-2">
          <div className="text-xs text-black">Narration Runtime UI</div>
          <div className="flex-1" />
          <div className="flex items-center text-xs text-black">
            <span
              className={`biim-status-dot ${isSpeaking || isTTSBusy ? 'biim-status-ok biim-blink' : 'biim-status-warn'}`}
            />
            <span>{isSpeaking || isTTSBusy ? 'LIVE' : 'STANDBY'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [audioReady, setAudioReady] = useState(false)
  const pipeline = useTTS()
  const setVoicevoxStatus = useStreamStore((s) => s.setVoicevoxStatus)

  const handleStart = useCallback(async () => {
    await pipeline.audioPlayer.initialize()
    setVoicevoxStatus('connected')
    setAudioReady(true)
  }, [pipeline, setVoicevoxStatus])

  if (!audioReady) {
    return (
      <div className="h-screen flex items-center justify-center biim-layout">
        <div className="biim-panel biim-border p-0">
          <div className="biim-title">Narration Runtime UI</div>
          <div className="p-8 text-center">
            <div className="mb-4 text-lg" style={{ color: '#000' }}>
              WebSocket ナレーションUI
            </div>
            <button
              onClick={handleStart}
              className="biim-border px-8 py-3 bg-[#c0c0c0] hover:bg-[#d0d0d0] text-black font-bold cursor-pointer active:biim-border-inset"
              style={{ fontFamily: "'DotGothic16', 'MS Gothic', monospace" }}
            >
              音声を有効化
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <NarrationLayout pipeline={pipeline} />
}

export default App
