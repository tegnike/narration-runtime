import { useState, useEffect, useRef } from 'react'
import type { NarrationEmotion } from '../types'

export function useCharacterAnimation(isSpeaking: boolean, emotion: NarrationEmotion) {
  const [state, setState] = useState({ mouthOpen: false, eyeOpen: true, bounceY: 0 })
  const startTimeRef = useRef(performance.now())

  useEffect(() => {
    let animId: number
    const FPS = 30
    const FRAME_INTERVAL = 1000 / FPS

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current
      const frame = Math.floor(elapsed / FRAME_INTERVAL)

      // 口パク: ~6fpsで切替（発話中のみ）
      const mouthOpen = isSpeaking ? Math.floor(frame / 5) % 2 === 0 : false
      // まばたき: 素数周期の決定論的パターン
      const eyeOpen = !(frame % 97 >= 91 || frame % 131 >= 125)
      // バウンス: 発話中のみ
      const bounceY = isSpeaking ? Math.sin(frame * 0.3) * 3 : 0

      setState({ mouthOpen, eyeOpen, bounceY })
      animId = requestAnimationFrame(animate)
    }

    animId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animId)
  }, [isSpeaking])

  const imagePath = `${emotion}/eye${state.eyeOpen ? 'ON' : 'OFF'}_mouth_${state.mouthOpen ? 'ON' : 'OFF'}.png`
  return { imagePath, bounceY: state.bounceY }
}
