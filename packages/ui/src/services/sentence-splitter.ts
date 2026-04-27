/**
 * 文末句読点・改行でテキストを分割する。
 * - 日本語句読点: 。！？
 * - 半角句読点: .!? （ただし数字に挟まれた . は除外）
 * - 改行: \n（AI出力で句読点なしの行区切りが多い）
 * - 連続する句読点はグループ化 (!? → 1つの区切り)
 */
export function extractSentences(buffer: string): {
  sentences: string[]
  remainder: string
} {
  const sentences: string[] = []
  let pos = 0

  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i]

    // 改行を文境界として扱う
    if (char === '\n') {
      const sentence = buffer.slice(pos, i).trim()
      if (sentence.length >= 2) {
        sentences.push(sentence)
      }
      pos = i + 1
      continue
    }

    // 句読点チェック（数字.数字 / ファイル拡張子 パターンを除外）
    if (
      /[。！？]/.test(char) ||
      (/[.!?]/.test(char) &&
        !(
          i > 0 &&
          /\d/.test(buffer[i - 1]) &&
          i + 1 < buffer.length &&
          /\d/.test(buffer[i + 1])
        ) &&
        !(
          char === '.' &&
          i + 1 < buffer.length &&
          /[a-zA-Z]/.test(buffer[i + 1])
        ))
    ) {
      // 連続する句読点をスキップ
      while (
        i + 1 < buffer.length &&
        /[。．.！!？?…]/.test(buffer[i + 1])
      ) {
        i++
      }

      const sentence = buffer.slice(pos, i + 1).trim()
      if (sentence.length >= 2) {
        sentences.push(sentence)
        pos = i + 1
      }
    }
  }

  return { sentences, remainder: buffer.slice(pos) }
}
