import { useRef, useEffect } from 'react'
import { useStreamStore } from '../store/stream-store'
import { TTSPipeline } from '../services/tts-pipeline'
import { AudioPlayer } from '../services/audio-player'

export function useTTS(): TTSPipeline {
  const setIsSpeaking = useStreamStore((s) => s.setIsSpeaking)
  const setSubtitle = useStreamStore((s) => s.setSubtitle)
  const setIsTTSBusy = useStreamStore((s) => s.setIsTTSBusy)
  const pipelineRef = useRef<TTSPipeline | null>(null)

  if (!pipelineRef.current) {
    const player = new AudioPlayer()
    player.setOnStateChange((speaking) => setIsSpeaking(speaking))
    const pipeline = new TTSPipeline(player)
    pipeline.onSubtitleChange = (text) => setSubtitle(text)
    pipeline.onBusyChange = (busy) => setIsTTSBusy(busy)
    pipelineRef.current = pipeline
  }

  useEffect(() => {
    return () => {
      pipelineRef.current?.dispose()
      pipelineRef.current?.audioPlayer.dispose()
    }
  }, [])

  return pipelineRef.current
}
