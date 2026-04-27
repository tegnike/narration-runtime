import { VOICEVOX_URL } from '../constants'

export async function synthesizeVoice(
  text: string,
  speakerId: number,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  // Step 1: audio_query
  const queryRes = await fetch(
    `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
    { method: 'POST', signal },
  )
  if (!queryRes.ok) throw new Error(`audio_query failed: ${queryRes.status}`)
  const query = await queryRes.json()
  query.speedScale = 1.1

  // Step 2: synthesis
  const synthRes = await fetch(
    `${VOICEVOX_URL}/synthesis?speaker=${speakerId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
      signal,
    },
  )
  if (!synthRes.ok) throw new Error(`synthesis failed: ${synthRes.status}`)
  return synthRes.arrayBuffer()
}

export async function checkVoicevoxHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${VOICEVOX_URL}/version`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}
