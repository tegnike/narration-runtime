import { useState, useEffect, useRef } from 'react'
import { useStreamStore } from '../store/stream-store'

export function Subtitle() {
  const currentSubtitle = useStreamStore((s) => s.currentSubtitle)
  const isSpeaking = useStreamStore((s) => s.isSpeaking)
  const [visible, setVisible] = useState(false)
  const [displayText, setDisplayText] = useState('')
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (currentSubtitle) {
      setDisplayText(currentSubtitle)
      setVisible(true)
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = null
      }
    }
  }, [currentSubtitle])

  useEffect(() => {
    if (!isSpeaking && displayText) {
      fadeTimerRef.current = setTimeout(() => {
        setVisible(false)
      }, 2000)
    }
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current)
      }
    }
  }, [isSpeaking, displayText])

  if (!displayText) return null

  return (
    <div
      className={`transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div className="biim-subtitle max-w-2xl mx-auto">
        {displayText}
      </div>
    </div>
  )
}
