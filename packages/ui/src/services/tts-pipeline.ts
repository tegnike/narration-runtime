import type { TTSSentence } from '../types'
import { VOICEVOX_SPEAKER_ID, FLUSH_TIMEOUT_MS, MAX_TTS_QUEUE } from '../constants'
import { extractSentences } from './sentence-splitter'
import { synthesizeVoice } from './voicevox-client'
import type { VoiceSynthesisOptions } from './voicevox-client'
import type { AudioPlayer } from './audio-player'

export class TTSPipeline {
  private generationId = 0
  private textBuffer = ''
  private queue: TTSSentence[] = []
  private isProcessing = false
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private currentAbortController: AbortController | null = null
  private hasTextInCurrentGen = false
  audioPlayer: AudioPlayer
  onSubtitleChange: ((text: string) => void) | null = null
  onBusyChange: ((busy: boolean) => void) | null = null
  private lastBusyState = false

  constructor(audioPlayer: AudioPlayer) {
    this.audioPlayer = audioPlayer
  }

  get isBusy(): boolean {
    return (
      this.textBuffer.length > 0 ||
      this.queue.some((s) => s.status !== 'done' && s.status !== 'cancelled') ||
      this.isProcessing ||
      this.audioPlayer.isSpeaking
    )
  }

  private notifyBusyChange(): void {
    const busy = this.isBusy
    if (busy !== this.lastBusyState) {
      this.lastBusyState = busy
      this.onBusyChange?.(busy)
    }
  }

  /** テキストデルタ受信時（agent:activity type "text" のcontent） */
  onTextDelta(delta: string): void {
    this.hasTextInCurrentGen = true
    this.textBuffer += delta
    this.resetFlushTimer()

    const { sentences, remainder } = extractSentences(this.textBuffer)
    this.textBuffer = remainder

    for (const text of sentences) {
      console.debug('[TTS] enqueue sentence:', text.substring(0, 50))
      this.enqueueSentence(text, this.generationId)
    }
    this.scheduleProcessQueue()
    this.notifyBusyChange()
  }

  async speakUtterance(
    text: string,
    speakerId: number = VOICEVOX_SPEAKER_ID,
    signal?: AbortSignal,
    options: VoiceSynthesisOptions = {},
  ): Promise<number> {
    const trimmed = text.trim()
    if (!trimmed) return 0
    if (!this.audioPlayer.isReady) {
      throw new Error('Audio player is not initialized')
    }

    const startedAt = performance.now()
    this.isProcessing = true
    this.onSubtitleChange?.(trimmed)
    this.notifyBusyChange()

    try {
      const audioData = await synthesizeVoice(trimmed, speakerId, signal, options)
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      if (!signal) {
        await this.audioPlayer.play(audioData)
        return Math.round(performance.now() - startedAt)
      }
      let onAbort: (() => void) | null = null
      const abortPromise = new Promise<never>((_, reject) => {
        onAbort = () => {
          this.audioPlayer.stop()
          reject(new DOMException('Aborted', 'AbortError'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
      })
      try {
        await Promise.race([this.audioPlayer.play(audioData), abortPromise])
      } finally {
        if (onAbort) {
          signal.removeEventListener('abort', onAbort)
        }
      }
      return Math.round(performance.now() - startedAt)
    } finally {
      this.isProcessing = false
      this.onSubtitleChange?.('')
      this.notifyBusyChange()
    }
  }

  /** 新しい世代開始（ツールコール開始検出時） */
  onNewGeneration(): void {
    // テキストが来ていない世代では何もしない（連続ツール呼び出し対策）
    if (!this.hasTextInCurrentGen) return
    this.hasTextInCurrentGen = false

    console.debug('[TTS] new generation (had text), queue:', this.queue.length)

    // バッファ残余があれば旧世代のIDでenqueue（generationIdインクリメント前）
    if (this.textBuffer.trim().length > 0) {
      console.debug('[TTS] flushing buffer on gen change:', this.textBuffer.trim().substring(0, 50))
      this.enqueueSentence(this.textBuffer.trim(), this.generationId)
      this.textBuffer = ''
    } else {
      this.textBuffer = ''
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    this.generationId++

    // pending のキャンセルは行わない → processQueue 内で新世代テキスト到着時に遅延判断
    // 合成中の fetch も abort しない → 完了後に再生される
    // 再生中の音声も止めない → 自然に終了後、次の世代のキューに進む
    // 完了済みのみクリーンアップ
    this.queue = this.queue.filter(
      (s) => s.status !== 'done' && s.status !== 'cancelled',
    )

    this.scheduleProcessQueue()
    this.notifyBusyChange()
  }

  /** 完全リセット（WebSocket再接続時） */
  reset(): void {
    this.generationId++
    this.textBuffer = ''
    this.hasTextInCurrentGen = false
    // reset は完全停止なので abort + stop する
    this.currentAbortController?.abort()
    this.currentAbortController = null
    this.audioPlayer.stop()
    this.queue = []
    this.isProcessing = false
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.lastBusyState = false
    this.notifyBusyChange()
  }

  private enqueueSentence(text: string, genId: number): void {
    if (this.queue.length >= MAX_TTS_QUEUE) {
      const idx = this.queue.findIndex((s) => s.status === 'pending')
      if (idx >= 0) this.queue.splice(idx, 1)
    }
    this.queue.push({
      text,
      generationId: genId,
      status: 'pending',
      audioData: null,
    })
  }

  private resetFlushTimer(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      if (this.textBuffer.trim().length > 0) {
        console.debug('[TTS] flush timer: enqueue remainder:', this.textBuffer.trim().substring(0, 50))
        this.enqueueSentence(this.textBuffer.trim(), this.generationId)
        this.textBuffer = ''
        this.scheduleProcessQueue()
        this.notifyBusyChange()
      }
    }, FLUSH_TIMEOUT_MS)
  }

  /** processQueue を安全に起動する（isReady でなければリトライ付き） */
  private scheduleProcessQueue(): void {
    if (this.isProcessing) return

    if (!this.audioPlayer.isReady) {
      if (!this.retryTimer) {
        console.debug('[TTS] audioPlayer not ready, scheduling retry')
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null
          this.scheduleProcessQueue()
        }, 200)
      }
      return
    }

    this.processQueue()
  }

