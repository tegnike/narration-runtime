export class AudioPlayer {
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private _isSpeaking = false
  private onStateChange: ((speaking: boolean) => void) | null = null

  /** ユーザージェスチャー内で呼ぶこと */
  async initialize(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
    console.debug('[AudioPlayer] initialized, state:', this.audioContext.state)
    return this.audioContext
  }

  get isReady(): boolean {
    return this.audioContext !== null && this.audioContext.state === 'running'
  }

  get isSpeaking(): boolean {
    return this._isSpeaking
  }

  setOnStateChange(cb: (speaking: boolean) => void) {
    this.onStateChange = cb
  }

  async play(wavData: ArrayBuffer): Promise<void> {
    if (!this.audioContext) throw new Error('AudioContext not initialized')

    // suspended 状態なら resume を試みる
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }

    // decodeAudioData はArrayBufferをdetachするので複製
    const buffer = await this.audioContext.decodeAudioData(wavData.slice(0))
    return new Promise<void>((resolve) => {
      const source = this.audioContext!.createBufferSource()
      source.buffer = buffer
      source.connect(this.audioContext!.destination)

      this.currentSource = source
      this._isSpeaking = true
      this.onStateChange?.(true)

      source.onended = () => {
        this.currentSource = null
        this._isSpeaking = false
        this.onStateChange?.(false)
        resolve()
      }
      source.start()
    })
  }

  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop()
      } catch {
        /* already stopped */
      }
      this.currentSource = null
      this._isSpeaking = false
      this.onStateChange?.(false)
    }
  }

  dispose(): void {
    this.stop()
    this.audioContext?.close()
    this.audioContext = null
  }
}
