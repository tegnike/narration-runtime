import { useCallback, useState } from 'react'
import { useTTS } from './hooks/useTTS'
import { useWebSocket } from './hooks/useWebSocket'
import { CharacterDisplay } from './components/CharacterDisplay'
import { EventLog } from './components/EventLog'
import { Subtitle } from './components/Subtitle'
import { ConnectionStatus } from './components/ConnectionStatus'
import { useStreamStore } from './store/stream-store'
import type { TTSPipeline } from './services/tts-pipeline'

function NarrationLayout({ pipeline }: { pipeline: TTSPipeline }) {
  useWebSocket(pipeline)

  const isSpeaking = useStreamStore((s) => s.isSpeaking)
  const isTTSBusy = useStreamStore((s) => s.isTTSBusy)
  const voicevoxStatus = useStreamStore((s) => s.voicevoxStatus)

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-black">
      <div
        className="biim-layout flex flex-col overflow-hidden"
        style={{
          width: 'min(100vw, calc(100vh / 9 * 16))',
          height: 'min(100vh, calc(100vw / 16 * 9))',
        }}
      >
        <div className="flex-1 min-h-0 flex p-2 gap-2">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="biim-border biim-border-inset bg-black relative flex-1 min-h-0">
              <div className="absolute inset-0 flex items-center justify-center px-8">
                <Subtitle />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 min-h-0" style={{ width: '340px', flexShrink: 0 }}>
            <div className="biim-section biim-border">
              <div className="biim-section-title">ナレーション</div>
              <div className="biim-section-content text-xs space-y-1">
                <div className="flex justify-between">
                  <span>接続:</span>
                  <ConnectionStatus />
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

            <div className="biim-section biim-border">
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