  /** メインの合成→再生ループ（再入防止） */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return
    if (!this.audioPlayer.isReady) return
    this.isProcessing = true

    console.debug('[TTS] processQueue started, queue size:', this.queue.length)

    try {
      while (true) {
        // 現在の世代を優先、なければ古い世代の pending も処理
        let next = this.queue.find(
          (s) =>
            s.status === 'pending' && s.generationId === this.generationId,
        )
        if (!next) {
          next = this.queue.find((s) => s.status === 'pending')
        }
        if (!next) break

        // === 合成フェーズ ===
        console.debug('[TTS] synthesizing:', next.text.substring(0, 50), `(gen ${next.generationId})`)
        next.status = 'synthesizing'
        const controller = new AbortController()
        this.currentAbortController = controller

        try {
          next.audioData = await synthesizeVoice(
            next.text,
            VOICEVOX_SPEAKER_ID,
            controller.signal,
          )
          next.status = 'ready'
        } catch (err) {
          if (controller.signal.aborted) {
            next.status = 'cancelled'
            continue
          }
          console.error('[TTS] VOICEVOX synthesis error:', err)
          next.status = 'done'
          continue
        } finally {
          this.currentAbortController = null
        }

        // 合成完了後: 新しい世代の pending があれば、この古い世代はスキップ
        const newerPending = this.queue.some(
          (s) => s.status === 'pending' && s.generationId > next!.generationId,
        )
        if (newerPending) {
          console.debug('[TTS] skipping old gen item, newer text available')
          next.status = 'cancelled'
          next.audioData = null
          continue
        }

        // 他の文が再生中なら待つ
        while (this.audioPlayer.isSpeaking) {
          await new Promise((r) => setTimeout(r, 50))
          // 待ち中に新しい世代の pending が来たら割り込み
          const shouldInterrupt = this.queue.some(
            (s) => s.status === 'pending' && s.generationId > next!.generationId,
          )
          if (shouldInterrupt) {
            this.audioPlayer.stop()
            break
          }
        }

        // === 再生フェーズ ===
        // 再度チェック: 新しい世代が来ていたらスキップ
        const newerReady = this.queue.some(
          (s) => s.status === 'pending' && s.generationId > next!.generationId,
        )
        if (newerReady) {
          console.debug('[TTS] skipping playback, newer text arrived')
          next.status = 'cancelled'
          next.audioData = null
          continue
        }

        console.debug('[TTS] playing:', next.text.substring(0, 50))
        next.status = 'playing'
        this.onSubtitleChange?.(next.text)
        try {
          await this.audioPlayer.play(next.audioData!)
        } catch (err) {
          console.error('[TTS] Audio playback error:', err)
        }
        next.status = 'done'
        next.audioData = null

        // 完了済みをクリーンアップ
        this.queue = this.queue.filter(
          (s) => s.status !== 'done' && s.status !== 'cancelled',
        )
      }
    } finally {
      this.isProcessing = false
      this.notifyBusyChange()
      console.debug('[TTS] processQueue ended, remaining:', this.queue.length)
      const hasPending = this.queue.some((s) => s.status === 'pending')
      if (hasPending) {
        setTimeout(() => this.scheduleProcessQueue(), 0)
      }
    }
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.currentAbortController?.abort()
    this.queue = []
  }
}
