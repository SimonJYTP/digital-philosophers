export type DebateSpeechPhase = "opening" | "debate" | "closing";

export type DebateTranscriptEntry = Readonly<{
  id: string;
  role: "user" | "philosopher";
  speakerId?: string;
  text: string;
  phase: DebateSpeechPhase | "interjection";
}>;

export type DebateRequest = Readonly<{
  participantIds: string[];
  topic: string;
  transcript: DebateTranscriptEntry[];
  phase: DebateSpeechPhase;
  requestedSpeakerId?: string;
  respondToInterjectionId?: string;
}>;

export const DEBATE_SPEECH_COMPLETE_MARKER = "\u001e";

const SENTENCE_TERMINATORS = new Set([".", "!", "?", "。", "！", "？"]);
const SENTENCE_CLOSERS = new Set([
  '"',
  "'",
  "”",
  "’",
  "）",
  ")",
  "]",
  "}",
  "*",
  "_",
  "`",
  "~",
]);

function isSentenceTerminator(text: string, index: number): boolean {
  const character = text[index];

  if (!SENTENCE_TERMINATORS.has(character)) {
    return false;
  }

  if (character !== ".") {
    return true;
  }

  const previous = text[index - 1];
  const next = text[index + 1];

  if (previous === "." || next === ".") {
    return false;
  }

  if (/\d/.test(previous ?? "") && /\d/.test(next ?? "")) {
    return false;
  }

  return true;
}

export function completeSentencePrefixLength(text: string): number {
  let lastCompleteIndex = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (!isSentenceTerminator(text, index)) {
      continue;
    }

    let boundary = index + 1;

    while (
      boundary < text.length &&
      (SENTENCE_CLOSERS.has(text[boundary]) ||
        /\s/.test(text[boundary]))
    ) {
      boundary += 1;
    }

    lastCompleteIndex = boundary;
  }

  return lastCompleteIndex;
}

export function endsWithCompleteSentence(text: string): boolean {
  return (
    text.trim().length > 0 &&
    completeSentencePrefixLength(text) === text.length
  );
}
