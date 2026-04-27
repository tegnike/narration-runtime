export function extractSentences(buffer: string): {
  sentences: string[];
  remainder: string;
} {
  const sentences: string[] = [];
  let pos = 0;

  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i];

    if (char === "\n") {
      const sentence = buffer.slice(pos, i).trim();
      if (sentence.length >= 2) {
        sentences.push(sentence);
      }
      pos = i + 1;
      continue;
    }

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
          char === "." &&
          i + 1 < buffer.length &&
          /[a-zA-Z]/.test(buffer[i + 1])
        ))
    ) {
      while (
        i + 1 < buffer.length &&
        /[。．.！!？?…]/.test(buffer[i + 1])
      ) {
        i++;
      }

      const sentence = buffer.slice(pos, i + 1).trim();
      if (sentence.length >= 2) {
        sentences.push(sentence);
        pos = i + 1;
      }
    }
  }

  return { sentences, remainder: buffer.slice(pos) };
}
