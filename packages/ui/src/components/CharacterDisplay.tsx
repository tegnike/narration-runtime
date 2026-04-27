import { useEffect } from 'react'
import { useStreamStore } from '../store/stream-store'
import { useCharacterAnimation } from '../hooks/useCharacterAnimation'
import { NARRATION_EMOTIONS } from '../services/narration-emotion'

const IMAGE_NAMES = [
  'eyeON_mouth_OFF',
  'eyeON_mouth_ON',
  'eyeOFF_mouth_OFF',
  'eyeOFF_mouth_ON',
]

export function CharacterDisplay() {
  const isSpeaking = useStreamStore((s) => s.isSpeaking)
  const emotion = useStreamStore((s) => s.currentEmotion)
  const { imagePath, bounceY } = useCharacterAnimation(isSpeaking, emotion)

  // プリロード
  useEffect(() => {
    NARRATION_EMOTIONS.forEach((emotionName) => {
      IMAGE_NAMES.forEach((name) => {
        new Image().src = `/images/nikechan/${emotionName}/${name}.png`
      })
    })
  }, [])

  return (
    <div
      className="biim-character"
      style={{ transform: `translateY(${bounceY}px)` }}
    >
      <img
        src={`/images/nikechan/${imagePath}`}
        alt="nikechan"
        className="biim-character-image object-contain"
      />
    </div>
  )
}
