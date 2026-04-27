import { useState, useEffect, useRef } from 'react'
import { useStreamStore } from '../store/stream-store'

export function Subtitle() {
  const currentSubtitle = useStreamStore((s) => s.currentSubtitle)
  const isSpeaking = useStreamStore((s) => s.isSpeaking)
  const isTTSBusy = useStreamStore((s) => s.isTTSBusy)
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
    const shouldStayVisible = Boolean(currentSubtitle) || isSpeaking || isTTSBusy
    if (shouldStayVisible && displayText) {
      setVisible(true)
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current)
        fadeTimerRef.current = null
      }
      return
    }
    if (displayText) {
      fadeTimerRef.current = setTimeout(() => {
        setVisible(false)
      }, 2000)
    }
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current)
      }
    }
  }, [currentSubtitle, isSpeaking, isTTSBusy, displayText])

  return (
    <div className="biim-dialogue biim-border biim-border-inset">
      <div
        className={`biim-dialogue-content transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="biim-dialogue-text">
          {displayText}
        </div>
      </div>
    </div>
  )
}
