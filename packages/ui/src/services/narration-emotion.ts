import type { NarrationEmotion } from '../types'

export const NARRATION_EMOTIONS: NarrationEmotion[] = [
  'neutral',
  'happy',
  'angry',
  'sad',
  'thinking',
]

export function normalizeNarrationEmotion(emotion?: string): NarrationEmotion {
  switch (emotion?.toLowerCase()) {
    case 'happy':
    case 'joy':
    case 'surprised':
      return 'happy'
    case 'angry':
      return 'angry'
    case 'sad':
      return 'sad'
    case 'thinking':
      return 'thinking'
    case 'neutral':
    case 'normal':
    default:
      return 'neutral'
  }
}
